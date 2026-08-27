<script setup lang="ts">
import {
  NButton, NColorPicker, NEmpty, NIcon, NSelect,
} from 'naive-ui';
import { AddFilled, DeleteFilled } from '@vicons/material';
import { computed, ref, watch } from 'vue';

import EditorStoryPreview from './EditorStoryPreview.vue';
import PresetSpritePicker from './PresetSpritePicker.vue';
import ClassicEditor from '../lines/editor';
import {
  defaultLine, type GfStory, type Line, type TextLine,
} from '../../types/lines';
import type { Character } from '../../types/character';

type PresetUpdate = {
  sprites: string[],
  characters: Character[],
};

const props = defineProps<{
  modelValue: GfStory,
  background: string,
  music: string,
}>();

const emit = defineEmits<{
  'update:modelValue': [value: GfStory],
  'scene-settings': [],
}>();

const dialogueLines = computed(() => props.modelValue.lines.filter((line): line is TextLine => (
  line.type === 'text'
)));
const stageSprites = computed(() => dialogueLines.value[0]?.sprites ?? []);
const speakerOptions = computed(() => {
  const characters = new Set(stageSprites.value.map((path) => path.split('/')[0]));
  return [...characters].map((name) => ({ label: name, value: name }));
});
const activeDialogueId = ref('');
const previewLine = computed(() => dialogueLines.value
  .find((line) => line.id === activeDialogueId.value) ?? dialogueLines.value[0]);

watch(dialogueLines, (lines) => {
  if (!lines.some((line) => line.id === activeDialogueId.value)) {
    activeDialogueId.value = lines[0]?.id ?? '';
  }
}, { immediate: true });

function updateLines(lines: Line[], characters = props.modelValue.characters) {
  emit('update:modelValue', { characters, lines });
}

function updateStage(value: PresetUpdate) {
  const lines = props.modelValue.lines.map((line) => {
    if (line.type !== 'text') return line;
    const remote = Object.fromEntries(Object.entries(line.remote)
      .filter(([path]) => value.sprites.includes(path)));
    return { ...line, sprites: value.sprites, remote };
  });
  updateLines(lines, value.characters);
}

function updateDialogue(id: string, patch: Partial<TextLine>) {
  updateLines(props.modelValue.lines.map((line) => (
    line.type === 'text' && line.id === id ? { ...line, ...patch } : line
  )));
}

function addDialogue() {
  const line = defaultLine();
  line.sprites = [...stageSprites.value];
  activeDialogueId.value = line.id;
  updateLines([...props.modelValue.lines, line]);
}

function removeDialogue(id: string) {
  if (dialogueLines.value.length === 1) {
    updateDialogue(id, {
      narrator: '',
      narratorColor: '#ffffff',
      remote: {},
      text: '',
    });
    return;
  }
  updateLines(props.modelValue.lines.filter((line) => line.id !== id));
}
</script>

<template>
  <main class="composer-page">
    <aside class="stage-panel">
      <div class="stage-heading">
        <span>立绘</span>
        <n-button text type="primary" @click="emit('scene-settings')">背景与音乐</n-button>
      </div>
      <preset-sprite-picker :modelValue="stageSprites" :characters="modelValue.characters"
        @update="updateStage"
      />
    </aside>

    <section class="dialogue-panel">
      <div class="section-heading">对白</div>
      <div v-if="dialogueLines.length === 0" class="dialogue-empty">
        <n-empty description="还没有对白">
          <template #extra>
            <n-button type="primary" @click="addDialogue">添加第一句</n-button>
          </template>
        </n-empty>
      </div>
      <div v-else class="dialogue-list">
        <article v-for="line in dialogueLines" :key="line.id" class="dialogue-row"
          :class="{ active: line.id === previewLine?.id }" @click="activeDialogueId = line.id"
        >
          <div class="dialogue-meta">
            <n-select :value="line.narrator" :options="speakerOptions" clearable filterable
              placeholder="旁白"
              @update:value="(value) => updateDialogue(line.id, { narrator: value ?? '' })"
            />
            <n-color-picker :value="line.narratorColor" :modes="['hex']" :show-alpha="false"
              title="名称颜色"
              @update:value="(value) => updateDialogue(line.id, { narratorColor: value })"
            />
            <n-button quaternary type="error" title="删除对白" @click.stop="removeDialogue(line.id)">
              <n-icon><delete-filled /></n-icon>
            </n-button>
          </div>
          <div class="n-ck-editor dialogue-editor" @focusin="activeDialogueId = line.id">
            <ckeditor :editor="ClassicEditor" :modelValue="line.text"
              @update:modelValue="(value) => updateDialogue(line.id, { text: value })"
            />
          </div>
        </article>
      </div>
      <n-button class="add-dialogue" type="primary" secondary @click="addDialogue">
        <n-icon><add-filled /></n-icon>
        添加对白
      </n-button>
    </section>

    <section class="preview-panel">
      <div class="section-heading">预览当前对白</div>
      <editor-story-preview :background="background" :music="music"
        :characters="modelValue.characters" :sprites="stageSprites" :line="previewLine"
      />
    </section>
  </main>
</template>

<style>
@import '../lines/editor.css';
</style>

<style scoped>
.composer-page {
  display: grid;
  grid-template-columns: minmax(220px, 270px) minmax(0, 1fr) minmax(320px, 0.9fr);
  min-height: calc(100vh - 56px);
}

.composer-page > * {
  box-sizing: border-box;
}

.stage-panel {
  min-width: 0;
  padding: 24px;
  border-right: 1px solid rgba(255, 255, 255, 0.11);
  background: #1a1a1e;
}

.stage-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 15px;
}

.dialogue-panel {
  min-width: 0;
  padding: 28px clamp(20px, 3vw, 48px) 40px;
}

.preview-panel {
  min-width: 0;
  padding: 24px;
  border-left: 1px solid rgba(255, 255, 255, 0.11);
  background: #17171b;
}

.section-heading {
  margin-bottom: 16px;
  color: rgba(255, 255, 255, 0.88);
  font-size: 15px;
}

.dialogue-list {
  display: grid;
  width: min(900px, 100%);
  gap: 12px;
}

.dialogue-row {
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
  padding: 0 0 16px 14px;
  border-left: 2px solid transparent;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.dialogue-row.active {
  border-left-color: #63e2b7;
}

.dialogue-meta {
  display: grid;
  grid-template-columns: minmax(118px, 170px) 42px 34px;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  min-width: 0;
}

.dialogue-meta :deep(.n-color-picker) {
  width: 42px;
}

.dialogue-editor {
  min-width: 0;
  width: 100%;
}

.dialogue-editor :deep(.ck-editor) {
  max-width: 100%;
  min-width: 0;
  width: 100%;
}

.dialogue-editor :deep(.ck-content) {
  min-height: 88px;
}

.dialogue-empty {
  display: grid;
  min-height: 240px;
  width: min(900px, 100%);
  place-items: center;
}

.add-dialogue {
  margin-top: 20px;
}

@media (max-width: 1180px) {
  .composer-page { grid-template-columns: minmax(220px, 270px) minmax(0, 1fr); }
  .stage-panel { border-right: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.11); }
  .preview-panel {
    grid-column: 2;
    border-top: 1px solid rgba(255, 255, 255, 0.11);
    border-left: 0;
  }
}

@media (max-width: 800px) {
  .composer-page { grid-template-columns: 1fr; }
  .stage-panel { border-right: 0; }
  .dialogue-panel, .preview-panel { grid-column: auto; padding: 20px 16px 36px; }
}
</style>
