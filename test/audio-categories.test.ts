import { assert, test } from 'vitest';

import audioInfo from '../src/assets/audio.json';
import audioCategories from '../src/assets/audio-categories.json';

type AudioInfo = Record<string, string>;
type AudioCatalog = {
  categories: Record<string, string>,
  series: Record<string, string>,
  labels: Record<string, string>,
};

const info = audioInfo as AudioInfo;
const catalog = audioCategories as AudioCatalog;
const filePaths = Array.from(new Set(Object.values(info)));

function groupOf(audioPath: string) {
  const category = catalog.categories[audioPath];
  const series = catalog.series[audioPath] ?? 'common';
  return `${category}/${series}`;
}

const EXPECTED_GROUPS: Record<string, string> = {
  'bgm/GF_MAP7_BGM.m4a': 'music/common',
  'bgm/m_va_digital_drive.m4a': 'music/VA',
  'bgm/2022_white_valentine_BGM1.m4a': 'music/common',
  'se/AVG_AMB_Rain.m4a': 'avg-sfx/AMB',
  'bgm/BT_MissileExplo.m4a': 'battle-sfx/common',
  'bgm/UI_slide.m4a': 'ui-sfx/common',
  'bgm/Kar_98k_Firing.m4a': 'unit-skill/common',
  'se/VO_Medusa_TITLECALL_JP_b.m4a': 'voice/MEDUSA',
};

test('每个音频标识符都解析到已分类的物理文件', () => {
  const unmapped = Object.entries(info)
    .filter(([, audioPath]) => catalog.categories[audioPath] === undefined)
    .map(([identifier]) => identifier);
  assert.deepEqual(unmapped.slice(0, 10), [], `${unmapped.length} 个标识符缺少分类`);
});

test('分类结果只使用已声明的大类', () => {
  const unknown = Array.from(new Set(filePaths.map((item) => catalog.categories[item])));
  assert.deepEqual(unknown.filter((id) => catalog.labels[id] === undefined), []);
});

test('未识别资源与超大分组都受控', () => {
  const groups = new Map<string, number>();
  filePaths.forEach((item) => {
    const group = groupOf(item);
    groups.set(group, (groups.get(group) ?? 0) + 1);
  });
  const other = filePaths.filter((item) => catalog.categories[item] === 'other').length;
  assert.ok(other / filePaths.length < 0.08, `other 占比 ${((other / filePaths.length) * 100).toFixed(1)}%`);
  assert.ok(groups.size >= 20, `分组过少：${groups.size}`);
  const oversized = Array.from(groups.entries()).filter(([, count]) => count > 200);
  assert.deepEqual(oversized, [], '存在不适合人工审校的超大分组');
});

test('命名前缀规则稳定生效', () => {
  const rules: [RegExp, string][] = [
    [/^AVG_/, 'avg-sfx'],
    [/^BT_/, 'battle-sfx'],
    [/^UI_/, 'ui-sfx'],
    [/^VO_/, 'voice'],
    [/^DJMAX_/, 'minigame'],
  ];
  rules.forEach(([pattern, category]) => {
    const matched = filePaths.filter((item) => pattern.test(item.split('/').pop() ?? ''));
    assert.isAbove(matched.length, 0, `${pattern.source} 没有命中任何资源`);
    assert.deepEqual(
      matched.filter((item) => catalog.categories[item] !== category),
      [],
      `${pattern.source} 混入了其他大类`,
    );
  });
});

test('同一物理文件的多个标识符共享分组', () => {
  const aliases = Object.entries(info).filter(
    ([, audioPath]) => audioPath === 'bgm/GF_MAP7_BGM.m4a',
  );
  assert.isAbove(aliases.length, 1, '该文件应有多个逻辑名');
  assert.equal(new Set(aliases.map(([identifier]) => groupOf(info[identifier]))).size, 1);
});

test('定点抽查', () => {
  Object.entries(EXPECTED_GROUPS).forEach(([audioPath, group]) => {
    assert.equal(groupOf(audioPath), group, audioPath);
  });
});
