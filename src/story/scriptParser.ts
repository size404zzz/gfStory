import type {
  Character, CharacterSprite,
} from '../types/character';
import type {
  GfStory, Line, OptionLine, SceneLine, TextLine,
} from '../types/lines';

export interface ScriptParseWarning {
  line: number;
  message: string;
  raw: string;
}

export interface ScriptParseStats {
  sourceLines: number;
  generatedLines: number;
  textLines: number;
  sceneLines: number;
  optionLines: number;
  characters: number;
}

export interface ScriptParseResult {
  story: GfStory;
  warnings: ScriptParseWarning[];
  stats: ScriptParseStats;
}

export interface ScriptParseOptions {
  /** Resolve an original game asset name to a browser-readable URL. */
  resolveMedia?: (type: 'background' | 'audio' | 'sprite', name: string) => string;
}

interface ParsedNarrator {
  speaker: string;
  sprites: string[];
  remote: Record<string, boolean>;
  characters: Array<{ name: string; sprite: string }>;
}

interface ParsedSourceLine {
  narrator: string;
  sprites: string[];
  remote: Record<string, boolean>;
  characters: Array<{ name: string; sprite: string }>;
  effects: Record<string, string>;
  content: string;
}

const CONTROL_TAGS = new Set([
  'speaker', 'c', 'r', 't', 'cg', 'va11', 'color', 'size',
]);

function hasExtension(value: string, extensions: string[]) {
  return extensions.some((extension) => value.toLowerCase().endsWith(extension));
}

function mediaUrl(
  type: 'background' | 'audio' | 'sprite',
  name: string,
  options: ScriptParseOptions,
  audioScene: 'audio' | 'se' = 'audio',
) {
  const value = name.trim().replace(/^['"]|['"]$/g, '');
  if (value === '') return '';
  if (value.startsWith('/') || /^https?:\/\//i.test(value) || value.includes(':')) {
    return value;
  }
  if (options.resolveMedia) {
    return options.resolveMedia(type, value);
  }
  if (type === 'background') {
    const path = value.startsWith('background/') ? value : `background/${value}`;
    return `/images/${hasExtension(path, ['.png', '.jpg', '.jpeg', '.webp']) ? path : `${path}.png`}`;
  }
  if (type === 'audio') {
    const path = value.includes('/') ? value : `${audioScene === 'se' ? 'se' : 'bgm'}/${value}`;
    return `/audio/${hasExtension(path, ['.m4a', '.mp3', '.ogg', '.wav']) ? path : `${path}.m4a`}`;
  }
  return `/images/${value}`;
}

function addWarning(
  warnings: ScriptParseWarning[],
  line: number,
  message: string,
  raw: string,
) {
  warnings.push({ line, message, raw: raw.trim() });
}

function parseTags(source: string) {
  const tags: Record<string, string> = {};
  const pairedTagPattern = /<([^<>\s=]+)>([\s\S]*?)<\/\1\s*>/gi;
  const remaining = source.replace(pairedTagPattern, (_match, key: string, value: string) => {
    tags[key.trim().toLowerCase()] = value.trim();
    return ' ';
  });
  const tagPattern = /<([^<>\s=]+)(?:=([^>]*))?>/g;
  let match = tagPattern.exec(remaining);
  while (match) {
    const key = match[1].trim().toLowerCase();
    if (key) tags[key] = (match[2] ?? '').trim();
    match = tagPattern.exec(remaining);
  }
  return tags;
}

function parseNarrators(
  source: string,
  warnings: ScriptParseWarning[],
  lineNumber: number,
): ParsedNarrator {
  const sprites: string[] = [];
  const remote: Record<string, boolean> = {};
  const characters: Array<{ name: string; sprite: string }> = [];
  const speakers: string[] = [];

  source.split(';').forEach((part) => {
    const speakerMatches = /<speaker>(.*?)<\/speaker>/i.exec(part);
    const cleanPart = part.replace(/<speaker>.*?<\/speaker>/gi, '').trim();
    if (speakerMatches?.[1]) speakers.push(speakerMatches[1].trim());
    if (cleanPart === '') return;

    const sprite = /^([^()<>]*?)\((\d+)\)/.exec(cleanPart);
    if (!sprite) {
      addWarning(warnings, lineNumber, `无法识别立绘描述：${cleanPart}`, source);
      return;
    }
    const name = sprite[1].trim();
    const spriteName = sprite[2];
    if (!name) return;

    const effectTags = parseTags(cleanPart);
    const effects = Object.keys(effectTags).filter((tag) => !CONTROL_TAGS.has(tag));
    const effectSuffix = effects.length > 0 ? `/${effects.join(',')}` : '';
    const path = `${name}/${spriteName}${effectSuffix}`;
    sprites.push(path);
    characters.push({ name, sprite: spriteName });
    if (effects.includes('通讯框') || effects.includes('remote')) {
      remote[`${name}/${spriteName}`] = true;
    }
  });

  return {
    speaker: speakers.at(-1) ?? '',
    sprites,
    remote,
    characters,
  };
}

function parseSourceLine(
  raw: string,
  lineNumber: number,
  warnings: ScriptParseWarning[],
): ParsedSourceLine | null {
  const normalized = raw.trim().replace('：', ': ');
  const colon = normalized.indexOf(':');
  if (colon === -1) return null;

  const metadata = normalized.slice(0, colon).trim();
  if (!metadata.includes('||')) return null;
  const content = normalized.slice(colon + 1).trim();
  const [narratorPart, effectPart] = metadata.split('||', 2);
  const narrator = parseNarrators(narratorPart, warnings, lineNumber);
  const effects = parseTags(effectPart);
  return {
    narrator: narrator.speaker,
    sprites: narrator.sprites,
    remote: narrator.remote,
    characters: narrator.characters,
    effects,
    content,
  };
}

function sanitizeText(source: string) {
  // Remove control characters before inserting imported content into HTML.
  let text = source
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')
    .replace(/<color=(#[\da-f]+)>/gi, '<span style="color: $1">')
    .replace(/<size=(\d+)>/gi, (_match, value: string) => `<span style="font-size: ${Number(value) / 50}em">`)
    .replace(/<\/(?:color|size)>/gi, '</span>');

  if (typeof DOMParser === 'undefined') {
    return text.replace(/<script[\s\S]*?<\/script>/gi, '');
  }

  const documentFragment = new DOMParser().parseFromString(`<div>${text}</div>`, 'text/html');
  documentFragment.querySelectorAll('script,style,iframe,object,embed').forEach((element) => element.remove());
  documentFragment.querySelectorAll('*').forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      if (attribute.name.toLowerCase().startsWith('on')) element.removeAttribute(attribute.name);
      if (attribute.name.toLowerCase() === 'href' && /^javascript:/i.test(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  text = documentFragment.body.firstElementChild?.innerHTML ?? text;
  return text;
}

function toTextLine(
  parsed: ParsedSourceLine,
  text: string,
  id: string,
): TextLine {
  return {
    type: 'text',
    id,
    narrator: parsed.narrator,
    narratorColor: '#ffffff',
    remote: parsed.remote,
    sprites: parsed.sprites,
    text: `<p>${sanitizeText(text.trim())}</p>`,
  };
}

function toSceneLine(
  scene: SceneLine['scene'],
  media: string,
  id: string,
  classes: string[] = [],
  options: ScriptParseOptions = {},
): SceneLine {
  return {
    type: 'scene',
    id,
    scene,
    media: mediaUrl(
      scene === 'background' ? 'background' : 'audio',
      media,
      options,
      scene === 'se' ? 'se' : 'audio',
    ),
    style: scene === 'background' ? 'cover' : '',
    classes,
  };
}

function classesFromEffects(effects: Record<string, string>) {
  const classes: string[] = [];
  if (effects.night !== undefined) classes.push('night');
  if (effects['回忆'] !== undefined) classes.push('memories');
  if (effects['关闭蒙版'] !== undefined) classes.push('!memories', '!night');
  if (effects['黑屏1'] !== undefined || effects['黑点1'] !== undefined) classes.push('blank');
  if (effects['黑屏2'] !== undefined || effects['黑点2'] !== undefined) {
    classes.push('!blank', 'fade-in');
  }
  return classes;
}

function toOptionLine(options: string[], id: string): OptionLine {
  return {
    type: 'option',
    id,
    options: options
      .map((option, index) => ({
        key: sanitizeText(option.trim()),
        value: String(index + 1),
      }))
      .filter((option) => option.key !== ''),
  };
}

function createCharacter(name: string, sprite: string, options: ScriptParseOptions): Character {
  const characterSprite: CharacterSprite = {
    name: sprite,
    url: mediaUrl('sprite', `${name}/${sprite}.png`, options),
    center: [-1, -1],
    scale: -1,
    id: `${name}/${sprite}`,
  };
  return {
    name,
    id: name,
    imported: true,
    sprites: [characterSprite],
  };
}

function mergeCharacter(
  characters: Map<string, Character>,
  name: string,
  sprite: string,
  options: ScriptParseOptions,
) {
  const existing = characters.get(name);
  if (!existing) {
    characters.set(name, createCharacter(name, sprite, options));
    return;
  }
  if (!existing.sprites.some((item) => item.name === sprite)) {
    existing.sprites.push(createCharacter(name, sprite, options).sprites[0]);
  }
}

function createSimpleLine(
  raw: string,
  lineNumber: number,
  warnings: ScriptParseWarning[],
  nextId: () => string,
  options: ScriptParseOptions,
): Line | null {
  const scene = /^(?:\[?背景(?:图片)?\]?|background|bg)\s*[:：]\s*(.+)$/i.exec(raw.trim());
  if (scene) {
    return toSceneLine('background', scene[1], nextId(), [], options);
  }
  const audio = /^(?:\[?(?:背景音乐|bgm|audio)\]?|music)\s*[:：]\s*(.+)$/i.exec(raw.trim());
  if (audio) {
    return toSceneLine('audio', audio[1], nextId(), [], options);
  }
  const se = /^(?:\[?(?:音效|se)\]?)\s*[:：]\s*(.+)$/i.exec(raw.trim());
  if (se) {
    return toSceneLine('se', se[1], nextId(), [], options);
  }
  const speaker = /^([^:：]{1,40})\s*[:：]\s*(.+)$/.exec(raw.trim());
  if (speaker) {
    return toTextLine({
      narrator: speaker[1].trim(),
      sprites: [],
      remote: {},
      characters: [],
      effects: {},
      content: speaker[2],
    }, speaker[2], nextId());
  }
  if (raw.trim().startsWith('#')) return null;
  addWarning(warnings, lineNumber, '未识别的剧本行，已按旁白处理', raw);
  return toTextLine({
    narrator: '',
    sprites: [],
    remote: {},
    characters: [],
    effects: {},
    content: raw,
  }, raw, nextId());
}

export function parseScript(script: string, options: ScriptParseOptions = {}): ScriptParseResult {
  let generatedId = 0;
  const nextId = () => {
    generatedId += 1;
    return `imported-${generatedId}`;
  };
  const warnings: ScriptParseWarning[] = [];
  const lines: Line[] = [];
  const characters = new Map<string, Character>();
  const sourceLines = script.split(/\r?\n/);
  let pendingOptions: string[] = [];

  const flushOptions = () => {
    if (pendingOptions.length > 0) {
      lines.push(toOptionLine(pendingOptions, nextId()));
      pendingOptions = [];
    }
  };

  sourceLines.forEach((raw, index) => {
    const lineNumber = index + 1;
    const trimmed = raw.trim();
    if (trimmed === '') return;

    const option = /^(?:[-*]|\d+[.)])\s+(.+)$/.exec(trimmed);
    if (option) {
      pendingOptions.push(option[1]);
      return;
    }
    flushOptions();

    const parsed = parseSourceLine(raw, lineNumber, warnings);
    if (!parsed) {
      const simpleLine = createSimpleLine(raw, lineNumber, warnings, nextId, options);
      if (simpleLine) lines.push(simpleLine);
      return;
    }

    parsed.characters.forEach((item) => mergeCharacter(
      characters,
      item.name,
      item.sprite,
      options,
    ));

    const classes = classesFromEffects(parsed.effects);
    if (parsed.effects.bin || parsed.effects.background || parsed.effects.cg) {
      const background = parsed.effects.bin || parsed.effects.background || parsed.effects.cg;
      lines.push(toSceneLine('background', background, nextId(), classes, options));
    } else if (classes.length > 0) {
      lines.push(toSceneLine('background', '', nextId(), classes, options));
    }
    if (parsed.effects.bgm || parsed.effects.audio) {
      lines.push(toSceneLine('audio', parsed.effects.bgm || parsed.effects.audio, nextId(), [], options));
    }
    if (parsed.effects.se || parsed.effects.se1 || parsed.effects.se2 || parsed.effects.se3) {
      const sound = parsed.effects.se
        || parsed.effects.se1
        || parsed.effects.se2
        || parsed.effects.se3;
      lines.push(toSceneLine('se', sound, nextId(), [], options));
    }

    const choiceTag = ['c', 'r', 't'].find((tag) => parsed.content.includes(`<${tag}>`));
    const contentParts = choiceTag ? parsed.content.split(`<${choiceTag}>`) : [parsed.content];
    const textContent = contentParts.shift() ?? '';
    textContent.split('+').filter((part) => part.trim() !== '').forEach((part) => {
      lines.push(toTextLine(parsed, part, nextId()));
    });
    if (contentParts.length > 0) {
      lines.push(toOptionLine(contentParts, nextId()));
    }
    if (parsed.content.includes('<cg>')) {
      addWarning(warnings, lineNumber, '检测到 CG 点击分支，已保留正文但未生成精确点击区域', raw);
    }
    if (parsed.content.includes('<va11>')) {
      addWarning(
        warnings,
        lineNumber,
        '检测到 VA-11 特殊分支，已按普通选项导入',
        raw,
      );
    }
  });
  flushOptions();

  const generated = lines.length;
  return {
    story: {
      characters: [...characters.values()],
      lines,
    },
    warnings,
    stats: {
      sourceLines: sourceLines.filter((line) => line.trim() !== '').length,
      generatedLines: generated,
      textLines: lines.filter((line) => line.type === 'text').length,
      sceneLines: lines.filter((line) => line.type === 'scene').length,
      optionLines: lines.filter((line) => line.type === 'option').length,
      characters: characters.size,
    },
  };
}
