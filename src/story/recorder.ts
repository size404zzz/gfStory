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

// 优先直接录制 MP4（Chrome 126+ / Edge / Safari 原生支持，走系统硬件编码器，
// 播完即导出、无需任何转码）；Firefox 等不支持的浏览器才退回 WebM 再本地转码。
const RECORD_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
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
    // 固定在 1080p 短视频的常用档位（B站/YouTube 投稿推荐 8Mbps），保证音画上限。
    videoBitsPerSecond: 8000000,
    audioBitsPerSecond: 192000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };
  // MP4 容器按时间片吐出的分段不一定能直接拼接，等 stop 时一次性取整段；
  // WebM 分段天然可拼接，边录边收还能减小内存峰值。
  if (mimeType.includes('mp4')) {
    recorder.start();
  } else {
    recorder.start(1000);
  }
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

export function buildMp4Args(input: string, output: string, maxDim = 1280): string[] {
  // 宽高取偶（x264 只接受偶数尺寸）；宽度压到 maxDim 以内（高度等比、自动取偶），
  // 单线程 wasm 编码 720p 比 1080p 快一倍以上。faststart 方便上传后直接流式播放。
  return [
    '-i', input,
    '-vf', `crop=trunc(iw/2)*2:trunc(ih/2)*2,scale=min(${maxDim}\\,iw):-2`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
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
  terminate(): Promise<void>,
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

const CORE_CACHE_NAME = 'gfstory-ffmpeg-core-v1';

function cacheStorage(): CacheStorage | null {
  return 'caches' in window ? window.caches : null;
}

/**
 * 下载大文件（ffmpeg 内核）并转成 blob URL：
 * - 优先读 Cache API（首次下载后永久缓存，之后离线也能秒开）；
 * - 边下边通过 onProgress 汇报字节进度（浏览器自身下载大文件很慢且无反馈时，至少让用户看得到动没动）。
 */
async function toCachedBlobURL(
  path: string,
  mime: string,
  onProgress?: (received: number, total: number) => void,
  index = 0,
): Promise<string> {
  if (index >= CDN_MIRRORS.length) {
    throw new Error('所有 CDN 均不可用。');
  }
  const url = `${CDN_MIRRORS[index]}${path}`;
  try {
    const storage = cacheStorage();
    const cache = storage ? await storage.open(CORE_CACHE_NAME).catch(() => null) : null;
    const cached = cache ? await cache.match(url).catch(() => null) : null;
    if (cached) {
      const blob = new Blob([await cached.arrayBuffer()], { type: mime });
      onProgress?.(blob.size, blob.size);
      return URL.createObjectURL(blob);
    }
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      return await toCachedBlobURL(path, mime, onProgress, index + 1);
    }
    const total = Number(res.headers.get('content-length') ?? 0);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    const readAll = async (): Promise<Blob> => {
      const { done, value } = await reader.read();
      if (done) {
        return new Blob(chunks, { type: mime });
      }
      chunks.push(value);
      received += value.byteLength;
      onProgress?.(received, total);
      return readAll();
    };
    const blob = await readAll();
    if (cache) {
      await cache.put(url, new Response(blob)).catch(() => {});
    }
    return URL.createObjectURL(blob);
  } catch (_) { /* 尝试下一个镜像 */ }
  return toCachedBlobURL(path, mime, onProgress, index + 1);
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

async function loadFFmpeg(
  onDownload?: (received: number, total: number) => void,
): Promise<FFmpegLike> {
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
    // 内核 wasm 有 31MB，走带进度与缓存的下载。
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(`${esmCoreBase}/ffmpeg-core.js`, 'text/javascript'),
      toCachedBlobURL(`${umdCoreBase}/ffmpeg-core.wasm`, 'application/wasm', onDownload),
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

export type TranscodeCallbacks = {
  /** 首次加载 ffmpeg 内核时的下载字节进度。 */
  onDownload?: (received: number, total: number) => void,

  /** 转码进度：value 取 0 ~ 1；outputSeconds 是已编码的输出时长。 */
  onProgress?: (value: number, outputSeconds: number) => void,
};

let activeFfmpeg: FFmpegLike | null = null;
let interrupt: ((error: Error) => void) | null = null;

/** 加载或转码超过这么久没有任何事件（进度、字节），就视为卡死并自动中止。 */
const TRANSCODE_IDLE_TIMEOUT_MS = 120000;

/** 超过此时长的录像降到 854 宽转码（单线程 wasm 编码太长太慢）。 */
const LONG_RECORDING_MS = 15 * 60 * 1000;

/**
 * 中止当前转码并终止内核 worker：正在等待的 webmToMp4 会立刻抛错，
 * 调用方可以退回导出原始 WebM。转码太慢时给用户一个逃生门。
 */
export function abortTranscode(reason = '已取消转码。') {
  const reject = interrupt;
  interrupt = null;
  try {
    activeFfmpeg?.terminate();
  } catch (_) { /* worker 可能已经不在了 */ }
  activeFfmpeg = null;
  ffmpegPromise = null;
  reject?.(new Error(reason));
}

/**
 * 把录到的 webm 转成 MP4。
 * @param durationMs 录像时长，用来在 webm 缺少时长元数据（MediaRecorder 常见）时推算进度。
 */
export async function webmToMp4(
  blob: Blob,
  durationMs: number,
  callbacks: TranscodeCallbacks = {},
): Promise<Uint8Array> {
  let lastTick = Date.now();
  const tick = () => {
    lastTick = Date.now();
  };
  const watchdog = setInterval(() => {
    if (Date.now() - lastTick > TRANSCODE_IDLE_TIMEOUT_MS) {
      abortTranscode('转码长时间没有响应，已自动中止。');
    }
  }, 15000);
  let rejectInterrupt: (error: Error) => void;
  const interrupted = new Promise<never>((_, reject) => {
    rejectInterrupt = reject;
  });
  interrupt = (error) => rejectInterrupt(error);
  let ffmpeg: FFmpegLike | null = null;
  let input: string | null = null;
  let output: string | null = null;
  const onProgress = (data: { progress: number, time: number }) => {
    tick();
    const expectedSeconds = durationMs / 1000;
    const byTime = expectedSeconds > 0 ? data.time / 1e6 / expectedSeconds : 0;
    const value = Math.min(1, Math.max(0, Math.max(data.progress || 0, byTime)));
    callbacks.onProgress?.(value, Math.max(0, data.time / 1e6));
  };
  try {
    ffmpeg = await Promise.race([
      loadFFmpeg((received, total) => {
        tick();
        callbacks.onDownload?.(received, total);
      }),
      interrupted,
    ]);
    activeFfmpeg = ffmpeg;
    input = 'input.webm';
    output = 'output.mp4';
    tick();
    const raw = new Uint8Array(await blob.arrayBuffer());
    await Promise.race([ffmpeg.writeFile(input, raw), interrupted]);
    tick();
    ffmpeg.on('progress', onProgress);
    const maxDim = durationMs > LONG_RECORDING_MS ? 854 : 1280;
    const code = await Promise.race([
      ffmpeg.exec(buildMp4Args(input, output, maxDim)),
      interrupted,
    ]);
    if (code !== 0) {
      throw new Error(`ffmpeg 退出码 ${code}`);
    }
    tick();
    const data = await Promise.race([ffmpeg.readFile(output), interrupted]);
    if (typeof data === 'string') {
      throw new Error('ffmpeg 输出格式异常。');
    }
    return data;
  } finally {
    interrupt = null;
    clearInterval(watchdog);
    ffmpeg?.off('progress', onProgress);
    // abortTranscode 会清掉 activeFfmpeg；此时 worker 已死，清理文件的调用会永远悬挂，直接跳过。
    if (activeFfmpeg === ffmpeg && ffmpeg) {
      activeFfmpeg = null;
      if (input) await ffmpeg.deleteFile(input).catch(() => {});
      if (output) await ffmpeg.deleteFile(output).catch(() => {});
    }
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
