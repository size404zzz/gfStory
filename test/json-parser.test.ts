import { describe, expect, test } from 'vitest';

import characterPresets from '../src/assets/characters.json';
import { resolveAssetMedia } from '../src/story/assetResolver';
import { parseStoryJson } from '../src/story/jsonParser';
import { IMAGE_PATH_PREFIX, type GfCharactersInfo } from '../src/types/assets';

const presets = characterPresets as unknown as GfCharactersInfo;

describe('parseStoryJson', () => {
  test('detects dialogue, speaker, sprites, music and choices by field name', () => {
    const result = parseStoryJson(JSON.stringify([
      {
        背景音乐: 'rain', 背景: 'station', 说话人: '格琳', 立绘: 'NPC-Kalin(1)<通讯框>', 对白: '早啊，指挥官。',
      },
      {
        bgm: 'rain', speaker: '指挥官', text: '出发！', options: ['前进', '撤退'],
      },
    ]));

    expect(result.format).toBe('json');
    expect(result.story.characters[0]).toMatchObject({
      name: 'NPC-Kalin',
      sprites: [{ url: '/images/NPC-Kalin/1.png' }],
    });
    expect(result.story.lines.map((line) => line.type)).toEqual([
      'scene', 'scene', 'text', 'text', 'option',
    ]);
    expect(result.story.lines[0]).toMatchObject({ scene: 'background', media: '/images/background/station.png' });
    expect(result.story.lines[1]).toMatchObject({ scene: 'audio', media: '/audio/bgm/rain.m4a' });
    expect(result.story.lines[2]).toMatchObject({
      narrator: '格琳',
      sprites: ['NPC-Kalin/1/通讯框'],
      remote: { 'NPC-Kalin/1': true },
    });
    // 同名 BGM 只保留第一次出现的场景节点。
    expect(result.stats.bgmLines).toBe(1);
    expect(result.stats.speakers).toBe(2);
    expect(result.story.lines[4]).toMatchObject({
      options: [{ key: '前进', value: '1' }, { key: '撤退', value: '2' }],
    });
  });

  test('supports bare sprite indexes, sprite paths and wrapped containers', () => {
    const result = parseStoryJson(JSON.stringify({
      meta: { author: 'someone' },
      characters: [{ name: 'G36' }],
      剧情: [
        { name: 'G36', sprite: 2, content: ['第一句', '第二句'] },
        { 立绘: 'UMP45/3', text: '第三句' },
      ],
    }));

    expect(result.story.characters.map((character) => character.name)).toEqual(['G36', 'UMP45']);
    expect(result.story.lines.map((line) => (line.type === 'text' ? line.text : line.type))).toEqual([
      '<p>第一句</p>', '<p>第二句</p>', '<p>第三句</p>',
    ]);
    expect(result.story.lines[0]).toMatchObject({ narrator: 'G36', sprites: ['G36/2'] });
    expect(result.story.lines[2]).toMatchObject({ narrator: 'UMP45', sprites: ['UMP45/3'] });
    expect(result.stats.sourceLines).toBe(2);
  });

  test('resolves media and sprites through the unpacked asset indexes', () => {
    const result = parseStoryJson(JSON.stringify([
      {
        背景: '8',
        背景音乐: 'BGM_Sunshine',
        音效: 'Alarm',
        立绘: 'NPC-Kalin(0)',
        说话人: '格琳',
        对白: '早啊，指挥官。',
      },
    ]), {
      resolveMedia: resolveAssetMedia,
      spritePreset: (name, sprite) => {
        const preset = presets[name]?.[sprite];
        return preset
          ? { url: `${IMAGE_PATH_PREFIX}${preset.path}`, scale: preset.scale }
          : undefined;
      },
    });

    expect(result.story.lines.map((line) => line.type)).toEqual([
      'scene', 'scene', 'scene', 'text',
    ]);
    expect(result.story.lines.map((line) => (line.type === 'scene' ? line.media : ''))).toEqual([
      '/images/background/作战室avg.png',
      '/audio/bgm/home_formation_factory.m4a',
      '/audio/se/Alarm.m4a',
      '',
    ]);
    expect(result.story.lines[3]).toMatchObject({ narrator: '格琳', sprites: ['NPC-Kalin/0'] });
    expect(result.story.characters[0].sprites[0]).toMatchObject({
      url: '/images/npc-kalin/版娘.png',
      scale: 1.350000023841858,
    });
  });

  test('accepts screenplay strings and editor-exported stories', () => {
    const strings = parseStoryJson('["格琳：早啊，指挥官。"]');
    expect(strings.story.lines).toMatchObject([
      { type: 'text', narrator: '格琳' },
    ]);

    const story = parseStoryJson(JSON.stringify({
      characters: [],
      lines: [{
        type: 'text', id: '1', narrator: '旁白', remote: {}, sprites: [], text: '<p>hi</p>',
      }],
    }));
    expect(story.story.lines[0]).toMatchObject({ id: '1', text: '<p>hi</p>' });
    expect(story.warnings).toEqual([]);
  });

  test('reports unknown fields and rejects unreadable input', () => {
    const withNoise = parseStoryJson('[{ "speaker": "A", "dialogue": "B", "uuid": 3, "foo": "x" }]');
    expect(withNoise.warnings.map((item) => item.message)).toEqual([
      '未识别字段“foo”，已忽略',
    ]);
    expect(withNoise.story.lines).toHaveLength(1);

    expect(() => parseStoryJson('{oops')).toThrow('JSON 语法错误');
    expect(() => parseStoryJson('{"total": 3}')).toThrow('没有在 JSON 里找到对白记录');
    expect(() => parseStoryJson('[{ "foo": "bar" }]')).toThrow('JSON 记录里没有找到可解析的字段');
  });
});
