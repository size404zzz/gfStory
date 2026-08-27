<script setup lang="ts">
import {
  PauseFilled, PlayArrowFilled,
} from '@vicons/material';
import {
  NButton, NIcon, NSpace, NTooltip,
} from 'naive-ui';
import {
  computed, onMounted, onUnmounted, ref,
} from 'vue';

import EditorStoryPreview from './EditorStoryPreview.vue';
import {
  playAudioPreview, stopAudioPreview, subscribeAudioPreview,
} from './audioPreview';
import audioPresets from '../../assets/audio.json';
import backgroundPresets from '../../assets/backgrounds.json';
import {
  AUDIO_PATH_PREFIX, IMAGE_PATH_PREFIX, type AudioInfo, type BackgroundInfo,
} from '../../types/assets';

type BackgroundPreset = {
  name: string,
  id: number,
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

const COMMON_BACKGROUND_SPECS = [
  '0', '1', '128', '129', '136', '137', '138', '139', '140', '141', '142', '143',
  '146', '15', '157', '158', '159', '160', '161', '162', '163', '166', '167', '168',
  '169', '179', '18', '180', '181', '182', '183', '186', '187', '195', '197', '200',
  '201', '202', '203', '204', '206', '207', '208', '209', '21', '219', '22', '221',
  '222', '223', '224', '225', '226', '227', '229', '231', '232', '233', '234', '235',
  '239', '240', '242', '247', '249', '259', '260', '262', '265', '267', '269', '270',
  '271', '272', '273', '276', '281', '282', '283', '287', '288', '289', '29', '296',
  '297', '298', '299', '3', '300', '301', '302', '312', '313', '315', '316', '317',
  '318', '320', '321', '322', '323', '324', '325', '326', '327', '328', '330', '331',
  '332', '336', '337', '338', '339', '34', '340', '341', '343', '344', '345', '346',
  '347', '348', '349', '350', '351', '352', '353', '356', '357', '358', '364', '365',
  '367', '380', '381', '384', '388', '39', '390', '393', '394', '395', '396', '397',
  '398', '4', '40', '408', '409', '41', '410', '412', '413', '414', '415', '417',
  '418', '419', '420', '421', '438', '439', '446', '447', '448', '449', '450', '455',
  '456', '459', '46', '47', '48', '460-487', '5', '506', '507', '510', '527-534',
  '536', '54', '541', '542', '547', '548', '549', '55', '550', '551', '553', '554',
  '563-569', '572-578', '508', '581', '582', '585-599', '6', '604', '605', '607',
  '613', '632', '638', '639', '644', '645', '650-658', '671', '673', '674', '683',
  '684', '685', '688', '697', '698', '699', '7', '70', '702', '703', '704', '71',
  '710-714', '72', '719-723', '725-727', '73', '729-733', '735', '741-760', '764',
  '766', '768', '769', '771', '772', '774', '777-780', '785', '786', '79', '792',
  '794', '797', '798', '799', '8', '80', '801-805', '81', '810-812', '815', '816',
  '82', '819-822', '83', '832-840', '849', '85', '851', '852', '854', '86', '88',
  '89', '890', '891', '893', '900', '901', '96', '97', '98', '99',
];

function expandBackgroundIds(specs: string[]) {
  return specs.flatMap((spec) => {
    const range = /^(\d+)-(\d+)$/.exec(spec);
    if (!range) return [Number(spec)];
    const start = Number(range[1]);
    const end = Number(range[2]);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });
}

const commonBackgroundOrder = new Map(
  expandBackgroundIds(COMMON_BACKGROUND_SPECS).map((id, index) => [id, index]),
);

const backgrounds = computed<BackgroundPreset[]>(() => Object.entries(
  backgroundPresets as BackgroundInfo,
).map(([name, path]) => ({
  name,
  id: Number(name),
  url: `${IMAGE_PATH_PREFIX}${path}`,
})));

const commonBackgrounds = computed(() => backgrounds.value
  .filter((item) => commonBackgroundOrder.has(item.id))
  .sort((left, right) => (
    commonBackgroundOrder.get(left.id)! - commonBackgroundOrder.get(right.id)!
  )));

const cgBackgrounds = computed(() => backgrounds.value
  .filter((item) => !commonBackgroundOrder.has(item.id))
  .sort((left, right) => right.id - left.id));

const musicTracks = computed<MusicPreset[]>(() => Object.entries(
  audioPresets as AudioInfo,
).map(([name, path]) => ({
  name,
  url: `${AUDIO_PATH_PREFIX}${path}`,
})).sort((left, right) => left.name.localeCompare(right.name)));

const backgroundRatios = ref<Record<string, string>>({});
const playingTrack = ref('');
let unsubscribeAudioPreview = () => {};

function rememberBackgroundRatio(item: BackgroundPreset, event: Event) {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.naturalWidth || !image.naturalHeight) return;
  const ratio = `${image.naturalWidth} / ${image.naturalHeight}`;
  if (backgroundRatios.value[item.url] !== ratio) backgroundRatios.value[item.url] = ratio;
}

function stopMusicPreview() {
  stopAudioPreview();
}

function toggleMusicPreview(track: MusicPreset) {
  if (playingTrack.value === track.url) {
    stopMusicPreview();
    return;
  }
  playAudioPreview(track.url);
}

function selectMusic(track: MusicPreset) {
  stopMusicPreview();
  emit('update:music', track.url);
}

onMounted(() => {
  unsubscribeAudioPreview = subscribeAudioPreview((value) => {
    playingTrack.value = value.playing && !value.loop ? value.source : '';
  });
});
onUnmounted(() => {
  unsubscribeAudioPreview();
  stopMusicPreview();
});
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
        <div class="background-library">
          <section class="background-column" aria-label="通用背景">
            <div class="background-column-heading">
              <span>通用</span>
              <span>{{ commonBackgrounds.length }}</span>
            </div>
            <div class="background-grid">
              <button v-for="item in commonBackgrounds" :key="item.url" type="button"
                class="background-choice"
                :class="{ selected: background === item.url }"
                :aria-pressed="background === item.url"
                :style="{ aspectRatio: backgroundRatios[item.url] ?? '1 / 1' }"
                @click="emit('update:background', item.url)"
              >
                <img :src="item.url" :alt="item.name" loading="lazy"
                  @load="rememberBackgroundRatio(item, $event)"
                />
                <span>{{ item.name }}</span>
              </button>
            </div>
          </section>
          <section class="background-column" aria-label="CG 背景">
            <div class="background-column-heading">
              <span>CG</span>
              <span>{{ cgBackgrounds.length }}</span>
            </div>
            <div class="background-grid">
              <button v-for="item in cgBackgrounds" :key="item.url" type="button"
                class="background-choice"
                :class="{ selected: background === item.url }"
                :aria-pressed="background === item.url"
                :style="{ aspectRatio: backgroundRatios[item.url] ?? '1 / 1' }"
                @click="emit('update:background', item.url)"
              >
                <img :src="item.url" :alt="item.name" loading="lazy"
                  @load="rememberBackgroundRatio(item, $event)"
                />
                <span>{{ item.name }}</span>
              </button>
            </div>
          </section>
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

.background-library {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  min-width: 0;
}

.background-column {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.background-column + .background-column {
  border-left: 1px solid rgba(255, 255, 255, 0.1);
}

.background-column-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 13px;
}

.background-column-heading > span:last-child {
  color: rgba(255, 255, 255, 0.45);
}

.background-grid {
  display: flex;
  flex-wrap: wrap;
  align-content: start;
  align-items: flex-start;
  gap: 10px;
  height: min(56vh, 580px);
  min-width: 0;
  overflow-y: auto;
  padding: 0 16px 16px;
}

.background-choice {
  display: block;
  box-sizing: border-box;
  flex: 0 0 calc((100% - 10px) / 2);
  position: relative;
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
  height: auto;
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
    height: 480px;
    max-height: none;
  }

  .background-library {
    grid-template-columns: 1fr;
  }

  .background-column + .background-column {
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    border-left: 0;
  }

  .scene-actions {
    justify-content: space-between;
    padding-bottom: 0;
  }
}
</style>
