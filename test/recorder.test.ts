import {
  afterEach, beforeEach, describe, expect, test, vi,
} from 'vitest';

import {
  buildMp4Args, describeCaptureError, formatBytes, formatDuration,
  pickRecorderMimeType, recordingFilename, resolutionWidth, startTabRecording,
} from '../src/story/recorder';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('recordingFilename', () => {
  test('用时间戳命名导出文件', () => {
    expect(recordingFilename(new Date(2026, 7, 30, 9, 5, 3))).toBe('gfStory-20260830-090503.mp4');
  });

  test('支持其他扩展名', () => {
    expect(recordingFilename(new Date(2026, 0, 2, 23, 59, 59), 'webm'))
      .toBe('gfStory-20260102-235959.webm');
  });
});

describe('formatDuration / formatBytes', () => {
  test('把毫秒格式化成 mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(65000)).toBe('01:05');
    expect(formatDuration(3600000)).toBe('60:00');
  });

  test('把字节数格式化成 MB', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('buildMp4Args', () => {
  test('输出 H.264 + AAC 的转码参数', () => {
    const args = buildMp4Args('input.webm', 'output.mp4');
    expect(args[0]).toBe('-i');
    expect(args).toContain('input.webm');
    expect(args).toContain('output.mp4');
    expect(args.indexOf('-i')).toBeLessThan(args.indexOf('output.mp4'));
    expect(args.slice(args.indexOf('-c:v'), args.indexOf('-c:v') + 2)).toEqual(['-c:v', 'libx264']);
    expect(args.slice(args.indexOf('-c:a'), args.indexOf('-c:a') + 2)).toEqual(['-c:a', 'aac']);
    // 画面宽高要取偶，x264 才能接受；同时限制最大宽度，长视频单线程转码才不会太慢。
    const filters = args[args.indexOf('-vf') + 1];
    expect(filters).toContain('trunc(iw/2)*2');
    expect(filters).toContain('scale=min(1280');
    // faststart 让视频上传后可以直接流式播放。
    expect(args).toContain('+faststart');
  });

  test('长录像可以进一步降低转码分辨率', () => {
    const args = buildMp4Args('input.webm', 'output.mp4', 854);
    expect(args[args.indexOf('-vf') + 1]).toContain('scale=min(854');
  });
});

describe('pickRecorderMimeType', () => {
  test('优先选择编码质量更高的 mime', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: (mime: string) => mime.startsWith('video/webm'),
    });
    expect(pickRecorderMimeType()).toBe('video/webm;codecs=vp9,opus');
  });

  test('没有 vp9 时退回 vp8', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: (mime: string) => mime === 'video/webm;codecs=vp8,opus',
    });
    expect(pickRecorderMimeType()).toBe('video/webm;codecs=vp8,opus');
  });

  test('没有任何可用编码器时报错', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: () => false });
    expect(() => pickRecorderMimeType()).toThrow('编码器');
  });

  test('不支持 MediaRecorder 时报错', () => {
    vi.stubGlobal('MediaRecorder', undefined);
    expect(() => pickRecorderMimeType()).toThrow('MediaRecorder');
  });
});

describe('startTabRecording', () => {
  class FakeRecorder {
    static supported: (mime: string) => boolean = () => false;

    static created: FakeRecorder[] = [];

    options: MediaRecorderOptions;

    startArgs: number | 'no-timeslice' = 'no-timeslice';

    ondataavailable: ((event: { data: Blob }) => void) | null = null;

    onstop: (() => void) | null = null;

    onerror: (() => void) | null = null;

    state = 'inactive';

    constructor(_stream: MediaStream, options: MediaRecorderOptions) {
      this.options = options;
      FakeRecorder.created.push(this);
    }

    start(timeslice?: number) {
      this.startArgs = timeslice === undefined ? 'no-timeslice' : timeslice;
    }

    stop() {
      this.state = 'inactive';
    }

    static isTypeSupported(mime: string) {
      return FakeRecorder.supported(mime);
    }
  }

  beforeEach(() => {
    FakeRecorder.created = [];
  });

  test('码率由设置传入并固定在 1080p 短视频常用档位（8Mbps + 192kbps）', () => {
    FakeRecorder.supported = (mime) => mime.startsWith('video/webm');
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    startTabRecording({} as MediaStream, 8000000);
    const [recorder] = FakeRecorder.created;
    expect(recorder.options.mimeType).toBe('video/webm;codecs=vp9,opus');
    expect(recorder.options.videoBitsPerSecond).toBe(8000000);
    expect(recorder.options.audioBitsPerSecond).toBe(192000);
    expect(recorder.startArgs).toBe(1000);
  });

  test('支持原生 MP4 的浏览器优先直接录 MP4（一次性写入，不分时间片）', () => {
    FakeRecorder.supported = (mime) => mime.startsWith('video/mp4');
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    expect(pickRecorderMimeType()).toBe('video/mp4;codecs=avc1.640028,mp4a.40.2');
    startTabRecording({} as MediaStream, 8000000);
    const [recorder] = FakeRecorder.created;
    expect(recorder.options.mimeType).toBe('video/mp4;codecs=avc1.640028,mp4a.40.2');
    expect(recorder.startArgs).toBe('no-timeslice');
  });
});

describe('resolutionWidth', () => {
  test('按 16:9 换算各档分辨率宽度', () => {
    expect(resolutionWidth(1080)).toBe(1920);
    expect(resolutionWidth(720)).toBe(1280);
    expect(resolutionWidth(480)).toBe(854);
  });
});

describe('describeCaptureError', () => {
  test('把取消共享翻译成友好提示', () => {
    expect(describeCaptureError(new DOMException('denied', 'NotAllowedError')))
      .toContain('已取消画面共享');
  });

  test('保留普通错误的原始信息', () => {
    expect(describeCaptureError(new Error('boom'))).toBe('boom');
    expect(describeCaptureError('boom')).toBe('boom');
  });
});
