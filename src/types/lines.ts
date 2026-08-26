import type { Character } from './character';

export const LINE_TYPES = ['text', 'scene', 'option'] as const;

interface LineType {
  type: typeof LINE_TYPES[number];
  id: string;
}

export interface TextLine extends LineType {
  type: 'text';
  narrator: string;
  remote: Record<string, boolean>;
  text: string;
  narratorColor: string;
  sprites: string[];
}

export interface SceneLine extends LineType {
  type: 'scene';
  scene: 'background' | 'audio' | 'se';
  media: string;
  style: string;
  classes?: string[];
}

export interface OptionLine extends LineType {
  type: 'option';
  options: { key: string, value: string }[];
}

export type Line = TextLine | SceneLine | OptionLine;

export interface GfStory {
  characters: Character[];
  lines: Line[];
}

let id = 0;
export function initUniqueId(previous: GfStory) {
  id = previous.lines.map((line) => parseInt(line.id, 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
}
export function nextId() {
  id += 1;
  return `${id}`;
}

export function createLine(type: Line['type'], lineId = nextId()): Line {
  if (type === 'scene') {
    return {
      type,
      id: lineId,
      scene: 'background',
      media: '',
      style: 'cover',
      classes: [],
    };
  }
  if (type === 'option') {
    return {
      type,
      id: lineId,
      options: [
        { key: '选项 1', value: '1' },
        { key: '选项 2', value: '2' },
      ],
    };
  }
  return {
    type,
    id: lineId,
    narrator: '',
    remote: {},
    text: '',
    narratorColor: '#ffffff',
    sprites: [],
  };
}

export function convertLineType(line: Line, type: Line['type']): Line {
  if (line.type === type) return line;
  return createLine(type, line.id);
}

export function defaultLine(): TextLine {
  return createLine('text') as TextLine;
}
