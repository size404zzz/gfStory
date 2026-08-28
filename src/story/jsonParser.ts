import type { Character } from '../types/character';
import type {
  GfStory, Line, TextLine,
} from '../types/lines';
import {
  buildStats,
  mergeCharacter,
  parseNarrators,
  parseScript,
  sanitizeText,
  toOptionLine,
  toSceneLine,
  toTextLine,
  type ParsedSourceLine,
  type ScriptParseOptions,
  type ScriptParseResult,
  type ScriptParseWarning,
} from './scriptParser';

/**
 * Import story data out of arbitrary JSON. Field names are matched against
 * known synonyms, so dialogue, speakers, sprites, backgrounds and music are
 * picked up without the user declaring a schema.
 */

type FieldRole = 'text' | 'speaker' | 'sprite' | 'background' | 'bgm' | 'se' | 'options';

const FIELD_SYNONYMS: Record<FieldRole, string[]> = {
  text: [
    'text', 'content', 'dialogue', 'dialog', 'line', 'say', 'said', 'words', 'message',
    'body', 'speech', '对白', '台词', '内容', '文本', '正文', '说话内容',
  ],
  speaker: [
    'speaker', 'narrator', 'name', 'role', 'character', 'charactername', 'who', 'person',
    '说话人', '发言人', '角色', '角色名', '名字', '名称',
  ],
  sprite: [
    'sprite', 'sprites', 'figure', 'portrait', 'avatar', 'hall', 'characterimage',
    '立绘', '人物立绘', '形象', '半身像',
  ],
  background: [
    'background', 'backgroundimage', 'backgrounds', 'bg', 'bgname', 'bin', 'cg', 'stage',
    'image', 'img', '背景', '背景图', '底图', '场景',
  ],
  bgm: ['bgm', 'music', 'audio', 'soundtrack', 'bgmusic', '背景音乐', '音乐', '配乐'],
  se: ['se', 'sfx', 'sound', 'soundeffect', '音效'],
  options: ['option', 'options', 'choice', 'choices', 'branch', 'branches', '选项', '分支', '选择'],
};

const FIELD_ROLES = Object.keys(FIELD_SYNONYMS) as FieldRole[];

/** Bookkeeping keys that never carry story content. */
const IGNORED_KEYS = new Set([
  'id', 'uuid', 'uid', 'key', 'value', 'next', 'target', 'index', 'order', 'sort', 'type',
  'tag', 'tags', 'note', 'remark', 'comment', 'author', 'date', 'time', 'version',
  '编号', '备注', '序号', '跳转',
]);

const CONTAINER_KEYS = new Set([
  'lines', 'dialogues', 'dialogue', 'story', 'script', 'data', 'items', 'records', 'nodes',
  'scenes', 'entries', 'rows', 'list', '对白', '剧情', '剧本', '节点', '内容',
]);

/** Arrays that hold something other than the story flow. */
const SKIP_KEYS = new Set([
  'characters', 'character', 'roles', 'cast', 'resources', 'assets', 'media', 'config',
  'meta', 'metadata', 'search',
]);

const LINE_TYPES = new Set(['text', 'scene', 'option']);
const IMAGE_SUFFIX = /\.(png|jpe?g|webp|gif)$/i;
const GAME_SPRITE_NOTATION = /\(\d+\)/;

function normalizeKey(key: string) {
  return key
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z\d\u4e00-\u9fa5]/g, '');
}

function matchScore(normalized: string, token: string) {
  if (normalized === token) return 1000 + token.length;
  if (normalized.includes(token)) return token.length;
  return 0;
}

function classifyKey(key: string): FieldRole | null {
  const normalized = normalizeKey(key);
  if (normalized === '' || IGNORED_KEYS.has(normalized)) return null;
  let bestRole: FieldRole | null = null;
  let bestScore = 0;
  FIELD_ROLES.forEach((role) => {
    FIELD_SYNONYMS[role].forEach((synonym) => {
      const score = matchScore(normalized, normalizeKey(synonym));
      if (score > bestScore) {
        bestScore = score;
        bestRole = role;
      }
    });
  });
  return bestRole;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toTextList(value: unknown, depth = 0): string[] {
  if (value === null || value === undefined || depth > 2) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => toTextList(item, depth + 1));
  }
  if (typeof value === 'string') return value.trim() === '' ? [] : [value];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (isRecord(value)) {
    return Object.entries(value)
      .flatMap(([key, item]) => {
        const role = classifyKey(key);
        return role === 'text' || role === 'speaker' || role === 'options'
          ? toTextList(item, depth + 1)
          : [];
      });
  }
  return [];
}

/** Resolve `UMP45/2` or `images/characters/UMP45/2.png` into a character sprite. */
function matchSpritePath(value: string) {
  const clean = value.trim().replace(IMAGE_SUFFIX, '');
  const match = /([^/\\]+)[/\\](\d+)$/.exec(clean);
  if (!match) return null;
  return { name: match[1].trim(), sprite: match[2] };
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, '').trim();
}

interface JsonFields {
  text: string[];
  speaker: string[];
  sprite: string[];
  background: string[];
  bgm: string[];
  se: string[];
  options: string[];
}

interface ImportState {
  lines: Line[];
  characters: Map<string, Character>;
  warnings: ScriptParseWarning[];
  reported: Set<string>;
  active: Map<'background' | 'audio' | 'se', string>;
  options: ScriptParseOptions;
  nextId: () => string;
}

function warn(state: ImportState, line: number, message: string, raw: string) {
  state.warnings.push({ line, message, raw: raw.trim().slice(0, 120) });
}

function emptyNarrator(): ParsedSourceLine {
  return {
    narrator: '',
    sprites: [],
    remote: {},
    characters: [],
    effects: {},
    content: '',
  };
}

function registerSprite(
  state: ImportState,
  narrator: ParsedSourceLine,
  name: string,
  sprite: string,
) {
  const path = `${name}/${sprite}`;
  if (!narrator.sprites.includes(path)) narrator.sprites.push(path);
  if (!narrator.characters.some((item) => item.name === name && item.sprite === sprite)) {
    narrator.characters.push({ name, sprite });
  }
  mergeCharacter(state.characters, name, sprite, state.options);
}

function readNarrators(
  state: ImportState,
  speakers: string[],
  sprites: string[],
  line: number,
): ParsedSourceLine {
  const narrator = emptyNarrator();
  const clean = (list: string[]) => list
    .map((value) => value.trim())
    .filter((value) => value !== '');
  const speakerValues = clean(speakers);
  const spriteValues = clean(sprites);
  const gameNotation = [...speakerValues, ...spriteValues]
    .filter((value) => GAME_SPRITE_NOTATION.test(value));

  if (gameNotation.length > 0) {
    const parsed = parseNarrators(gameNotation.join(';'), state.warnings, line);
    parsed.sprites.forEach((path) => {
      if (!narrator.sprites.includes(path)) narrator.sprites.push(path);
    });
    Object.keys(parsed.remote).forEach((key) => {
      narrator.remote[key] = true;
    });
    parsed.characters.forEach((item) => {
      narrator.characters.push(item);
      mergeCharacter(state.characters, item.name, item.sprite, state.options);
    });
    narrator.narrator = parsed.speaker;
  }

  [...speakerValues, ...spriteValues]
    .filter((value) => !GAME_SPRITE_NOTATION.test(value))
    .forEach((value) => {
      const path = matchSpritePath(value);
      const name = path ? path.name : stripTags(value);
      if (name === '' || /^\d+$/.test(name)) return;
      if (path) registerSprite(state, narrator, path.name, path.sprite);
      if (narrator.narrator === '') narrator.narrator = name;
    });

  spriteValues
    .filter((value) => !GAME_SPRITE_NOTATION.test(value))
    .forEach((value) => {
      const path = matchSpritePath(value);
      if (path) return;
      if (/^\d+$/.test(value)) {
        const owner = narrator.narrator !== '' ? narrator.narrator : (narrator.characters[0]?.name ?? '');
        if (owner === '') {
          warn(state, line, `立绘编号“${value}”缺少角色名，已忽略`, value);
        } else {
          registerSprite(state, narrator, owner, value);
        }
        return;
      }
      if (value.includes('/') || value.includes('\\') || IMAGE_SUFFIX.test(value)) {
        warn(state, line, '立绘字段是一个图片地址，请在导入后手动选择立绘', value);
        return;
      }
      const name = stripTags(value);
      if (name === '' || narrator.sprites.some((item) => item.startsWith(`${name}/`))) return;
      warn(state, line, `立绘“${name}”没有给出编号，已按 0 号立绘导入`, value);
      registerSprite(state, narrator, name, '0');
    });

  if (narrator.narrator === '' && narrator.sprites.length === 1) {
    [narrator.narrator] = narrator.sprites[0].split('/');
  }
  return narrator;
}

function applyScenes(state: ImportState, fields: JsonFields) {
  [
    { scene: 'background' as const, value: fields.background.at(-1) ?? '' },
    { scene: 'audio' as const, value: fields.bgm.at(-1) ?? '' },
    { scene: 'se' as const, value: fields.se.at(-1) ?? '' },
  ].forEach(({ scene, value }) => {
    const name = value.trim();
    if (name === '' || state.active.get(scene) === name) return;
    state.active.set(scene, name);
    state.lines.push(toSceneLine(scene, name, state.nextId(), [], state.options));
  });
}

function toJsonTextLine(narrator: ParsedSourceLine, raw: string, id: string): TextLine {
  const paragraphs = raw.split(/\r?\n/).map((part) => part.trim()).filter((part) => part !== '');
  const line = toTextLine(narrator, paragraphs[0] ?? '', id);
  if (paragraphs.length < 2) return line;
  return { ...line, text: paragraphs.map((part) => `<p>${sanitizeText(part)}</p>`).join('') };
}

/** A bare string keeps the original screenplay notation, so reuse that parser. */
function appendScriptString(state: ImportState, raw: string, line: number) {
  const parsed = parseScript(raw, state.options);
  parsed.story.characters.forEach((character) => {
    character.sprites.forEach((sprite) => mergeCharacter(
      state.characters,
      character.name,
      sprite.name,
      state.options,
    ));
  });
  parsed.story.lines.forEach((item) => state.lines.push({ ...item, id: state.nextId() }));
  parsed.warnings.forEach((item) => warn(state, line, item.message, item.raw));
}

function readFields(entry: Record<string, unknown>, state: ImportState, line: number): JsonFields {
  const fields: JsonFields = {
    text: [],
    speaker: [],
    sprite: [],
    background: [],
    bgm: [],
    se: [],
    options: [],
  };
  Object.entries(entry).forEach(([key, value]) => {
    const role = classifyKey(key);
    const values = toTextList(value);
    if (!role) {
      if (values.length > 0 && !IGNORED_KEYS.has(normalizeKey(key))) {
        if (!state.reported.has(key)) {
          state.reported.add(key);
          warn(state, line, `未识别字段“${key}”，已忽略`, key);
        }
      }
      return;
    }
    fields[role].push(...values);
  });
  return fields;
}

function appendRecord(state: ImportState, record: unknown, index: number) {
  const line = index + 1;
  if (typeof record === 'string') {
    appendScriptString(state, record, line);
    return;
  }
  if (!isRecord(record)) {
    warn(state, line, '无法识别的记录类型，已跳过', String(record));
    return;
  }
  const fields = readFields(record, state, line);
  if (Object.values(fields).every((values) => values.length === 0)) {
    warn(state, line, '该记录没有可识别的字段，已跳过', '');
    return;
  }
  const narrator = readNarrators(state, fields.speaker, fields.sprite, line);
  const before = state.lines.length;
  applyScenes(state, fields);
  fields.text.forEach((item) => {
    state.lines.push(toJsonTextLine(narrator, item, state.nextId()));
  });
  if (fields.options.length > 0) {
    state.lines.push(toOptionLine(fields.options, state.nextId()));
  }
  if (fields.text.length === 0 && state.lines.length === before) {
    warn(state, line, '该记录只有说话人或立绘，没有对白，已跳过', '');
  }
}

function isStoryRecordList(list: unknown[]): boolean {
  return list.length > 0 && list.every((item) => (typeof item === 'string'
    ? item.trim() !== ''
    : isRecord(item)));
}

/** Breadth-first search for the array that actually holds the story records. */
function collectRecords(root: unknown): unknown[] | null {
  const queue: Array<{ node: unknown; depth: number }> = [{ node: root, depth: 0 }];
  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i];
    if (Array.isArray(current.node)) {
      if (isStoryRecordList(current.node)) return current.node;
    } else if (current.depth < 4 && isRecord(current.node)) {
      Object.entries(current.node)
        .filter(([key, child]) => !SKIP_KEYS.has(normalizeKey(key))
          && (Array.isArray(child) || isRecord(child)))
        .sort(([a], [b]) => Number(CONTAINER_KEYS.has(normalizeKey(b)))
          - Number(CONTAINER_KEYS.has(normalizeKey(a))))
        .forEach(([, child]) => queue.push({ node: child, depth: current.depth + 1 }));
    }
  }
  return null;
}

function isGfStoryLike(value: unknown): value is GfStory {
  if (!isRecord(value)) return false;
  const { lines } = value as { lines?: unknown };
  return Array.isArray(lines)
    && lines.length > 0
    && lines.every((line) => isRecord(line) && LINE_TYPES.has(String(line.type)));
}

/** Whether the pasted or uploaded source should be treated as JSON data. */
export function looksLikeJson(source: string) {
  const trimmed = source.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

export function parseStoryJson(
  source: string,
  options: ScriptParseOptions = {},
): ScriptParseResult {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new Error(`JSON 语法错误：${error instanceof Error ? error.message : '无法读取'}`);
  }

  if (isGfStoryLike(value)) {
    const story = value;
    const characters = Array.isArray(story.characters) ? story.characters : [];
    return {
      format: 'json',
      story: { characters, lines: story.lines },
      warnings: [],
      stats: buildStats(story.lines.length, story.lines, characters.length),
    };
  }

  const found = collectRecords(value);
  const records = found ?? (isRecord(value) && Object.keys(value).some((key) => classifyKey(key))
    ? [value]
    : null);
  if (!records) {
    throw new Error('没有在 JSON 里找到对白记录：请确认它是一个数组，或者某个字段下挂着对白数组。');
  }

  let generatedId = 0;
  const state: ImportState = {
    lines: [],
    characters: new Map<string, Character>(),
    warnings: [],
    reported: new Set<string>(),
    active: new Map<'background' | 'audio' | 'se', string>(),
    options,
    nextId: () => {
      generatedId += 1;
      return `imported-${generatedId}`;
    },
  };
  records.forEach((record, index) => appendRecord(state, record, index));

  if (state.lines.length === 0) {
    throw new Error('JSON 记录里没有找到可解析的字段：至少需要一列对白文本（如 text、content 或 对白）。');
  }

  return {
    format: 'json',
    story: {
      characters: [...state.characters.values()],
      lines: state.lines,
    },
    warnings: state.warnings,
    stats: buildStats(records.length, state.lines, state.characters.size),
  };
}
