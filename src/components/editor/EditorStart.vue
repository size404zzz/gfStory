<script setup lang="ts">
import {
  NButton, NIcon, NUpload, useNotification, type UploadCustomRequestOptions,
} from 'naive-ui';
import { AddFilled, UploadFileFilled } from '@vicons/material';

import type { GfStory } from '../../types/lines';

const emit = defineEmits<{
  create: [],
  import: [value: GfStory],
}>();

const notification = useNotification();

function isStory(value: unknown): value is GfStory {
  if (!value || typeof value !== 'object') return false;
  const story = value as GfStory;
  return Array.isArray(story.characters) && Array.isArray(story.lines);
}

async function importJson(options: UploadCustomRequestOptions) {
  const { file } = options.file;
  if (!file) return;
  try {
    const value = JSON.parse(await file.text()) as unknown;
    if (!isStory(value)) throw new Error('invalid story');
    emit('import', value);
    options.onFinish();
  } catch (_) {
    notification.error({ content: '无法读取这个 JSON 剧情文件。' });
    options.onError();
  }
}
</script>

<template>
  <main class="start-page">
    <div class="start-actions">
      <n-upload accept="application/json,.json" :show-file-list="false" :custom-request="importJson">
        <n-button size="large">
          <n-icon><upload-file-filled /></n-icon>
          导入本地 JSON
        </n-button>
      </n-upload>
      <n-button type="primary" size="large" @click="emit('create')">
        <n-icon><add-filled /></n-icon>
        新建全新剧情
      </n-button>
    </div>
  </main>
</template>

<style scoped>
.start-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  background: #1b1b1f;
}

.start-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}
</style>
