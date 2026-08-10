import { describe, expect, test } from 'vitest';

import { parseScript } from '../src/story/scriptParser';

describe('parseScript', () => {
  test('parses original gfStory lines, effects, sprites and choices', () => {
    const result = parseScript([
      'G36(1)<通讯框>||<bin>station</bin><bgm>rain</bgm><night>: 准备好了吗？+出发！<c>前进<c>撤退',
      '- 继续调查',
      '- 返回基地',
      '背景：ending.jpg',
      '指挥官：任务完成。',
    ].join('\n'));

    expect(result.story.characters).toHaveLength(1);
    expect(result.story.characters[0].name).toBe('G36');
    expect(result.story.characters[0].sprites[0].url).toBe('/images/G36/1.png');
    expect(result.story.lines.map((line) => line.type)).toEqual([
      'scene', 'scene', 'text', 'text', 'option', 'option', 'scene', 'text',
    ]);
    expect(result.story.lines[0]).toMatchObject({
      type: 'scene',
      scene: 'background',
      media: '/images/background/station.png',
      classes: ['night'],
    });
    expect(result.story.lines[1]).toMatchObject({
      type: 'scene',
      scene: 'audio',
      media: '/audio/bgm/rain.m4a',
    });
    expect(result.story.lines[4]).toMatchObject({
      type: 'option',
      options: [
        { key: '前进', value: '1' },
        { key: '撤退', value: '2' },
      ],
    });
    expect(result.story.lines[5]).toMatchObject({
      type: 'option',
      options: [
        { key: '继续调查', value: '1' },
        { key: '返回基地', value: '2' },
      ],
    });
  });

  test('supports simple screenplay notation and custom media resolution', () => {
    const result = parseScript('Alice: Hello\nBGM: theme', {
      resolveMedia: (type, name) => `${type}:${name}`,
    });

    expect(result.story.lines).toMatchObject([
      { type: 'text', narrator: 'Alice' },
      { type: 'scene', scene: 'audio', media: 'audio:theme' },
    ]);
  });
});
