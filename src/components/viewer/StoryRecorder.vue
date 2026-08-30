<script setup lang="ts">
import { VideocamFilled } from '@vicons/material';
import { saveAs } from 'file-saver';
import {
  computed, onMounted, onUnmounted, ref, watch,
} from 'vue';

import {
  DEFAULT_RECORDING_SETTINGS, MAX_FFMPEG_INPUT_BYTES, RECORDING_TAIL_MS,
  abortTranscode, describeCaptureError, formatBytes, formatDuration,
  recordingFilename, requestTabCapture, startTabRecording, webmToMp4,
  type RecordingSettings, type StoryPlaybackController,
} from '../../story/recorder';

const props = defineProps<{
  controller: StoryPlaybackController,

  /** 挂载后直接弹出录制设置（编辑器的「录制视频」入口用）。 */
  autoOpen?: boolean,
}>();

// eslint-disable-next-line no-spaced-func
const emit = defineEmits<{
  (event: 'active', active: boolean): void,
}>();

type Phase = 'idle' | 'settings' | 'requesting' | 'countdown' | 'recording' | 'processing' | 'finished';
type Outcome = { file: string, size: number, fallback: boolean };

const phase = ref<Phase>('idle');
const failure = ref('');
const outcome = ref<Outcome | null>(null);
const settings = ref<RecordingSettings>({ ...DEFAULT_RECORDING_SETTINGS });
const countdownLeft = ref(0);
const elapsedMs = ref(0);
const transcodeStage = ref<'ffmpeg' | 'transcode'>('ffmpeg');
const transcodeProgress = ref(0);
const outputSeconds = ref(0);
const downloadReceived = ref(0);
const downloadTotal = ref(0);
const processingMs = ref(0);

const sessionActive = computed(() => (
  phase.value === 'countdown'
  || phase.value === 'recording'
  || phase.value === 'processing'
));

const downloadRatio = computed(() => (
  downloadTotal.value > 0 ? Math.min(1, downloadReceived.value / downloadTotal.value) : 0
));

// 处理阶段用秒表让用户确认流程还活着。
let processingTicker: ReturnType<typeof setInterval> | undefined;
watch(phase, (value) => {
  if (value === 'processing') {
    processingMs.value = 0;
    processingTicker = setInterval(() => {
      processingMs.value += 1000;
    }, 1000);
  } else if (processingTicker) {
    clearInterval(processingTicker);
    processingTicker = undefined;
  }
});

let stream: MediaStream | null = null;
let recording: { mimeType: string, stop(): Promise<Blob> } | null = null;
let ticker: ReturnType<typeof setInterval> | undefined;
let optionTimer: ReturnType<typeof setTimeout> | undefined;
let startedAt = 0;
let titleBackup: string | null = null;
let countdownAborted = false;
let finished = false;

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function openSettings() {
  failure.value = '';
  outcome.value = null;
  phase.value = 'settings';
}

function closeOverlays() {
  phase.value = 'idle';
}

function releaseStream() {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
}

function restoreTitle() {
  if (titleBackup !== null) {
    document.title = titleBackup;
    titleBackup = null;
  }
}

function stopTimers() {
  if (ticker) {
    clearInterval(ticker);
    ticker = undefined;
  }
  if (optionTimer) {
    clearTimeout(optionTimer);
    optionTimer = undefined;
  }
}

/** 中止一次尚未导出的会话，丢掉已录制的内容。 */
function abortSession() {
  countdownAborted = true;
  stopTimers();
  if (recording) {
    recording.stop().catch(() => {});
    recording = null;
  }
  releaseStream();
  restoreTitle();
  emit('active', false);
  phase.value = 'idle';
}

async function finishRecording(reason: string) {
  if (finished) {
    return;
  }
  finished = true;
  stopTimers();
  // 在「故事结束」画面上多录几秒，作为结尾镜头。
  await sleep(RECORDING_TAIL_MS);
  const current = recording;
  recording = null;
  let blob: Blob | null = null;
  let mimeType = '';
  if (current) {
    mimeType = current.mimeType;
    try {
      blob = await current.stop();
    } catch (error) {
      failure.value = describeCaptureError(error);
    }
  }
  releaseStream();
  restoreTitle();
  emit('active', false);
  if (!blob || blob.size === 0) {
    outcome.value = null;
    failure.value = failure.value || `没有录到任何内容（${reason}）。`;
    phase.value = 'finished';
    return;
  }
  if (mimeType.includes('mp4')) {
    // Chrome 126+ / Edge / Safari 直接录出的就是 MP4，无需任何转码，立即导出。
    const name = recordingFilename();
    saveAs(blob, name);
    outcome.value = { file: name, size: blob.size, fallback: false };
    phase.value = 'finished';
    return;
  }
  phase.value = 'processing';
  transcodeStage.value = 'ffmpeg';
  transcodeProgress.value = 0;
  outputSeconds.value = 0;
  downloadReceived.value = 0;
  downloadTotal.value = 0;
  const name = recordingFilename();
  try {
    if (blob.size > MAX_FFMPEG_INPUT_BYTES) {
      throw new Error('原始录像过大，超出内置转码能力');
    }
    const mp4 = await webmToMp4(blob, elapsedMs.value, {
      onDownload: (received, total) => {
        downloadReceived.value = received;
        downloadTotal.value = total;
      },
      onProgress: (value, seconds) => {
        transcodeStage.value = 'transcode';
        transcodeProgress.value = value;
        outputSeconds.value = seconds;
      },
    });
    saveAs(new Blob([mp4], { type: 'video/mp4' }), name);
    outcome.value = { file: name, size: mp4.byteLength, fallback: false };
    phase.value = 'finished';
  } catch (error) {
    // 转不成 MP4 时退回原始录像，保证功能不至于完全不可用。
    const fallbackName = recordingFilename(new Date(), mimeType.includes('mp4') ? 'mp4' : 'webm');
    saveAs(blob, fallbackName);
    outcome.value = { file: fallbackName, size: blob.size, fallback: true };
    const message = describeCaptureError(error);
    failure.value = message.includes('取消')
      ? '已取消 MP4 转码，已直接导出原始 WebM 录像。'
      : `MP4 转换失败：${message}。已改为导出原始录像。`;
    phase.value = 'finished';
  }
}

/** 「转码太慢」的逃生门：中止 ffmpeg 并直接导出 WebM。 */
function cancelTranscode() {
  abortTranscode();
}

function watchPlayback() {
  if (finished) {
    return;
  }
  if (props.controller.ended) {
    finishRecording('剧情播放完毕');
    return;
  }
  if (props.controller.optionsCount > 0) {
    if (!optionTimer) {
      const delay = Math.max(0.5, settings.value.optionDelaySeconds) * 1000;
      optionTimer = setTimeout(() => {
        optionTimer = undefined;
        props.controller.choose(0);
      }, delay);
    }
  } else if (optionTimer) {
    clearTimeout(optionTimer);
    optionTimer = undefined;
  }
}

async function runCountdown() {
  if (countdownAborted || countdownLeft.value <= 0) {
    return;
  }
  await sleep(1000);
  if (countdownAborted) {
    return;
  }
  countdownLeft.value -= 1;
  await runCountdown();
}

async function startRecording() {
  if (countdownAborted || !stream) {
    return;
  }
  phase.value = 'recording';
  // 等倒计时遮罩真正消失后再开录，避免把它录进视频。
  await sleep(200);
  if (countdownAborted || !stream) {
    return;
  }
  try {
    recording = startTabRecording(stream);
  } catch (error) {
    abortSession();
    phase.value = 'settings';
    failure.value = describeCaptureError(error);
    return;
  }
  if (titleBackup === null) {
    titleBackup = document.title;
  }
  document.title = `● 录制中 — ${titleBackup}`;
  startedAt = Date.now();
  elapsedMs.value = 0;
  ticker = setInterval(() => {
    elapsedMs.value = Date.now() - startedAt;
    watchPlayback();
  }, 250);
  props.controller.play(settings.value.speed);
}

async function runSession() {
  try {
    stream = await requestTabCapture(settings.value.captureAudio);
  } catch (error) {
    phase.value = 'settings';
    failure.value = describeCaptureError(error);
    return;
  }
  stream.getVideoTracks().forEach((track) => {
    track.addEventListener('ended', () => finishRecording('画面共享已结束'));
  });
  titleBackup = document.title;
  emit('active', true);
  phase.value = 'countdown';
  try {
    // 预先把剧情重置回第一行，但先不显示，等正式开录。
    await props.controller.restart(true);
  } catch (error) {
    abortSession();
    phase.value = 'settings';
    failure.value = describeCaptureError(error);
    return;
  }
  countdownLeft.value = Math.max(0, Math.round(settings.value.countdownSeconds));
  await runCountdown();
  await startRecording();
}

function beginSession() {
  failure.value = '';
  outcome.value = null;
  countdownAborted = false;
  finished = false;
  phase.value = 'requesting';
  runSession();
}

function onKeyDown(event: KeyboardEvent) {
  if (phase.value !== 'recording' && phase.value !== 'countdown') {
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    if (phase.value === 'countdown') {
      abortSession();
    } else {
      finishRecording('手动结束录制');
    }
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    // 录制期间屏蔽会影响自动播放的按键。
    event.preventDefault();
    event.stopPropagation();
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown, true);
  if (props.autoOpen) {
    openSettings();
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown, true);
  abortSession();
});
</script>

<template>
  <button
    v-if="controller.ready || sessionActive"
    :class="{ toggled: sessionActive }"
    :disabled="!controller.ready"
    title="录制剧情视频"
    @click="openSettings"
  >
    <videocam-filled></videocam-filled><span>录制</span>
  </button>

  <teleport to="body">
    <!-- 录制设置 -->
    <div v-if="phase === 'settings' || phase === 'requesting'" class="recorder-backdrop">
      <div class="recorder-card">
        <h3>录制剧情视频</h3>
        <ol class="recorder-steps">
          <li>浏览器会弹出共享窗口：选择<b>「此标签页」</b>，并勾选<b>「同时分享标签页音频」</b>。</li>
          <li>确认后剧情会自动从头播放，遇到选项停留片刻后自动选择第一项。</li>
          <li>录制期间请保持本标签页可见，按 <b>Esc</b> 可随时结束并导出视频。</li>
        </ol>
        <div class="recorder-options">
          <label>
            <span>播放倍速</span>
            <input v-model.number="settings.speed" type="range" min="1" max="10" step="1" />
            <span class="recorder-value">{{ settings.speed }}×</span>
          </label>
          <label>
            <span>选项停留</span>
            <input v-model.number="settings.optionDelaySeconds" type="number"
              min="0.5" max="10" step="0.5" />
            <span class="recorder-value">秒</span>
          </label>
          <label>
            <span>开录倒计时</span>
            <input v-model.number="settings.countdownSeconds" type="number"
              min="1" max="10" step="1" />
            <span class="recorder-value">秒</span>
          </label>
          <label class="recorder-check">
            <input v-model="settings.captureAudio" type="checkbox" />
            采集标签页音频（背景音乐与音效）
          </label>
        </div>
        <p class="recorder-note">
          需要 Chrome / Edge / Safari：直接录制 MP4（硬件编码），播完即导出、无需转码。
          其他浏览器（如 Firefox）会录制 WebM，导出时再在本地转码成 MP4——单线程进行、
          长录像偏慢，可随时取消并直接导出 WebM。
        </p>
        <p v-if="failure" class="recorder-error">{{ failure }}</p>
        <div class="recorder-actions">
          <button class="primary" :disabled="phase === 'requesting'" @click="beginSession">
            {{ phase === 'requesting' ? '等待共享…' : '开始录制' }}
          </button>
          <button @click="closeOverlays">取消</button>
        </div>
      </div>
    </div>

    <!-- 倒计时：此时还没有开始录制，遮罩不会进入视频。 -->
    <div v-else-if="phase === 'countdown'" class="recorder-backdrop recorder-opaque">
      <div class="recorder-count">{{ countdownLeft > 0 ? countdownLeft : '' }}</div>
      <div class="recorder-hint">即将从头自动播放并录制，按 Esc 可取消</div>
    </div>

    <!-- 转码进度 -->
    <div v-else-if="phase === 'processing'" class="recorder-backdrop">
      <div class="recorder-card">
        <h3>{{ transcodeStage === 'ffmpeg' ? '正在加载 FFmpeg 内核…' : '正在转码为 MP4…' }}</h3>
        <template v-if="transcodeStage === 'ffmpeg'">
          <p class="recorder-note">
            首次加载约 31MB，下载后会缓存，下次不用重新下载。
          </p>
          <template v-if="downloadTotal > 0">
            <div class="recorder-bar">
              <div class="recorder-bar-fill"
                :style="{ width: `${Math.round(downloadRatio * 100)}%` }"></div>
            </div>
            <p class="recorder-note">
              {{ formatBytes(downloadReceived) }} / {{ formatBytes(downloadTotal) }}
              · 已用时 {{ formatDuration(processingMs) }}
            </p>
          </template>
          <p v-else class="recorder-note">
            已下载 {{ formatBytes(downloadReceived) }}
            · 已用时 {{ formatDuration(processingMs) }}
          </p>
        </template>
        <template v-else>
          <div class="recorder-bar">
            <div class="recorder-bar-fill"
              :style="{ width: `${Math.round(transcodeProgress * 100)}%` }"></div>
          </div>
          <p class="recorder-note">
            已转出 {{ Math.round(transcodeProgress * 100) }}%
            （{{ formatDuration(outputSeconds * 1000) }} / {{ formatDuration(elapsedMs) }}）
            · 已用时 {{ formatDuration(processingMs) }}
          </p>
          <p class="recorder-note">
            转码在浏览器里单线程进行，长视频可能需要几分钟；嫌慢可以直接导出 WebM。
          </p>
          <div class="recorder-actions">
            <button @click="cancelTranscode">取消并导出 WebM</button>
          </div>
        </template>
      </div>
    </div>

    <!-- 完成 / 失败 -->
    <div v-else-if="phase === 'finished'" class="recorder-backdrop">
      <div class="recorder-card">
        <h3>录制完成</h3>
        <p v-if="outcome">
          已导出 <b>{{ outcome.file }}</b>（{{ formatBytes(outcome.size) }}）。
        </p>
        <p v-if="outcome?.fallback" class="recorder-error">未能转换成 MP4，导出的是原始录像。</p>
        <p v-if="failure" class="recorder-error">{{ failure }}</p>
        <div class="recorder-actions">
          <button class="primary" @click="closeOverlays">完成</button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.recorder-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 72%);
}

.recorder-backdrop.recorder-opaque {
  background: #000;
}

.recorder-card {
  box-sizing: border-box;
  width: min(92vw, 460px);
  padding: 20px 24px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 4px;
  background: #18181c;
  color: rgba(255, 255, 255, 0.88);
  filter: drop-shadow(0 4px 16px rgb(0 0 0 / 60%));
}

.recorder-card h3 {
  margin: 0 0 12px;
  font-size: 1.1em;
}

.recorder-steps {
  margin: 0 0 14px;
  padding-left: 1.4em;
  font-size: 0.9em;
  line-height: 1.7;
}

.recorder-steps b {
  color: #fdb300;
}

.recorder-options {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
  font-size: 0.9em;
}

.recorder-options > label {
  display: flex;
  align-items: center;
  gap: 10px;
}

.recorder-options > label > span:first-child {
  flex: 0 0 5.5em;
}

.recorder-options input[type='range'] {
  flex: 1;
  accent-color: #fdb300;
}

.recorder-options input[type='number'] {
  box-sizing: border-box;
  width: 5em;
  padding: 3px 6px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 3px;
  background: #0000;
  color: inherit;
}

.recorder-check {
  justify-content: flex-start !important;
}

.recorder-check input {
  accent-color: #fdb300;
}

.recorder-value {
  color: rgba(255, 255, 255, 0.6);
}

.recorder-note {
  margin: 0 0 12px;
  font-size: 0.82em;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.55);
}

.recorder-error {
  margin: 0 0 12px;
  font-size: 0.85em;
  color: #e88080;
}

.recorder-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.recorder-actions button {
  padding: 6px 16px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 3px;
  background: #0000;
  color: inherit;
  cursor: pointer;
}

.recorder-actions button.primary {
  border-color: #fdb300;
  color: #fdb300;
}

.recorder-actions button.primary:disabled {
  opacity: 0.5;
  cursor: default;
}

.recorder-actions button:not(.primary):hover,
.recorder-actions button.primary:hover:not(:disabled) {
  box-shadow: 0 0 4px rgb(253 179 0 / 70%);
}

.recorder-count {
  font-size: 6em;
  font-weight: bold;
  color: #fdb300;
  text-shadow: 0 0 24px rgb(253 179 0 / 60%);
}

.recorder-hint {
  margin-top: 1em;
  color: rgba(255, 255, 255, 0.55);
}

.recorder-bar {
  width: 100%;
  height: 8px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  overflow: hidden;
}

.recorder-bar-fill {
  height: 100%;
  background: #fdb300;
  transition: width 0.2s;
}
</style>
