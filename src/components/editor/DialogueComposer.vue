<script setup lang="ts">
import {
  NButton, NEmpty, NIcon, NInput, NSelect,
} from 'naive-ui';
import { AddFilled, DeleteFilled } from '@vicons/material';
import { computed } from 'vue';

import PresetSpritePicker from './PresetSpritePicker.vue';
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
      <div v-if="dialogueLines.length === 0" class="dialogue-empty">
        <n-empty description="还没有对白">
          <template #extra>
            <n-button type="primary" @click="addDialogue">添加第一句</n-button>
          </template>
        </n-empty>
      </div>
      <div v-else class="dialogue-list">
        <article v-for="line in dialogueLines" :key="line.id" class="dialogue-row">
          <n-select :value="line.narrator" :options="speakerOptions" clearable filterable
            placeholder="旁白" @update:value="(value) => updateDialogue(line.id, { narrator: value ?? '' })"
          />
          <n-input :value="line.text" type="textarea" autosize placeholder="输入对白"
            @update:value="(value) => updateDialogue(line.id, { text: value })"
          />
          <n-button quaternary type="error" title="删除对白" @click="removeDialogue(line.id)">
            <n-icon><delete-filled /></n-icon>
          </n-button>
        </article>
      </div>
      <n-button class="add-dialogue" type="primary" secondary @click="addDialogue">
        <n-icon><add-filled /></n-icon>
        添加对白
      </n-button>
    </section>
  </main>
</template>

<style scoped>
.composer-page {
  display: grid;
  grid-template-columns: minmax(260px, 30%) minmax(0, 1fr);
  min-height: calc(100vh - 56px);
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
  padding: 32px clamp(20px, 5vw, 72px);
}

.dialogue-list {
  display: grid;
  width: min(900px, 100%);
  gap: 12px;
}

.dialogue-row {
  display: grid;
  grid-template-columns: minmax(118px, 170px) minmax(0, 1fr) 34px;
  align-items: start;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.dialogue-row :deep(.n-button) {
  margin-top: 3px;
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

@media (max-width: 800px) {
  .composer-page { grid-template-columns: 1fr; }
  .stage-panel { border-right: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.11); }
  .dialogue-panel { padding: 20px 16px 36px; }
  .dialogue-row { grid-template-columns: 1fr 34px; }
  .dialogue-row > :nth-child(2) { grid-column: 1 / -1; grid-row: 2; }
}
</style>
