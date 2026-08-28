import audioPresets from '../assets/audio.json';
import backgroundPresets from '../assets/backgrounds.json';
import {
  AUDIO_PATH_PREFIX, IMAGE_PATH_PREFIX, type AudioInfo, type BackgroundInfo,
} from '../types/assets';

/**
 * Resolve the media names written inside story data against the unpacked asset
 * indexes: `backgrounds.json` is keyed by the numeric background id used by the
 * original script, while `audio.json` is keyed by both track ids and names.
 */

const audios = audioPresets as unknown as AudioInfo;
const backgrounds = backgroundPresets as unknown as BackgroundInfo;

function stripExtension(value: string) {
  return value.replace(/\.[^.]+$/, '');
}

function fileStem(path: string) {
  const segments = stripExtension(path).split('/');
  return segments[segments.length - 1] ?? '';
}

function canonical(value: string) {
  return value.toLocaleLowerCase().replace(/[\s_-]/g, '');
}

function lookup(index: AudioInfo | BackgroundInfo, name: string) {
  const direct = index[name];
  if (typeof direct === 'string' && direct) return direct;
  const target = canonical(name);
  if (target === '') return '';
  const entry = Object.entries(index).find(([key, path]) => canonical(key) === target
    || canonical(fileStem(path)) === target);
  return entry ? entry[1] : '';
}

function withExtension(path: string, extension: string) {
  return path.toLowerCase().endsWith(extension) ? path : `${path}${extension}`;
}

// 与仓库其他解析模块保持一致，使用命名导出。
// eslint-disable-next-line import/prefer-default-export
export function resolveAssetMedia(
  type: 'background' | 'audio' | 'sprite',
  name: string,
  audioScene: 'audio' | 'se' = 'audio',
): string {
  const value = name.trim().replace(/^['"]|['"]$/g, '');
  if (value === '') return '';
  if (type === 'sprite') return `${IMAGE_PATH_PREFIX}${value}`;
  if (type === 'background') {
    const indexed = lookup(backgrounds, value);
    if (indexed) return `${IMAGE_PATH_PREFIX}${indexed}`;
    return `${IMAGE_PATH_PREFIX}${withExtension(
      value.includes('/') ? value : `background/${value}`,
      '.png',
    )}`;
  }
  const indexed = lookup(audios, value);
  if (indexed) return `${AUDIO_PATH_PREFIX}${indexed}`;
  const directory = audioScene === 'se' ? 'se' : 'bgm';
  return `${AUDIO_PATH_PREFIX}${withExtension(
    value.includes('/') ? value : `${directory}/${value}`,
    '.m4a',
  )}`;
}
