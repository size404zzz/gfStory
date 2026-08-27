export type AudioPreviewState = {
  source: string,
  key: string,
  loop: boolean,
  playing: boolean,
};

const stoppedState: AudioPreviewState = {
  source: '',
  key: '',
  loop: false,
  playing: false,
};

let state = stoppedState;
let player: HTMLAudioElement | null = null;
let playbackId = 0;
const subscribers = new Set<(value: AudioPreviewState) => void>();

function notify() {
  subscribers.forEach((subscriber) => subscriber(state));
}

function releasePlayer(audio: HTMLAudioElement | null) {
  if (!audio) return;
  const playerToRelease = audio;
  playerToRelease.onended = null;
  playerToRelease.onerror = null;
  playerToRelease.loop = false;
  playerToRelease.pause();
  playerToRelease.removeAttribute('src');
  playerToRelease.load();
}

export function stopAudioPreview() {
  playbackId += 1;
  releasePlayer(player);
  player = null;
  state = stoppedState;
  notify();
}

export async function playAudioPreview(source: string, loop = false, key = source) {
  stopAudioPreview();
  const audio = new Audio(source);
  audio.preload = 'none';
  player = audio;
  const currentPlaybackId = playbackId;

  audio.loop = loop;
  state = {
    source, key, loop, playing: true,
  };
  notify();

  audio.onended = () => {
    if (currentPlaybackId === playbackId && player === audio && !loop) stopAudioPreview();
  };
  audio.onerror = () => {
    if (currentPlaybackId === playbackId && player === audio) stopAudioPreview();
  };

  try {
    await audio.play();
    return currentPlaybackId === playbackId && player === audio;
  } catch (_) {
    if (currentPlaybackId === playbackId && player === audio) stopAudioPreview();
    return false;
  }
}

export function subscribeAudioPreview(subscriber: (value: AudioPreviewState) => void) {
  subscribers.add(subscriber);
  subscriber(state);
  return () => subscribers.delete(subscriber);
}
