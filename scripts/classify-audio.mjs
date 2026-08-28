#!/usr/bin/env node
/**
 * 按资源路径与命名约定为音频条目建立两级分类：大类=用途，系列=来源活动/联动。
 *
 * 分类单位是去重后的物理文件。src/assets/audio.json 里 4274 个 key 只对应 1373 个文件，
 * 多出来的都是 audiotemplate.txt 建立的逻辑别名（10005…10087 与 BGM_stage7 同指
 * bgm/GF_MAP7_BGM.m4a），它们继承所属文件的分类。
 *
 * 用法：node scripts/classify-audio.mjs [--report] [--input <audio.json>]
 *       [--output <audio-categories.json>] [--min-series <n>]
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

/** 大类顺序即编辑器里的展示顺序；第二项是给用户看的中文名。 */
export const CATEGORIES = [
  ['music', '剧情配乐'],
  ['avg-sfx', '剧情演出音效'],
  ['ambience', '环境氛围音'],
  ['battle-sfx', '战斗与动作音效'],
  ['unit-skill', '单位技能与语音'],
  ['ui-sfx', '界面音效'],
  ['minigame', '小游戏与玩法'],
  ['voice', '联动角色语音'],
  ['other', '其他'],
];

/**
 * 文件名首 token（小写）→ 大类。逐行可审；未命中的家族落到 `other`，
 * 调整规则后用 `node scripts/classify-audio.mjs --report` 看明细。
 */
export const HEAD_CATEGORY = {
  // 剧情配乐：BGM_/GF_/m_ 是曲目命名族，home/dorm/cutin 是主题曲
  bgm: 'music',
  gf: 'music',
  m: 'music',
  op: 'music',
  event: 'music',
  campaion: 'music',
  campaign: 'music',
  home: 'music',
  dorm: 'music',
  cutin: 'music',
  halloween: 'music',

  // 剧情演出音效：se/ 整体来自 AVG.acb.dat，AVG_ 是演出专用音效库
  avg: 'avg-sfx',

  // 环境氛围
  amb: 'ambience',
  bge: 'ambience',
  tape: 'ambience',
  vinylrecord: 'ambience',
  fountain: 'ambience',
  heartbeat: 'ambience',

  // 战斗与动作音效
  bt: 'battle-sfx',
  sfx: 'battle-sfx',
  gun: 'battle-sfx',
  gunfight: 'battle-sfx',
  gunkill: 'battle-sfx',
  map: 'battle-sfx',
  explode: 'battle-sfx',
  machinegunburst: 'battle-sfx',
  airraidwarning: 'battle-sfx',
  motherbasewarning: 'battle-sfx',
  battlefield: 'battle-sfx',
  alarm: 'battle-sfx',
  reload: 'battle-sfx',
  rope: 'battle-sfx',
  runstep: 'battle-sfx',

  // 单位技能与语音：skill_/natk/satk/e_/ani_ 是技能与必杀，其余是单位或 BOSS 代号
  skill: 'unit-skill',
  natk: 'unit-skill',
  satk: 'unit-skill',
  e: 'unit-skill',
  ani: 'unit-skill',
  ele: 'unit-skill',
  boss: 'unit-skill',
  bossgager: 'unit-skill',
  bossarchitect: 'unit-skill',
  agent: 'unit-skill',
  medusa: 'unit-skill',
  pekola: 'unit-skill',
  minos: 'unit-skill',
  nyto: 'unit-skill',
  nimp: 'unit-skill',
  weaver: 'unit-skill',
  hunter: 'unit-skill',
  intruder: 'unit-skill',
  excutioner: 'unit-skill',
  alchemist: 'unit-skill',
  eliza: 'unit-skill',
  justice: 'unit-skill',
  dreamer: 'unit-skill',
  scarecrow: 'unit-skill',
  destroyer: 'unit-skill',
  scar: 'unit-skill',
  yurinehanazono: 'unit-skill',
  tiexuedie: 'unit-skill',
  bb: 'unit-skill',
  gg: 'unit-skill',
  digital: 'unit-skill',
  // 名称里没有数字，型号形态规则识别不到
  kar: 'unit-skill',
  ribeyrolles: 'unit-skill',
  angel: 'unit-skill',

  // 界面音效
  ui: 'ui-sfx',
  bbui: 'ui-sfx',
  click: 'ui-sfx',
  select: 'ui-sfx',
  equip: 'ui-sfx',
  clothingup: 'ui-sfx',

  // 小游戏与玩法：含夏日/冬季活动的玩法音效
  djmax: 'minigame',
  flightgame: 'minigame',
  flightchess: 'minigame',
  blackjack: 'minigame',
  xxs: 'minigame',
  bluestar: 'minigame',
  squad: 'minigame',
  dealcards: 'minigame',
  shufflecards: 'minigame',
  ball: 'minigame',
  fs: 'minigame',
  sac: 'minigame',

  // 联动角色语音：VO_<角色>_<场景>_JP
  vo: 'voice',
};

/**
 * 武器与型号类命名（m4a1_013a、Kar_98k、velp213a、88typeCQBMG…）无法用固定 token
 * 穷举，按形态识别。解包数据大小写混用，所以整条规则大小写不敏感。
 */
export const MODEL_SHAPE = /^(?:[a-z]+\d+[a-z0-9]*|\d+[a-z]*type[a-z0-9]*|\d+[a-z]+\d*)$/i;

/** 系列候选里要跳过的功能词：它们描述「这条素材是什么」而不是「来自哪个活动」。 */
export const GENERIC_TOKENS = new Set([
  'AUDIO', 'BGM', 'SFX', 'AVG', 'VO', 'JP', 'EN', 'PV', 'TV', 'AR',
  'SKILL', 'SKILL1', 'SKILL2', 'SKILL3', 'SKILL4', 'SP', 'NATK', 'SATK', 'ATK', 'HIT',
  'BATTLE', 'COMBAT', 'FIGHT', 'MAIN', 'TITLE', 'THEME', 'LOOP', 'LOOPS', 'COMMON', 'SPECIAL',
  'STORY', 'SCENE', 'DAY', 'NIGHT', 'DUSK', 'DAWN', 'MORNING', 'EVENING',
  'BUFF', 'DEBUFF', 'BOSS', 'ENEMY', 'PLAYER', 'UNIT', 'MAP', 'STAGE', 'MISSION',
  'CHAPTER', 'NEW', 'OLD', 'VER', 'V1', 'V2', 'V3', 'V4', 'PART', 'PT', 'DEMO', 'INST',
  'SONG', 'VERSION', 'SHORT', 'LONG', 'FAST', 'SLOW', 'NM', 'H', 'N', 'S',
  'CLICK', 'SELECT', 'MOVE', 'OPEN', 'CLOSE', 'START', 'END', 'STOP', 'LOAD', 'LOADING',
  'TEXT', 'TIP', 'TIPS', 'PAGE', 'SLIDE', 'BUTTON', 'BUTTOM', 'APPEAR', 'ENTER', 'EXIT',
  'SUCCESS', 'FAIL', 'DEFEAT', 'WINDOW', 'PANEL', 'SOUND', 'MUSIC', 'VOICE', 'DIALOG',
  'EFFECT', 'ANIM', 'ANIMATION', 'UIANIMATION', 'DEFAULT', 'HIGHCUT', 'ROUNDSTART',
  'DESCRIPTION', 'DESC', 'NORMAL', 'HARD', 'EX', 'EXTRA', 'FEMALE', 'FINALMIX',
  'CUTIN', 'PERFORMANCE', 'MEMORY', 'MEMORYHINT', 'HINT',
]);

const SERIES_SHAPE = /^(?:\d{2,4}[A-Za-z]*|[A-Za-z][A-Za-z0-9]{1,})$/;

/** 解包脚本按 `;` 拆别名时会产出 `x.m4a.m4a`，扩展名要循环剥干净。 */
export function stemOf(audioPath) {
  let stem = audioPath.split('/').pop() ?? audioPath;
  while (/\.m4a$/i.test(stem)) stem = stem.slice(0, -4);
  return stem;
}

export function dirOf(audioPath) {
  return audioPath.split('/')[0];
}

function tokensOf(stem) {
  return stem.split(/[_\-\s]+/).filter(Boolean);
}

export function categoryOf(audioPath) {
  const stem = stemOf(audioPath);
  const tokens = tokensOf(stem);
  const head = tokens[0] ?? '';
  const mapped = HEAD_CATEGORY[head.toLowerCase()];
  if (mapped) return mapped;
  const isEventHead = /^\d{2,4}[A-Z]/.test(head) || /^\d{4}$/.test(head);
  if (isEventHead) {
    // 21Summer_* 这类活动素材：带 BGM 字样的是活动曲目，其余是活动玩法音效
    return tokens.some((token) => /^bgm\d?$/i.test(token)) ? 'music' : 'minigame';
  }
  // 武器与单位型号命名可能藏在第二段（Kar_98k_Firing）
  if (tokens.slice(0, 2).some((token) => MODEL_SHAPE.test(token))) return 'unit-skill';
  return 'other';
}

/** 取第一个像来源代号的 token；跳过功能词后仍要形态合格。 */
export function seriesOf(audioPath) {
  const tokens = tokensOf(stemOf(audioPath));
  for (let i = 1; i < Math.min(tokens.length, 4); i += 1) {
    const upper = tokens[i].toUpperCase();
    if (!SERIES_SHAPE.test(upper)) continue;
    if (GENERIC_TOKENS.has(upper)) continue;
    return upper;
  }
  return 'common';
}

/** 物理文件 → { path, category, series, aliases }，未套用成组阈值。 */
export function collectFiles(audioInfo) {
  const files = new Map();
  Object.entries(audioInfo).forEach(([key, audioPath]) => {
    if (!files.has(audioPath)) files.set(audioPath, []);
    files.get(audioPath).push(key);
  });
  return [...files.entries()].map(([audioPath, aliases]) => ({
    path: audioPath,
    category: categoryOf(audioPath),
    series: seriesOf(audioPath),
    aliases,
  }));
}

/** 大类内按 `大类/系列` 归组；文件数不足 minSeries 的系列并入 common。 */
export function classify(files, minSeries) {
  const counts = new Map();
  files.forEach((file) => {
    if (file.series === 'common') return;
    const group = `${file.category}/${file.series}`;
    counts.set(group, (counts.get(group) ?? 0) + 1);
  });
  return files.map((file) => {
    const group = `${file.category}/${file.series}`;
    const keep = (counts.get(group) ?? 0) >= minSeries;
    return {
      ...file,
      series: keep ? file.series : 'common',
      group: keep ? group : `${file.category}/common`,
    };
  });
}

export function toOutput(classified) {
  const categories = {};
  const series = {};
  classified.forEach((file) => {
    categories[file.path] = file.category;
    series[file.path] = file.series;
  });
  return {
    categories,
    series,
    labels: Object.fromEntries(CATEGORIES),
    stats: {
      files: classified.length,
      keys: classified.reduce((sum, file) => sum + file.aliases.length, 0),
      other: classified.filter((file) => file.category === 'other').length,
      groups: new Set(classified.map((file) => file.group)).size,
    },
  };
}

function printReport(classified, minSeries) {
  const order = CATEGORIES.map(([id]) => id);
  const byCategory = new Map();
  classified.forEach((file) => {
    const list = byCategory.get(file.category) ?? [];
    list.push(file);
    byCategory.set(file.category, list);
  });

  console.log(`=== 大类（${classified.length} 个物理文件） ===`);
  order.filter((id) => byCategory.has(id)).forEach((id) => {
    const list = byCategory.get(id);
    const keys = list.reduce((sum, file) => sum + file.aliases.length, 0);
    const label = CATEGORIES.find(([c]) => c === id)[1];
    console.log(`${String(list.length).padStart(5)} 文件 ${String(keys).padStart(5)} key  ${id.padEnd(12)} ${label}`);
  });

  const groups = new Map();
  classified.forEach((file) => groups.set(file.group, (groups.get(file.group) ?? 0) + 1));
  console.log(`\n=== ${groups.size} 个组（min-series=${minSeries}），文件数最多的 45 个 ===`);
  console.log([...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 45)
    .map(([group, n]) => `${String(n).padStart(4)}  ${group}`).join('\n'));

  const singles = [...groups.entries()].filter(([, n]) => n === 1).length;
  console.log(`\n单文件组：${singles} 个`);

  const others = byCategory.get('other') ?? [];
  console.log(`=== other 明细（${others.length}）——需要补规则就加进 HEAD_CATEGORY ===`);
  console.log(others.map((file) => `${file.path}  <- ${file.aliases.slice(0, 3).join(', ')}`).join('\n'));
}

function readArgs(argv) {
  const args = {
    input: path.join(REPO_ROOT, 'src/assets/audio.json'),
    output: path.join(REPO_ROOT, 'src/assets/audio-categories.json'),
    minSeries: 3,
    report: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--report') args.report = true;
    else if (flag === '--input' || flag === '--output' || flag === '--min-series') {
      i += 1;
      const value = argv[i];
      if (value === undefined) throw new Error(`${flag} 缺少取值`);
      if (flag === '--min-series') args.minSeries = Number(value);
      else if (flag === '--input') args.input = path.resolve(value);
      else args.output = path.resolve(value);
    } else throw new Error(`未知参数：${flag}`);
  }
  if (!Number.isInteger(args.minSeries) || args.minSeries < 1) {
    throw new Error('--min-series 必须是正整数');
  }
  return args;
}

const args = readArgs(process.argv.slice(2));
const audioInfo = JSON.parse(fs.readFileSync(args.input, 'utf8'));
const classified = classify(collectFiles(audioInfo), args.minSeries);
const output = toOutput(classified);

if (args.report) printReport(classified, args.minSeries);

fs.mkdirSync(path.dirname(args.output), { recursive: true });
fs.writeFileSync(args.output, `${JSON.stringify(output, null, 2)}\n`);
console.log(`\n已写入 ${path.relative(REPO_ROOT, args.output)}：${output.stats.files} 文件 / ${output.stats.keys} key / ${output.stats.groups} 组 / other ${output.stats.other}`);
