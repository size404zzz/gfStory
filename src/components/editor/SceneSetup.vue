<script setup lang="ts">
import {
  ArrowDropDownFilled, ArrowRightFilled, DeleteOutlined, DownloadOutlined,
  PauseFilled, PlayArrowFilled, PlaylistAddOutlined, RestartAltOutlined,
  RestoreFromTrashOutlined,
} from '@vicons/material';
import {
  NButton, NIcon, NPopconfirm, NSpace, NTooltip,
} from 'naive-ui';
import {
  computed, onMounted, onUnmounted, ref, watch,
} from 'vue';
import { saveAs } from 'file-saver';

import EditorStoryPreview from './EditorStoryPreview.vue';
import {
  playAudioPreview, stopAudioPreview, subscribeAudioPreview,
} from './audioPreview';
import audioPresets from '../../assets/audio.json';
import backgroundCategories from '../../assets/background-categories.json';
import backgroundRemovals from '../../assets/background-removals.json';
import backgroundPresets from '../../assets/backgrounds.json';
import {
  AUDIO_PATH_PREFIX, IMAGE_PATH_PREFIX, type AudioInfo, type BackgroundInfo,
} from '../../types/assets';

type BackgroundPreset = {
  name: string,
  id: number,
  url: string,
};

type BackgroundGroup = {
  id: string,
  label: string,
  backgrounds: BackgroundPreset[],
};

type BackgroundReviewState = {
  categories: Record<string, string>,
  labels: Record<string, string>,
  removed: Record<string, string>,
};

type MusicPreset = {
  id: string,
  name: string,
  url: string,
};

type MusicGroup = {
  id: string,
  label: string,
  tracks: MusicPreset[],
};

type MusicReviewState = {
  labels: Record<string, string>,
  customGroups: string[],
  deletedGroups: Record<string, string>,
  assignments: Record<string, string>,
  removed: Record<string, string>,
};

const props = defineProps<{
  background: string,
  music: string,
}>();

const emit = defineEmits<{
  'update:background': [value: string],
  'update:music': [value: string],
  back: [],
  continue: [],
}>();

const BACKGROUND_CATEGORY_ORDER = [
  'city', 'nature', 'indoor', 'battle', 'character', 'event', 'special', 'other',
];

const BACKGROUND_CATEGORY_LABELS: Record<string, string> = {
  city: '城市景观',
  nature: '自然景观',
  indoor: '室内场景',
  battle: '战斗场景',
  character: '人物弧光',
  event: '心智平层',
  special: '其他画面',
  other: '联动角色',
};

const BACKGROUND_REVIEW_STORAGE_KEY = 'gfstory.background-category-review.v1';
const DEFAULT_BACKGROUND_CATEGORIES = backgroundCategories as Record<string, string>;
const DEFAULT_BACKGROUND_REMOVALS = backgroundRemovals as string[];

function defaultBackgroundRemovals() {
  return Object.fromEntries(
    DEFAULT_BACKGROUND_REMOVALS.map((identifier) => [identifier, DEFAULT_BACKGROUND_CATEGORIES[identifier] ?? 'other']),
  );
}

const UNGROUPED_MUSIC_GROUP = '_ungrouped';
const MUSIC_REVIEW_STORAGE_KEY = 'gfstory.music-catalog-review.v1';

const backgrounds = computed<BackgroundPreset[]>(() => Object.entries(
  backgroundPresets as BackgroundInfo,
).map(([name, path]) => ({
  name,
  id: Number(name),
  url: `${IMAGE_PATH_PREFIX}${path}`,
})).sort((left, right) => left.id - right.id));

const categoryByBackground = ref<Record<string, string>>({ ...DEFAULT_BACKGROUND_CATEGORIES });
const categoryLabels = ref<Record<string, string>>({ ...BACKGROUND_CATEGORY_LABELS });
const removedBackgrounds = ref<Record<string, string>>(defaultBackgroundRemovals());
const reviewingBackgrounds = ref(false);
const draggingBackground = ref<string | null>(null);

function knownBackgroundCategory(category: unknown): category is string {
  return typeof category === 'string' && BACKGROUND_CATEGORY_ORDER.includes(category);
}

function backgroundCategory(item: BackgroundPreset) {
  const category = categoryByBackground.value[item.name] ?? 'other';
  return knownBackgroundCategory(category) ? category : 'other';
}

function backgroundCategoryLabel(category: string) {
  return categoryLabels.value[category]?.trim() || BACKGROUND_CATEGORY_LABELS[category];
}

function backgroundRemoved(item: BackgroundPreset) {
  return Object.prototype.hasOwnProperty.call(removedBackgrounds.value, item.name);
}

const backgroundGroups = computed<BackgroundGroup[]>(() => {
  const groups = new Map(BACKGROUND_CATEGORY_ORDER.map((id) => [id, [] as BackgroundPreset[]]));
  backgrounds.value.forEach((item) => {
    if (!backgroundRemoved(item)) groups.get(backgroundCategory(item))!.push(item);
  });
  return BACKGROUND_CATEGORY_ORDER.map((id) => ({
    id,
    label: backgroundCategoryLabel(id),
    backgrounds: groups.get(id)!,
  })).filter((group) => group.backgrounds.length > 0);
});

const reviewBackgroundGroups = computed<BackgroundGroup[]>(() => {
  const groups = new Map(BACKGROUND_CATEGORY_ORDER.map((id) => [id, [] as BackgroundPreset[]]));
  backgrounds.value.forEach((item) => {
    if (!backgroundRemoved(item)) groups.get(backgroundCategory(item))!.push(item);
  });
  return BACKGROUND_CATEGORY_ORDER.map((id) => ({
    id,
    label: backgroundCategoryLabel(id),
    backgrounds: groups.get(id)!,
  }));
});

const removedBackgroundItems = computed(() => backgrounds.value.filter(backgroundRemoved));

const musicTracks = computed<MusicPreset[]>(() => Object.entries(
  audioPresets as AudioInfo,
).map(([name, path]) => ({
  id: name,
  name,
  url: `${AUDIO_PATH_PREFIX}${path}`,
})).sort((left, right) => left.name.localeCompare(right.name)));

function musicGroupId(name: string) {
  if (/^\d+$/.test(name)) return 'number';
  const delimitedPrefix = /^([A-Za-z0-9]+)[_-]/.exec(name)?.[1];
  if (delimitedPrefix) return delimitedPrefix.toUpperCase();
  const alphabeticPrefix = /^[A-Za-z]+/.exec(name)?.[0];
  return alphabeticPrefix?.toUpperCase() ?? 'other';
}

function defaultMusicGroupLabel(id: string) {
  if (id === UNGROUPED_MUSIC_GROUP) return '未分组';
  if (id === 'number') return '数字编号';
  if (id === 'other') return '其他';
  return id;
}

function musicGroupLabel(id: string) {
  return musicLabels.value[id]?.trim() || defaultMusicGroupLabel(id);
}

const reviewingMusic = ref(false);
const musicLabels = ref<Record<string, string>>({});
const customMusicGroups = ref<string[]>([]);
const deletedMusicGroups = ref<Record<string, string>>({});
const musicAssignments = ref<Record<string, string>>({});
const removedMusicTracks = ref<Record<string, string>>({});
const draggingTrack = ref<string | null>(null);
let musicGroupCounter = 0;

function trackRemoved(track: MusicPreset) {
  return Object.prototype.hasOwnProperty.call(removedMusicTracks.value, track.id);
}

function trackGroupId(track: MusicPreset) {
  const override = musicAssignments.value[track.id];
  if (override !== undefined && override !== UNGROUPED_MUSIC_GROUP && deletedMusicGroups.value[override] === undefined) {
    return override;
  }
  if (override === UNGROUPED_MUSIC_GROUP) return override;
  const derived = musicGroupId(track.name);
  return deletedMusicGroups.value[derived] !== undefined ? UNGROUPED_MUSIC_GROUP : derived;
}

function materializeMusicLabels() {
  musicTracks.value.forEach((track) => {
    const id = musicGroupId(track.name);
    if (!(id in musicLabels.value)) musicLabels.value[id] = defaultMusicGroupLabel(id);
  });
  customMusicGroups.value.forEach((id) => {
    if (!(id in musicLabels.value)) musicLabels.value[id] = '新条目';
  });
  if (!(UNGROUPED_MUSIC_GROUP in musicLabels.value)) {
    musicLabels.value[UNGROUPED_MUSIC_GROUP] = defaultMusicGroupLabel(UNGROUPED_MUSIC_GROUP);
  }
}

const activeMusicTracks = computed(() => musicTracks.value.filter((track) => !trackRemoved(track)));

const removedMusicItems = computed(() => musicTracks.value.filter(trackRemoved));

function buildMusicBuckets() {
  const buckets = new Map<string, MusicPreset[]>();
  activeMusicTracks.value.forEach((track) => {
    const id = trackGroupId(track);
    const tracks = buckets.get(id) ?? [];
    tracks.push(track);
    buckets.set(id, tracks);
  });
  return buckets;
}

function sortMusicGroups(groups: MusicGroup[]) {
  return groups.sort((left, right) => left.label.localeCompare(right.label, 'zh-Hans-CN'));
}

const musicGroups = computed<MusicGroup[]>(() => sortMusicGroups(Array.from(
  buildMusicBuckets(),
  ([id, tracks]) => ({ id, label: musicGroupLabel(id), tracks }),
)));

const reviewMusicGroups = computed<MusicGroup[]>(() => {
  const buckets = buildMusicBuckets();
  const groups: MusicGroup[] = [];
  customMusicGroups.value.forEach((id) => {
    groups.push({ id, label: musicGroupLabel(id), tracks: buckets.get(id) ?? [] });
  });
  Array.from(buckets.keys())
    .filter((id) => !customMusicGroups.value.includes(id))
    .forEach((id) => groups.push({ id, label: musicGroupLabel(id), tracks: buckets.get(id)! }));
  return sortMusicGroups(groups.filter(
    (group) => group.tracks.length > 0 || customMusicGroups.value.includes(group.id),
  ));
});

function createMusicGroup() {
  let id = '';
  do {
    musicGroupCounter += 1;
    id = `_custom_${musicGroupCounter}`;
  } while (customMusicGroups.value.includes(id));
  const existingLabels = new Set(Object.values(musicLabels.value));
  let suffix = 0;
  while (existingLabels.has(`新条目${suffix ? ` ${suffix}` : ''}`)) suffix += 1;
  customMusicGroups.value = [...customMusicGroups.value, id];
  musicLabels.value[id] = `新条目${suffix ? ` ${suffix}` : ''}`;
}

function deleteMusicGroup(group: MusicGroup) {
  if (group.id === UNGROUPED_MUSIC_GROUP) return;
  if (customMusicGroups.value.includes(group.id)) {
    customMusicGroups.value = customMusicGroups.value.filter((id) => id !== group.id);
  } else {
    deletedMusicGroups.value = { ...deletedMusicGroups.value, [group.id]: '' };
  }
  const retargeted: Record<string, string> = {};
  Object.entries(musicAssignments.value).forEach(([identifier, target]) => {
    retargeted[identifier] = target === group.id ? UNGROUPED_MUSIC_GROUP : target;
  });
  musicAssignments.value = retargeted;
  const remainingLabels = { ...musicLabels.value };
  delete remainingLabels[group.id];
  musicLabels.value = remainingLabels;
  if (playingTrack.value !== '' && group.tracks.some((track) => track.id === playingTrack.value)) {
    stopMusicPreview();
  }
}

function removeMusicTrack(track: MusicPreset) {
  if (trackRemoved(track)) return;
  removedMusicTracks.value = {
    ...removedMusicTracks.value,
    [track.id]: trackGroupId(track),
  };
  if (playingTrack.value === track.id) stopMusicPreview();
  if (props.music === track.url) emit('update:music', '');
}

function restoreMusicTrack(track: MusicPreset) {
  const remainingRemoved = { ...removedMusicTracks.value };
  delete remainingRemoved[track.id];
  removedMusicTracks.value = remainingRemoved;
}

function startTrackDrag(track: MusicPreset) {
  draggingTrack.value = track.id;
}

function finishTrackDrag() {
  draggingTrack.value = null;
}

function dropTrackToGroup(groupId: string) {
  const identifier = draggingTrack.value;
  draggingTrack.value = null;
  if (identifier === null) return;
  musicAssignments.value = { ...musicAssignments.value, [identifier]: groupId };
}

function dropDraggingTrackToRemoved() {
  const identifier = draggingTrack.value;
  draggingTrack.value = null;
  const item = musicTracks.value.find((track) => track.id === identifier);
  if (item) removeMusicTrack(item);
}

function exportMusicReview() {
  const data: MusicReviewState = {
    labels: musicLabels.value,
    customGroups: customMusicGroups.value,
    deletedGroups: deletedMusicGroups.value,
    assignments: musicAssignments.value,
    removed: removedMusicTracks.value,
  };
  saveAs(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }),
    'music-catalog-review.json',
  );
}

function resetMusicReview() {
  musicLabels.value = {};
  customMusicGroups.value = [];
  deletedMusicGroups.value = {};
  musicAssignments.value = {};
  removedMusicTracks.value = {};
  materializeMusicLabels();
}

function restoreMusicReview() {
  try {
    const saved = localStorage.getItem(MUSIC_REVIEW_STORAGE_KEY);
    if (!saved) return;
    const state = JSON.parse(saved) as Partial<MusicReviewState>;
    const knownTracks = new Set(musicTracks.value.map((track) => track.id));
    if (Array.isArray(state.customGroups)) {
      state.customGroups.forEach((id) => {
        if (typeof id === 'string' && /^_custom_\d+$/.test(id) && !customMusicGroups.value.includes(id)) {
          customMusicGroups.value.push(id);
        }
      });
    }
    if (state.labels && typeof state.labels === 'object') {
      Object.entries(state.labels).forEach(([id, label]) => {
        if (typeof label === 'string') {
          musicLabels.value[id] = label;
        }
      });
    }
    materializeMusicLabels();
    const derivedIds = new Set(musicTracks.value.map((track) => musicGroupId(track.name)));
    customMusicGroups.value.forEach((id) => derivedIds.delete(id));
    if (state.deletedGroups && typeof state.deletedGroups === 'object') {
      Object.keys(state.deletedGroups).forEach((id) => {
        if (derivedIds.has(id)) deletedMusicGroups.value[id] = '';
      });
    }
    const knownTargets = new Set([
      UNGROUPED_MUSIC_GROUP,
      ...customMusicGroups.value,
      ...Array.from(derivedIds),
    ]);
    if (state.assignments && typeof state.assignments === 'object') {
      Object.entries(state.assignments).forEach(([identifier, target]) => {
        if (knownTracks.has(identifier) && typeof target === 'string' && knownTargets.has(target)) {
          musicAssignments.value[identifier] = target;
        }
      });
    }
    if (state.removed && typeof state.removed === 'object') {
      Object.keys(state.removed).forEach((identifier) => {
        if (knownTracks.has(identifier)) removedMusicTracks.value[identifier] = '';
      });
    }
  } catch {
    localStorage.removeItem(MUSIC_REVIEW_STORAGE_KEY);
  }
}

watch([musicLabels, customMusicGroups, deletedMusicGroups, musicAssignments, removedMusicTracks], () => {
  const state: MusicReviewState = {
    labels: musicLabels.value,
    customGroups: customMusicGroups.value,
    deletedGroups: deletedMusicGroups.value,
    assignments: musicAssignments.value,
    removed: removedMusicTracks.value,
  };
  localStorage.setItem(MUSIC_REVIEW_STORAGE_KEY, JSON.stringify(state));
}, { deep: true });

materializeMusicLabels();

const backgroundRatios = ref<Record<string, string>>({});
const expandedBackgroundGroups = ref<string[]>(['city']);
const expandedMusicGroups = ref<string[]>([]);
const playingTrack = ref('');
let unsubscribeAudioPreview = () => {};

function rememberBackgroundRatio(item: BackgroundPreset, event: Event) {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.naturalWidth || !image.naturalHeight) return;
  const ratio = `${image.naturalWidth} / ${image.naturalHeight}`;
  if (backgroundRatios.value[item.url] !== ratio) backgroundRatios.value[item.url] = ratio;
}

function backgroundGroupExpanded(group: BackgroundGroup) {
  return expandedBackgroundGroups.value.includes(group.id)
    || group.backgrounds.some((item) => item.url === props.background);
}

function toggleBackgroundGroup(group: BackgroundGroup) {
  if (backgroundGroupExpanded(group)) {
    expandedBackgroundGroups.value = expandedBackgroundGroups.value.filter((id) => id !== group.id);
    return;
  }
  expandedBackgroundGroups.value = [...expandedBackgroundGroups.value, group.id];
}

function startBackgroundDrag(item: BackgroundPreset) {
  draggingBackground.value = item.name;
}

function finishBackgroundDrag() {
  draggingBackground.value = null;
}

function moveBackgroundToGroup(category: string) {
  const identifier = draggingBackground.value;
  if (identifier === null || !knownBackgroundCategory(category)) return;
  categoryByBackground.value = { ...categoryByBackground.value, [identifier]: category };
  const remainingRemoved = { ...removedBackgrounds.value };
  delete remainingRemoved[identifier];
  removedBackgrounds.value = remainingRemoved;
  draggingBackground.value = null;
}

function removeBackground(item: BackgroundPreset) {
  if (backgroundRemoved(item)) return;
  removedBackgrounds.value = {
    ...removedBackgrounds.value,
    [item.name]: backgroundCategory(item),
  };
  if (props.background === item.url) emit('update:background', '');
}

function moveDraggingToRemoved() {
  const identifier = draggingBackground.value;
  const item = backgrounds.value.find((background) => background.name === identifier);
  if (item) removeBackground(item);
  draggingBackground.value = null;
}

function restoreBackground(item: BackgroundPreset) {
  const category = removedBackgrounds.value[item.name] ?? backgroundCategory(item);
  categoryByBackground.value = { ...categoryByBackground.value, [item.name]: category };
  const remainingRemoved = { ...removedBackgrounds.value };
  delete remainingRemoved[item.name];
  removedBackgrounds.value = remainingRemoved;
}

function exportBackgroundReview() {
  const data = {
    categories: categoryByBackground.value,
    labels: categoryLabels.value,
    removed: Object.keys(removedBackgrounds.value),
  };
  saveAs(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }),
    'background-category-review.json',
  );
}

function resetBackgroundReview() {
  categoryByBackground.value = { ...DEFAULT_BACKGROUND_CATEGORIES };
  categoryLabels.value = { ...BACKGROUND_CATEGORY_LABELS };
  removedBackgrounds.value = defaultBackgroundRemovals();
}

function restoreBackgroundReview() {
  try {
    const saved = localStorage.getItem(BACKGROUND_REVIEW_STORAGE_KEY);
    if (!saved) return;
    const state = JSON.parse(saved) as Partial<BackgroundReviewState>;
    const knownBackgrounds = new Set(backgrounds.value.map((item) => item.name));
    if (state.categories && typeof state.categories === 'object') {
      Object.entries(state.categories).forEach(([identifier, category]) => {
        if (knownBackgrounds.has(identifier) && knownBackgroundCategory(category)) {
          categoryByBackground.value[identifier] = category;
        }
      });
    }
    if (state.labels && typeof state.labels === 'object') {
      Object.entries(state.labels).forEach(([category, label]) => {
        if (knownBackgroundCategory(category) && typeof label === 'string') {
          categoryLabels.value[category] = label;
        }
      });
    }
    if (state.removed && typeof state.removed === 'object') {
      Object.entries(state.removed).forEach(([identifier, category]) => {
        if (knownBackgrounds.has(identifier) && knownBackgroundCategory(category)) {
          removedBackgrounds.value[identifier] = category;
        }
      });
    }
  } catch {
    localStorage.removeItem(BACKGROUND_REVIEW_STORAGE_KEY);
  }
}

watch([categoryByBackground, categoryLabels, removedBackgrounds], () => {
  const state: BackgroundReviewState = {
    categories: categoryByBackground.value,
    labels: categoryLabels.value,
    removed: removedBackgrounds.value,
  };
  localStorage.setItem(BACKGROUND_REVIEW_STORAGE_KEY, JSON.stringify(state));
}, { deep: true });

function stopMusicPreview() {
  stopAudioPreview();
}

function musicGroupExpanded(group: MusicGroup) {
  return expandedMusicGroups.value.includes(group.id);
}

function toggleMusicGroup(group: MusicGroup) {
  if (musicGroupExpanded(group)) {
    expandedMusicGroups.value = expandedMusicGroups.value.filter((id) => id !== group.id);
    if (group.tracks.some((track) => track.id === playingTrack.value)) stopMusicPreview();
    return;
  }
  expandedMusicGroups.value = [...expandedMusicGroups.value, group.id];
}

function toggleMusicPreview(track: MusicPreset) {
  if (playingTrack.value === track.id) {
    stopMusicPreview();
    return;
  }
  playAudioPreview(track.url, false, track.id);
}

function selectMusic(track: MusicPreset) {
  stopMusicPreview();
  emit('update:music', track.url);
}

onMounted(() => {
  restoreBackgroundReview();
  restoreMusicReview();
  unsubscribeAudioPreview = subscribeAudioPreview((value) => {
    playingTrack.value = value.playing && !value.loop ? value.key : '';
  });
});
onUnmounted(() => {
  unsubscribeAudioPreview();
  stopMusicPreview();
});
</script>

<template>
  <main class="scene-page">
    <div class="scene-selection-grid" :class="{ reviewing: reviewingBackgrounds || reviewingMusic }">
      <section class="asset-pane background-pane" aria-label="背景图片">
        <div class="asset-pane-heading">
          <div>
            <div class="section-heading">{{ reviewingBackgrounds ? '背景分类审核' : '背景图片' }}</div>
            <div class="section-description">{{ reviewingBackgrounds ? ' ' : '点击图片选择背景' }}</div>
          </div>
          <n-space align="center" :size="4">
            <template v-if="reviewingBackgrounds">
              <n-tooltip>
                <template #trigger>
                  <n-button circle quaternary aria-label="导出审核结果" title="导出审核结果"
                    @click="exportBackgroundReview"
                  >
                    <n-icon size="19"><download-outlined /></n-icon>
                  </n-button>
                </template>
                导出审核结果
              </n-tooltip>
              <n-popconfirm positive-text="重置" negative-text="取消"
                @positive-click="resetBackgroundReview"
              >
                <template #trigger>
                  <n-button circle quaternary aria-label="重置审核结果" title="重置审核结果">
                    <n-icon size="19"><restart-alt-outlined /></n-icon>
                  </n-button>
                </template>
                重置全部审核修改？
              </n-popconfirm>
            </template>
            <span class="asset-count">{{ backgrounds.length }}</span>
            <n-button :type="reviewingBackgrounds ? 'primary' : 'default'"
              @click="reviewingBackgrounds = !reviewingBackgrounds"
            >
              {{ reviewingBackgrounds ? '完成审核' : '审核分类' }}
            </n-button>
          </n-space>
        </div>
        <div v-if="reviewingBackgrounds" class="background-review-board">
          <section v-for="group in reviewBackgroundGroups" :key="group.id" class="review-category"
            :class="{ 'is-drop-target': draggingBackground !== null }"
            @dragover.prevent
            @drop="moveBackgroundToGroup(group.id)"
          >
            <div class="review-category-heading">
              <input v-model="categoryLabels[group.id]" :aria-label="`分类名称：${group.label}`" />
              <span>{{ group.backgrounds.length }}</span>
            </div>
            <div class="review-background-grid">
              <article v-for="item in group.backgrounds" :key="item.url" class="review-background"
                draggable="true"
                @dragstart="startBackgroundDrag(item)"
                @dragend="finishBackgroundDrag"
                @click="emit('update:background', item.url)"
              >
                <img :src="item.url" :alt="item.name" loading="lazy"
                  @load="rememberBackgroundRatio(item, $event)"
                />
                <span>{{ item.name }}</span>
                <n-tooltip>
                  <template #trigger>
                    <n-button circle quaternary class="review-item-action"
                      :aria-label="`移除 ${item.name}`"
                      :title="`移除 ${item.name}`" @click.stop="removeBackground(item)"
                    >
                      <n-icon size="17"><delete-outlined /></n-icon>
                    </n-button>
                  </template>
                  移除
                </n-tooltip>
              </article>
            </div>
          </section>

          <section class="review-category review-removed"
            :class="{ 'is-drop-target': draggingBackground !== null }"
            @dragover.prevent
            @drop="moveDraggingToRemoved"
          >
            <div class="review-category-heading">
              <span>已移除</span>
              <span>{{ removedBackgroundItems.length }}</span>
            </div>
            <div class="review-background-grid">
              <article v-for="item in removedBackgroundItems" :key="item.url"
                class="review-background"
                draggable="true"
                @dragstart="startBackgroundDrag(item)"
                @dragend="finishBackgroundDrag"
              >
                <img :src="item.url" :alt="item.name" loading="lazy" />
                <span>{{ item.name }}</span>
                <n-tooltip>
                  <template #trigger>
                    <n-button circle quaternary class="review-item-action"
                      :aria-label="`恢复 ${item.name}`"
                      :title="`恢复 ${item.name}`" @click.stop="restoreBackground(item)"
                    >
                      <n-icon size="17"><restore-from-trash-outlined /></n-icon>
                    </n-button>
                  </template>
                  恢复
                </n-tooltip>
              </article>
            </div>
          </section>
        </div>
        <div v-else class="background-library">
          <section v-for="group in backgroundGroups" :key="group.id" class="background-group">
            <button type="button" class="background-group-toggle"
              :aria-expanded="backgroundGroupExpanded(group)"
              @click="toggleBackgroundGroup(group)"
            >
              <n-icon size="18">
                <arrow-drop-down-filled v-if="backgroundGroupExpanded(group)" />
                <arrow-right-filled v-else />
              </n-icon>
              <span class="background-group-name">{{ group.label }}</span>
              <span class="background-group-count">{{ group.backgrounds.length }}</span>
            </button>
            <div v-if="backgroundGroupExpanded(group)" class="background-grid">
              <button v-for="item in group.backgrounds" :key="item.url" type="button"
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

      <section v-if="!reviewingBackgrounds || reviewingMusic" class="asset-pane music-pane"
        :aria-label="reviewingMusic ? '音乐目录审核' : '背景音乐'"
      >
        <div class="asset-pane-heading">
          <div>
            <div class="section-heading">{{ reviewingMusic ? '音乐目录审核' : '背景音乐' }}</div>
            <div class="section-description">
              {{ reviewingMusic
                ? '新建、删除或重命名条目；拖动音频在条目之间移动'
                : '选择曲目，或试听任意音频' }}
            </div>
          </div>
          <n-space align="center" :size="4">
            <template v-if="reviewingMusic">
              <n-tooltip>
                <template #trigger>
                  <n-button circle quaternary aria-label="新建条目" title="新建条目"
                    @click="createMusicGroup"
                  >
                    <n-icon size="19"><playlist-add-outlined /></n-icon>
                  </n-button>
                </template>
                新建条目
              </n-tooltip>
              <n-tooltip>
                <template #trigger>
                  <n-button circle quaternary aria-label="导出审核结果" title="导出审核结果"
                    @click="exportMusicReview"
                  >
                    <n-icon size="19"><download-outlined /></n-icon>
                  </n-button>
                </template>
                导出审核结果
              </n-tooltip>
              <n-popconfirm positive-text="重置" negative-text="取消"
                @positive-click="resetMusicReview"
              >
                <template #trigger>
                  <n-button circle quaternary aria-label="重置审核结果" title="重置审核结果">
                    <n-icon size="19"><restart-alt-outlined /></n-icon>
                  </n-button>
                </template>
                重置全部条目修改？移动、移除的音频都会回到默认分组。
              </n-popconfirm>
            </template>
            <span class="asset-count">{{ reviewingMusic ? musicTracks.length : activeMusicTracks.length }}</span>
            <n-button :type="reviewingMusic ? 'primary' : 'default'"
              @click="reviewingMusic = !reviewingMusic"
            >
              {{ reviewingMusic ? '完成审核' : '审核条目' }}
            </n-button>
          </n-space>
        </div>
        <div v-if="reviewingMusic" class="music-review-board">
          <section v-for="group in reviewMusicGroups" :key="group.id" class="review-category"
            :class="{ 'is-drop-target': draggingTrack !== null }"
            @dragover.prevent
            @drop="dropTrackToGroup(group.id)"
          >
            <div class="review-category-heading music-review-heading">
              <input v-model="musicLabels[group.id]" :aria-label="`条目名称：${group.label}`" />
              <span>{{ group.tracks.length }}</span>
              <n-popconfirm v-if="group.id !== UNGROUPED_MUSIC_GROUP" positive-text="删除"
                negative-text="取消" @positive-click="deleteMusicGroup(group)"
              >
                <template #trigger>
                  <n-button circle quaternary size="tiny" class="review-group-action"
                    :aria-label="`删除条目 ${group.label}`" :title="`删除条目 ${group.label}`"
                  >
                    <n-icon size="15"><delete-outlined /></n-icon>
                  </n-button>
                </template>
                删除条目「{{ group.label }}」？其中的音频会移入“未分组”。
              </n-popconfirm>
            </div>
            <div class="review-track-list">
              <div v-for="track in group.tracks" :key="track.id" class="review-track-row"
                draggable="true"
                @dragstart="startTrackDrag(track)"
                @dragend="finishTrackDrag"
              >
                <n-button circle quaternary size="tiny"
                  :type="playingTrack === track.id ? 'primary' : 'default'"
                  :title="playingTrack === track.id ? '暂停试听' : '试听'"
                  :aria-label="playingTrack === track.id ? '暂停试听' : `试听 ${track.name}`"
                  @click.stop="toggleMusicPreview(track)"
                >
                  <n-icon size="15">
                    <pause-filled v-if="playingTrack === track.id" />
                    <play-arrow-filled v-else />
                  </n-icon>
                </n-button>
                <span class="review-track-name" :title="track.name">{{ track.name }}</span>
                <n-button circle quaternary size="tiny" class="review-track-remove"
                  :aria-label="`移除 ${track.name}`" :title="`移除 ${track.name}`"
                  @click.stop="removeMusicTrack(track)"
                >
                  <n-icon size="14"><delete-outlined /></n-icon>
                </n-button>
              </div>
              <div v-if="group.tracks.length === 0" class="review-track-empty">拖动音频到这里</div>
            </div>
          </section>

          <section class="review-category review-removed"
            :class="{ 'is-drop-target': draggingTrack !== null }"
            @dragover.prevent
            @drop="dropDraggingTrackToRemoved"
          >
            <div class="review-category-heading music-review-heading">
              <span>已移除</span>
              <span>{{ removedMusicItems.length }}</span>
            </div>
            <div class="review-track-list">
              <div v-for="track in removedMusicItems" :key="track.id" class="review-track-row"
                draggable="true"
                @dragstart="startTrackDrag(track)"
                @dragend="finishTrackDrag"
              >
                <n-button circle quaternary size="tiny"
                  :type="playingTrack === track.id ? 'primary' : 'default'"
                  :title="playingTrack === track.id ? '暂停试听' : '试听'"
                  :aria-label="playingTrack === track.id ? '暂停试听' : `试听 ${track.name}`"
                  @click.stop="toggleMusicPreview(track)"
                >
                  <n-icon size="15">
                    <pause-filled v-if="playingTrack === track.id" />
                    <play-arrow-filled v-else />
                  </n-icon>
                </n-button>
                <span class="review-track-name" :title="track.name">{{ track.name }}</span>
                <n-button circle quaternary size="tiny" class="review-track-remove"
                  :aria-label="`恢复 ${track.name}`" :title="`恢复 ${track.name}`"
                  @click.stop="restoreMusicTrack(track)"
                >
                  <n-icon size="14"><restore-from-trash-outlined /></n-icon>
                </n-button>
              </div>
              <div v-if="removedMusicItems.length === 0" class="review-track-empty">没有已移除的音频</div>
            </div>
          </section>
        </div>
        <div v-else class="music-list">
          <section v-for="group in musicGroups" :key="group.id" class="music-group">
            <button type="button" class="music-group-toggle"
              :aria-expanded="musicGroupExpanded(group)"
              @click="toggleMusicGroup(group)"
            >
              <n-icon size="18">
                <arrow-drop-down-filled v-if="musicGroupExpanded(group)" />
                <arrow-right-filled v-else />
              </n-icon>
              <span class="music-group-name">{{ group.label }}</span>
              <span class="music-group-count">{{ group.tracks.length }}</span>
            </button>
            <div v-if="musicGroupExpanded(group)" class="music-group-tracks">
              <div v-for="track in group.tracks" :key="track.id" class="music-row"
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
                      :type="playingTrack === track.id ? 'primary' : 'default'"
                      :title="playingTrack === track.id ? '暂停试听' : '试听'"
                      :aria-label="playingTrack === track.id ? '暂停试听' : `试听 ${track.name}`"
                      @click="toggleMusicPreview(track)"
                    >
                      <n-icon size="19">
                        <pause-filled v-if="playingTrack === track.id" />
                        <play-arrow-filled v-else />
                      </n-icon>
                    </n-button>
                  </template>
                  {{ playingTrack === track.id ? '暂停试听' : '试听' }}
                </n-tooltip>
              </div>
            </div>
          </section>
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

.scene-selection-grid.reviewing {
  grid-template-columns: minmax(0, 1fr);
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
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.background-review-board {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  align-items: start;
  gap: 12px;
  padding: 16px;
}

.review-category {
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  background: #111115;
}

.review-category.is-drop-target {
  border-color: rgba(99, 226, 183, 0.56);
}

.review-category-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 0 10px 0 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.46);
  font-size: 12px;
}

.review-category-heading input {
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.9);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
}

.review-category-heading input:focus {
  color: #63e2b7;
}

.review-background-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  gap: 8px;
  max-height: 380px;
  overflow-y: auto;
  padding: 8px;
}

.review-background {
  position: relative;
  min-width: 0;
  min-height: 78px;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 4px;
  background: #08080a;
  color: #ffffff;
  cursor: grab;
}

.review-background:hover {
  border-color: rgba(255, 255, 255, 0.65);
}

.review-background:active {
  cursor: grabbing;
}

.review-background img {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 78px;
  object-fit: cover;
}

.review-background > span {
  position: absolute;
  right: 5px;
  bottom: 4px;
  left: 5px;
  overflow: hidden;
  font-size: 11px;
  line-height: 15px;
  text-overflow: ellipsis;
  text-shadow: 0 1px 2px #000000;
  white-space: nowrap;
}

.review-item-action {
  position: absolute;
  top: 3px;
  right: 3px;
  z-index: 1;
  background: rgba(0, 0, 0, 0.6);
}

.review-removed {
  border-style: dashed;
}

.music-review-board {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(236px, 1fr));
  align-items: start;
  gap: 12px;
  padding: 16px;
}

.music-review-heading {
  grid-template-columns: minmax(0, 1fr) auto auto;
}

.review-track-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 380px;
  overflow-y: auto;
  padding: 8px;
}

.review-track-row {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) 28px;
  align-items: center;
  gap: 4px;
  min-width: 0;
  border-radius: 3px;
  cursor: grab;
}

.review-track-row:hover {
  background: rgba(255, 255, 255, 0.06);
}

.review-track-row:active {
  cursor: grabbing;
}

.review-track-name {
  overflow: hidden;
  font-size: 12px;
  line-height: 17px;
  color: rgba(255, 255, 255, 0.86);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review-track-empty {
  padding: 14px 8px;
  color: rgba(255, 255, 255, 0.36);
  font-size: 12px;
  text-align: center;
}

.background-group + .background-group {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.background-group-toggle {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
  min-height: 44px;
  padding: 8px 16px;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.88);
  cursor: pointer;
  text-align: left;
}

.background-group-toggle:hover,
.background-group-toggle:focus-visible {
  background: rgba(255, 255, 255, 0.06);
  outline: none;
}

.background-group-name {
  overflow: hidden;
  font-size: 13px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.background-group-count {
  padding-left: 12px;
  color: rgba(255, 255, 255, 0.46);
  font-size: 12px;
}

.background-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  align-content: start;
  gap: 10px;
  max-height: min(56vh, 580px);
  min-width: 0;
  overflow-y: auto;
  padding: 0 16px 16px;
}

.background-choice {
  display: block;
  box-sizing: border-box;
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
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: min(56vh, 580px);
  max-height: min(56vh, 580px);
  overflow-y: auto;
  padding: 10px;
}

.music-group {
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.music-group-toggle {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
  min-height: 42px;
  padding: 8px 10px;
  border: 0;
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.88);
  cursor: pointer;
  text-align: left;
}

.music-group-toggle:hover,
.music-group-toggle:focus-visible {
  background: rgba(255, 255, 255, 0.08);
  outline: none;
}

.music-group-name {
  overflow: hidden;
  font-size: 13px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.music-group-count {
  padding-left: 12px;
  color: rgba(255, 255, 255, 0.46);
  font-size: 12px;
}

.music-group-tracks {
  padding: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.09);
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

  .background-review-board {
    grid-template-columns: repeat(auto-fit, minmax(176px, 1fr));
    padding: 12px;
  }

  .music-review-board {
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    padding: 12px;
  }

  .background-grid,
  .music-list {
    height: 480px;
    max-height: none;
  }

  .scene-actions {
    justify-content: space-between;
    padding-bottom: 0;
  }
}
</style>
