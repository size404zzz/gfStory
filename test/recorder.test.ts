import {
  afterEach, describe, expect, test, vi,
} from 'vitest';

import {
  buildMp4Args, describeCaptureError, formatBytes, formatDuration,
  pickRecorderMimeType, recordingFilename,
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
    // 画面宽高要取偶，x264 才能接受。
    expect(args[args.indexOf('-vf') + 1]).toContain('trunc(iw/2)*2');
    // faststart 让视频上传后可以直接流式播放。
    expect(args).toContain('+faststart');
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
