<script setup lang="ts">
import {
  NButton, NForm, NFormItem, NSelect, NSpace, type SelectOption,
} from 'naive-ui';
import { computed } from 'vue';

import EditorStoryPreview from './EditorStoryPreview.vue';
import audioPresets from '../../assets/audio.json';
import backgroundPresets from '../../assets/backgrounds.json';
import {
  AUDIO_PATH_PREFIX, IMAGE_PATH_PREFIX, type AudioInfo, type BackgroundInfo,
} from '../../types/assets';

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

const backgroundOptions = computed<SelectOption[]>(() => Object.entries(
  backgroundPresets as BackgroundInfo,
).map(([name, path]) => ({
  label: name,
  value: `${IMAGE_PATH_PREFIX}${path}`,
})).sort((left, right) => String(left.label).localeCompare(String(right.label))));

const musicOptions = computed<SelectOption[]>(() => Object.entries(
  audioPresets as AudioInfo,
).map(([name, path]) => ({
  label: name,
  value: `${AUDIO_PATH_PREFIX}${path}`,
})).sort((left, right) => String(left.label).localeCompare(String(right.label))));
</script>

<template>
  <main class="scene-page">
    <section class="scene-form">
      <div class="section-heading">场景设置</div>
      <n-form label-placement="top">
        <n-form-item label="背景">
          <n-select :value="background" :options="backgroundOptions" filterable clearable
            placeholder="选择背景" @update:value="(value) => emit('update:background', value ?? '')"
          />
        </n-form-item>
        <n-form-item label="背景音乐">
          <n-select :value="music" :options="musicOptions" filterable clearable
            placeholder="选择背景音乐" @update:value="(value) => emit('update:music', value ?? '')"
          />
        </n-form-item>
      </n-form>
      <n-space justify="space-between">
        <n-button @click="emit('back')">返回</n-button>
        <n-button type="primary" @click="emit('continue')">开始写对白</n-button>
      </n-space>
    </section>
    <section class="scene-preview">
      <div class="section-heading">场景预览</div>
      <editor-story-preview :background="background" :music="music" :characters="[]"
        :sprites="[]"
      />
    </section>
  </main>
</template>

<style scoped>
.scene-page {
  display: grid;
  min-height: calc(100vh - 56px);
  grid-template-columns: minmax(280px, 0.8fr) minmax(420px, 1.2fr);
  align-content: start;
  gap: clamp(32px, 6vw, 96px);
  width: min(1200px, 100%);
  margin: 0 auto;
  padding: 40px 24px;
}

.scene-form {
  min-width: 0;
}

.scene-preview {
  min-width: 0;
}

.section-heading {
  margin-bottom: 18px;
  color: rgba(255, 255, 255, 0.88);
  font-size: 15px;
}

@media (max-width: 800px) {
  .scene-page {
    grid-template-columns: 1fr;
    align-content: start;
    gap: 28px;
    padding: 24px 16px 36px;
  }
}
</style>
