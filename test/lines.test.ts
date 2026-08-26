import { describe, expect, test } from 'vitest';

import {
  convertLineType, createLine, defaultLine,
} from '../src/types/lines';

describe('line factories', () => {
  test('creates complete nodes for every editor type', () => {
    expect(defaultLine()).toMatchObject({
      type: 'text',
      narrator: '',
      remote: {},
      text: '',
      narratorColor: '#ffffff',
      sprites: [],
    });
    expect(createLine('scene', '2')).toEqual({
      type: 'scene',
      id: '2',
      scene: 'background',
      media: '',
      style: 'cover',
      classes: [],
    });
    expect(createLine('option', '3')).toMatchObject({
      type: 'option',
      id: '3',
      options: [
        { key: '选项 1', value: '1' },
        { key: '选项 2', value: '2' },
      ],
    });
  });

  test('converts a node without leaking fields from its previous type', () => {
    const text = defaultLine();
    text.text = '保留在原节点';

    const scene = convertLineType(text, 'scene');

    expect(scene).toMatchObject({
      type: 'scene',
      id: text.id,
      scene: 'background',
      style: 'cover',
    });
    expect(scene).not.toHaveProperty('text');
    expect(convertLineType(scene, 'scene')).toBe(scene);
  });
});
