// 剧情视频录制：自动播放剧情的同时采集标签页画面，再用 ffmpeg.wasm 转成 MP4。
// ffmpeg 内核（约 31MB）只在真正导出时才从 CDN 按需加载，不会进入构建产物。

export type StoryPlaybackController = {
  /** 剧情是否已加载好、可以开始录制。 */
  ready: boolean,

  /** 从头重载剧情；hold 为 true 时不显示第一行，等正式开录后再 play。 */
  restart(hold: boolean): Promise<void>,

  /** 以指定倍速开始自动播放。 */
  play(speed: number): void,

  /** 剧情是否已经播完。 */
  ended: boolean,

  /** 当前停在选项界面时返回选项个数，否则为 0。 */
  optionsCount: number,

  /** 选择第 index 个选项（从 0 开始）。 */
  choose(index: number): void,
};

export type RecordingSettings = {
  /** 自动播放倍速（1 ~ 10）。 */
  speed: number,

  /** 开录前的倒计时秒数。 */
  countdownSeconds: number,

  /** 停在选项界面多少秒后自动选择第一项。 */
  optionDelaySeconds: number,

  /** 是否采集标签页音频（背景音乐与音效）。 */
  captureAudio: boolean,
};

export const DEFAULT_RECORDING_SETTINGS: RecordingSettings = {
  speed: 1,
  countdownSeconds: 3,
  optionDelaySeconds: 2.5,
  captureAudio: true,
};

/** 剧情播完后额外录制的收尾时长，给「故事结束」留一个结尾镜头。 */
export const RECORDING_TAIL_MS = 2500;

/** 超过这个大小的原始录像放弃 wasm 转码（内存装不下），退回导出 webm。 */
export const MAX_FFMPEG_INPUT_BYTES = 1.5 * 1024 * 1024 * 1024;

const FFMPEG_VERSION = '0.12.15';
const FFMPEG_CORE_VERSION = '0.12.10';

// unpkg 在部分地区不稳定，按顺序尝试几个 CDN 镜像。
const CDN_MIRRORS = [
  'https://unpkg.com/',
  'https://cdn.jsdelivr.net/npm/',
  'https://fastly.jsdelivr.net/npm/',
];

const RECORD_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

export function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('当前浏览器不支持 MediaRecorder，无法录制。');
  }
  const mime = RECORD_MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate));
  if (!mime) {
    throw new Error('当前浏览器没有可用的录像编码器。');
  }
  return mime;
}

export async function requestTabCapture(audio: boolean): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('当前浏览器不支持画面采集，请使用 Chrome 或 Edge。');
  }
  // preferCurrentTab / systemAudio / surfaceSwitching 等 TS 的 DOM 类型里没有，
  // 运行时 Chrome 支持。注意 preferCurrentTab 与 selfBrowserSurface: 'exclude'
  // 互斥（Chromium 会抛 Self-contradictory configuration），所以不能加后者。
  const options = {
    video: {
      frameRate: { ideal: 30 },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: audio
      ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      : false,
    preferCurrentTab: true,
    systemAudio: 'exclude',
    surfaceSwitching: 'exclude',
  } as unknown as DisplayMediaStreamOptions;
  return navigator.mediaDevices.getDisplayMedia(options);
}

export function describeCaptureError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return '已取消画面共享，没有开始录制。';
    if (error.name === 'NotFoundError') return '没有可用的共享来源。';
  }
  return error instanceof Error ? error.message : String(error);
}

export type TabRecording = {
  mimeType: string,
  stop(): Promise<Blob>,
};

/** 立即开始录制一个媒体流，返回用于停止并收集录像的句柄。 */
export function startTabRecording(stream: MediaStream): TabRecording {
  const mimeType = pickRecorderMimeType();
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8000000,
    audioBitsPerSecond: 192000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };
  recorder.start(1000);
  return {
    mimeType,
    stop: () => new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      recorder.onerror = () => reject(new Error('录制过程中出现错误。'));
      if (recorder.state === 'inactive') {
        resolve(new Blob(chunks, { type: mimeType }));
      } else {
        recorder.stop();
      }
    }),
  };
}

export function buildMp4Args(input: string, output: string): string[] {
  // 宽高取偶（x264 只接受偶数尺寸），faststart 方便上传后直接流式播放。
  return [
    '-i', input,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-vf', 'crop=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    output,
  ];
}

type FFmpegLike = {
  load(options: { coreURL: string, wasmURL: string, classWorkerURL?: string }): Promise<boolean>,
  writeFile(name: string, data: Uint8Array): Promise<boolean>,
  readFile(name: string): Promise<Uint8Array | string>,
  deleteFile(name: string): Promise<boolean>,
  exec(args: string[]): Promise<number>,
  on(event: 'progress', callback: (data: { progress: number, time: number }) => void): void,
  off(event: 'progress', callback: (data: { progress: number, time: number }) => void): void,
};

declare global {
  interface Window {
    FFmpegWASM?: { FFmpeg: new () => FFmpegLike },
  }
}

async function fetchWithMirrors(path: string, index = 0): Promise<{ res: Response, base: string }> {
  if (index >= CDN_MIRRORS.length) {
    throw new Error('所有 CDN 均不可用。');
  }
  try {
    const res = await fetch(`${CDN_MIRRORS[index]}${path}`);
    if (res.ok) {
      return { res, base: CDN_MIRRORS[index] };
    }
  } catch (_) { /* 尝试下一个镜像 */ }
  return fetchWithMirrors(path, index + 1);
}

async function toBlobURL(path: string, mime: string): Promise<string> {
  const { res } = await fetchWithMirrors(path);
  return URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: mime }));
}

function loadScriptFromMirrors(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let index = 0;
    const tryNext = () => {
      if (index >= CDN_MIRRORS.length) {
        reject(new Error('无法从 CDN 加载 ffmpeg。'));
        return;
      }
      const script = document.createElement('script');
      script.src = `${CDN_MIRRORS[index]}${path}`;
      script.onload = () => resolve();
      script.onerror = () => {
        index += 1;
        script.remove();
        tryNext();
      };
      document.head.appendChild(script);
    };
    tryNext();
  });
}

async function toWorkerBlobURL(
  path: string,
  rewrite: (code: string, base: string) => string,
): Promise<string> {
  const { res, base } = await fetchWithMirrors(path);
  return URL.createObjectURL(new Blob([rewrite(await res.text(), base)], { type: 'text/javascript' }));
}

let ffmpegPromise: Promise<FFmpegLike> | null = null;

async function loadFFmpeg(): Promise<FFmpegLike> {
  if (ffmpegPromise) {
    return ffmpegPromise;
  }
  ffmpegPromise = (async () => {
    if (!window.FFmpegWASM) {
      await loadScriptFromMirrors(`@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/umd/ffmpeg.js`);
    }
    const FFmpeg = window.FFmpegWASM?.FFmpeg;
    if (!FFmpeg) {
      throw new Error('加载 ffmpeg 失败。');
    }
    const umdCoreBase = `@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;
    const esmCoreBase = `@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`;
    const esmFfmpegBase = `@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/esm`;
    // UMD 包里的 class worker（814.ffmpeg.js）是以 module worker 启动的，
    // 它的 importScripts 兜底是 webpack 桩、必然抛 MODULE_NOT_FOUND。
    // 这里改用官方 ESM worker：它支持 module worker 的动态 import，
    // 仅有的两个相对导入要改写成 CDN 绝对地址（blob worker 解析不了相对路径）。
    const classWorkerURL = await toWorkerBlobURL(
      `${esmFfmpegBase}/worker.js`,
      (code, base) => code
        .replace(/from ["']\.\/const\.js["']/g, `from "${base}${esmFfmpegBase}/const.js"`)
        .replace(/from ["']\.\/errors\.js["']/g, `from "${base}${esmFfmpegBase}/errors.js"`),
    );
    // worker 与内核都从 CDN 拿，跨域脚本要用 blob URL 才能起 Worker。
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(`${esmCoreBase}/ffmpeg-core.js`, 'text/javascript'),
      toBlobURL(`${umdCoreBase}/ffmpeg-core.wasm`, 'application/wasm'),
    ]);
    const ffmpeg = new FFmpeg();
    await ffmpeg.load({ coreURL, wasmURL, classWorkerURL });
    return ffmpeg;
  })();
  try {
    return await ffmpegPromise;
  } catch (error) {
    ffmpegPromise = null; // 允许下次重试
    throw error;
  }
}

/** 把录到的 webm 转成 MP4；progress 取值 0 ~ 1。 */
export async function webmToMp4(
  blob: Blob,
  progress?: (value: number) => void,
): Promise<Uint8Array> {
  const ffmpeg = await loadFFmpeg();
  const input = 'input.webm';
  const output = 'output.mp4';
  await ffmpeg.writeFile(input, new Uint8Array(await blob.arrayBuffer()));
  const onProgress = (data: { progress: number, time: number }) => {
    progress?.(Math.max(0, Math.min(1, data.progress)));
  };
  ffmpeg.on('progress', onProgress);
  try {
    const code = await ffmpeg.exec(buildMp4Args(input, output));
    if (code !== 0) {
      throw new Error(`ffmpeg 退出码 ${code}`);
    }
    const data = await ffmpeg.readFile(output);
    if (typeof data === 'string') {
      throw new Error('ffmpeg 输出格式异常。');
    }
    return data;
  } finally {
    ffmpeg.off('progress', onProgress);
    await ffmpeg.deleteFile(input).catch(() => {});
    await ffmpeg.deleteFile(output).catch(() => {});
  }
}

function pad2(value: number) {
  return `${value}`.padStart(2, '0');
}

export function recordingFilename(now: Date = new Date(), ext = 'mp4'): string {
  const date = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const time = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  return `gfStory-${date}-${time}.${ext}`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

export function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
