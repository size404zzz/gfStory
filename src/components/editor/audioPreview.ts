export type AudioPreviewState = {
  source: string,
  loop: boolean,
  playing: boolean,
};

const stoppedState: AudioPreviewState = {
  source: '',
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

function getPlayer() {
  if (player) return player;
  player = new Audio();
  player.preload = 'none';
  return player;
}

function releasePlayer() {
  if (!player) return;
  player.onended = null;
  player.onerror = null;
  player.loop = false;
  player.pause();
  player.removeAttribute('src');
  player.load();
}

export function stopAudioPreview() {
  playbackId += 1;
  releasePlayer();
  state = stoppedState;
  notify();
}

export async function playAudioPreview(source: string, loop = false) {
  const audio = getPlayer();
  playbackId += 1;
  const currentPlaybackId = playbackId;

  // Reset the one shared element before assigning a new source. This cancels
  // a pending play request as well as any currently audible preview.
  releasePlayer();
  audio.loop = loop;
  audio.src = source;
  audio.load();
  state = { source, loop, playing: true };
  notify();

  audio.onended = () => {
    if (currentPlaybackId === playbackId && !loop) stopAudioPreview();
  };
  audio.onerror = () => {
    if (currentPlaybackId === playbackId) stopAudioPreview();
  };

  try {
    await audio.play();
    return currentPlaybackId === playbackId;
  } catch (_) {
    if (currentPlaybackId === playbackId) stopAudioPreview();
    return false;
  }
}

export function subscribeAudioPreview(subscriber: (value: AudioPreviewState) => void) {
  subscribers.add(subscriber);
  subscriber(state);
  return () => subscribers.delete(subscriber);
}
