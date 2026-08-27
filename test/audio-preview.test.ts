import {
  afterEach, describe, expect, test, vi,
} from 'vitest';

import {
  playAudioPreview, stopAudioPreview, subscribeAudioPreview,
} from '../src/components/editor/audioPreview';

class FakeAudio {
  static instances: FakeAudio[] = [];

  preload = '';

  loop = false;

  src = '';

  onended: (() => void) | null = null;

  onerror: (() => void) | null = null;

  pause = vi.fn();

  load = vi.fn();

  play = vi.fn().mockResolvedValue(undefined);

  constructor(source?: string) {
    this.src = source ?? '';
    FakeAudio.instances.push(this);
  }

  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
}

vi.stubGlobal('Audio', FakeAudio);

afterEach(() => {
  stopAudioPreview();
});

describe('audio preview', () => {
  test('stops and releases the previous preview before playing another', async () => {
    const states: Array<{ source: string, key: string }> = [];
    const unsubscribe = subscribeAudioPreview((value) => states.push({
      source: value.source,
      key: value.key,
    }));

    await playAudioPreview('/audio/shared.m4a', false, 'first-row');
    await playAudioPreview('/audio/shared.m4a', false, 'second-row');

    const [firstPlayer, secondPlayer] = FakeAudio.instances;
    expect(FakeAudio.instances).toHaveLength(2);
    expect(firstPlayer.pause).toHaveBeenCalledTimes(1);
    expect(firstPlayer.src).toBe('');
    expect(secondPlayer.src).toBe('/audio/shared.m4a');
    expect(secondPlayer.play).toHaveBeenCalledTimes(1);
    expect(states).toEqual([
      { source: '', key: '' },
      { source: '', key: '' },
      { source: '/audio/shared.m4a', key: 'first-row' },
      { source: '', key: '' },
      { source: '/audio/shared.m4a', key: 'second-row' },
    ]);
    unsubscribe();
  });
});
