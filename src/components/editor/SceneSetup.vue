<script setup lang="ts">
import {
  PauseFilled, PlayArrowFilled,
} from '@vicons/material';
import {
  NButton, NIcon, NSpace, NTooltip,
} from 'naive-ui';
import {
  computed, onUnmounted, ref,
} from 'vue';

import EditorStoryPreview from './EditorStoryPreview.vue';
import audioPresets from '../../assets/audio.json';
import backgroundPresets from '../../assets/backgrounds.json';
import {
  AUDIO_PATH_PREFIX, IMAGE_PATH_PREFIX, type AudioInfo, type BackgroundInfo,
} from '../../types/assets';

type BackgroundPreset = {
  name: string,
  url: string,
};

type MusicPreset = {
  name: string,
  url: string,
};

defineProps<{
  background: string,
  music: string,
}>();

const emit = defineEmits<{
  'update:background': [value: string],
  'update:music': [value: string],
  back: [],
  continue: [],
}>();

const backgrounds = computed<BackgroundPreset[]>(() => Object.entries(
  backgroundPresets as BackgroundInfo,
).map(([name, path]) => ({
  name,
  url: `${IMAGE_PATH_PREFIX}${path}`,
})).sort((left, right) => left.name.localeCompare(right.name)));

const musicTracks = computed<MusicPreset[]>(() => Object.entries(
  audioPresets as AudioInfo,
).map(([name, path]) => ({
  name,
  url: `${AUDIO_PATH_PREFIX}${path}`,
})).sort((left, right) => left.name.localeCompare(right.name)));

const playingTrack = ref('');
let audioPreview: HTMLAudioElement | null = null;

function stopMusicPreview() {
  audioPreview?.pause();
  audioPreview = null;
  playingTrack.value = '';
}

function toggleMusicPreview(track: MusicPreset) {
  const trackUrl = new URL(track.url, window.location.href).href;
  if (audioPreview?.src === trackUrl) {
    stopMusicPreview();
    return;
  }

  stopMusicPreview();
  const player = new Audio(track.url);
  player.onended = () => {
    if (audioPreview === player) stopMusicPreview();
  };
  audioPreview = player;
  player.play().then(() => {
    if (audioPreview === player) playingTrack.value = track.url;
  }).catch(() => {
    if (audioPreview === player) stopMusicPreview();
  });
}

function selectMusic(track: MusicPreset) {
  if (playingTrack.value !== track.url) stopMusicPreview();
  emit('update:music', track.url);
}

onUnmounted(stopMusicPreview);
</script>

<template>
  <main class="scene-page">
    <div class="scene-selection-grid">
      <section class="asset-pane background-pane" aria-label="背景图片">
        <div class="asset-pane-heading">
          <div>
            <div class="section-heading">背景图片</div>
            <div class="section-description">点击图片选择背景</div>
          </div>
          <span class="asset-count">{{ backgrounds.length }}</span>
        </div>
        <div class="background-grid">
          <button v-for="item in backgrounds" :key="item.url" type="button"
            class="background-choice"
            :class="{ selected: background === item.url }" :aria-pressed="background === item.url"
            @click="emit('update:background', item.url)"
          >
            <img :src="item.url" :alt="item.name" loading="lazy" />
            <span>{{ item.name }}</span>
          </button>
        </div>
      </section>

      <section class="asset-pane music-pane" aria-label="背景音乐">
        <div class="asset-pane-heading">
          <div>
            <div class="section-heading">背景音乐</div>
            <div class="section-description">选择曲目，或试听任意音频</div>
          </div>
          <span class="asset-count">{{ musicTracks.length }}</span>
        </div>
        <div class="music-list">
          <div v-for="track in musicTracks" :key="track.url" class="music-row"
            :class="{ selected: music === track.url }"
          >
            <button type="button" class="music-select" :aria-pressed="music === track.url"
              @click="selectMusic(track)"
            >
              <span>{{ track.name }}</span>
            </button>
            <n-tooltip>
              <template #trigger>
                <n-button circle quaternary
                  :type="playingTrack === track.url ? 'primary' : 'default'"
                  :title="playingTrack === track.url ? '暂停试听' : '试听'"
                  :aria-label="playingTrack === track.url ? '暂停试听' : `试听 ${track.name}`"
                  @click="toggleMusicPreview(track)"
                >
                  <n-icon size="19">
                    <pause-filled v-if="playingTrack === track.url" />
                    <play-arrow-filled v-else />
                  </n-icon>
                </n-button>
              </template>
              {{ playingTrack === track.url ? '暂停试听' : '试听' }}
            </n-tooltip>
          </div>
        </div>
      </section>
    </div>

    <section class="scene-footer">
      <div class="scene-preview">
        <div class="section-heading">场景预览</div>
        <editor-story-preview :background="background" :music="music" :characters="[]"
          :sprites="[]"
        />
      </div>
      <n-space class="scene-actions" justify="end">
        <n-button @click="emit('back')">返回</n-button>
        <n-button type="primary" @click="emit('continue')">开始写对白</n-button>
      </n-space>
    </section>
  </main>
</template>

<style scoped>
.scene-page {
  box-sizing: border-box;
  display: grid;
  gap: 28px;
  width: min(1440px, 100%);
  min-height: calc(100vh - 56px);
  margin: 0 auto;
  padding: 28px 24px 40px;
}

.scene-selection-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(300px, 0.75fr);
  min-width: 0;
  gap: 20px;
}

.asset-pane {
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: #17171b;
}

.asset-pane-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.section-heading {
  color: rgba(255, 255, 255, 0.9);
  font-size: 15px;
}

.section-description {
  margin-top: 5px;
  color: rgba(255, 255, 255, 0.48);
  font-size: 13px;
}

.asset-count {
  min-width: 30px;
  color: rgba(255, 255, 255, 0.58);
  font-size: 13px;
  line-height: 20px;
  text-align: right;
}

.background-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 12px;
  max-height: min(56vh, 580px);
  overflow-y: auto;
  padding: 16px 20px 20px;
}

.background-choice {
  position: relative;
  aspect-ratio: 16 / 9;
  min-width: 0;
  overflow: hidden;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 4px;
  background: #0b0b0e;
  color: #ffffff;
  cursor: pointer;
  text-align: left;
}

.background-choice::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 45%;
  content: '';
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.84));
  pointer-events: none;
}

.background-choice:hover,
.background-choice:focus-visible {
  border-color: rgba(255, 255, 255, 0.8);
  outline: none;
}

.background-choice.selected {
  border-color: #63e2b7;
  box-shadow: 0 0 0 1px rgba(99, 226, 183, 0.45);
}

.background-choice img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.background-choice span {
  position: absolute;
  right: 8px;
  bottom: 7px;
  left: 8px;
  z-index: 1;
  overflow: hidden;
  font-size: 12px;
  line-height: 16px;
  text-overflow: ellipsis;
  text-shadow: 0 1px 2px #000000;
  white-space: nowrap;
}

.music-list {
  display: grid;
  align-content: start;
  gap: 2px;
  max-height: min(56vh, 580px);
  overflow-y: auto;
  padding: 10px;
}

.music-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 38px;
  align-items: center;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: 4px;
}

.music-row:hover {
  background: rgba(255, 255, 255, 0.05);
}

.music-row.selected {
  border-color: rgba(99, 226, 183, 0.68);
  background: rgba(99, 226, 183, 0.1);
}

.music-select {
  min-width: 0;
  padding: 10px 8px 10px 10px;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.87);
  cursor: pointer;
  text-align: left;
}

.music-select:focus-visible {
  outline: 1px solid #63e2b7;
  outline-offset: -1px;
}

.music-select span {
  display: block;
  overflow: hidden;
  font-size: 13px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scene-footer {
  display: grid;
  grid-template-columns: minmax(0, 720px) minmax(0, 1fr);
  align-items: end;
  gap: 28px;
}

.scene-preview {
  min-width: 0;
}

.scene-preview .section-heading {
  margin-bottom: 12px;
}

.scene-actions {
  padding-bottom: 2px;
}

@media (max-width: 800px) {
  .scene-page {
    gap: 20px;
    padding: 16px 16px 32px;
  }

  .scene-selection-grid,
  .scene-footer {
    grid-template-columns: 1fr;
  }

  .background-grid,
  .music-list {
    max-height: 480px;
  }

  .scene-actions {
    justify-content: space-between;
    padding-bottom: 0;
  }
}
</style>
