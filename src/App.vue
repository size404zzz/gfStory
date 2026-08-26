<script setup lang="ts">
import { saveAs } from 'file-saver';
import {
  darkTheme, zhCN,
  NButton, NConfigProvider, NDialogProvider,
  NNotificationProvider,
} from 'naive-ui';
import { ref } from 'vue';

import DialogueComposer from './components/editor/DialogueComposer.vue';
import EditorStart from './components/editor/EditorStart.vue';
import SceneSetup from './components/editor/SceneSetup.vue';
import {
  defaultLine, initUniqueId, nextId, type GfStory, type Line, type SceneLine,
} from './types/lines';

type EditorStep = 'start' | 'scene' | 'dialogue';

const step = ref<EditorStep>('start');
const story = ref<GfStory | null>(null);
const background = ref('');
const music = ref('');

function isScene(line: Line): line is SceneLine {
  return line.type === 'scene';
}

function readSceneSettings(value: GfStory) {
  const scenes = value.lines.filter(isScene);
  background.value = scenes.find((line) => line.scene === 'background')?.media ?? '';
  music.value = scenes.find((line) => line.scene === 'audio')?.media ?? '';
}

function startNewStory() {
  story.value = { characters: [], lines: [] };
  initUniqueId(story.value);
  background.value = '';
  music.value = '';
  step.value = 'scene';
}

function importStory(value: GfStory) {
  story.value = value;
  initUniqueId(value);
  readSceneSettings(value);
  step.value = 'scene';
}

function updateStory(value: GfStory) {
  story.value = value;
}

function finishSceneSetup() {
  if (!story.value) return;
  const scenes: SceneLine[] = [];
  if (background.value) {
    scenes.push({
      type: 'scene',
      id: nextId(),
      scene: 'background',
      media: background.value,
      style: 'cover',
      classes: [],
    });
  }
  if (music.value) {
    scenes.push({
      type: 'scene',
      id: nextId(),
      scene: 'audio',
      media: music.value,
      style: 'cover',
      classes: [],
    });
  }
  const content = story.value.lines.filter((line) => line.type !== 'scene');
  if (!content.some((line) => line.type === 'text')) content.push(defaultLine());
  story.value = { ...story.value, lines: [...scenes, ...content] };
  step.value = 'dialogue';
}

function saveJson() {
  if (!story.value) return;
  saveAs(new Blob([JSON.stringify(story.value)], {
    type: 'application/json',
  }), 'story.json');
}

function returnToStart() {
  story.value = null;
  step.value = 'start';
}
</script>

<template>
  <n-config-provider :theme="darkTheme" :locale="zhCN">
    <n-dialog-provider>
      <n-notification-provider>
        <editor-start v-if="step === 'start'" @create="startNewStory" @import="importStory" />
        <div v-else-if="story" class="project-shell">
          <header class="project-header">
            <n-button text @click="returnToStart">返回开始页</n-button>
            <n-button secondary type="primary" @click="saveJson">保存 JSON</n-button>
          </header>
          <scene-setup v-if="step === 'scene'" v-model:background="background" v-model:music="music"
            @back="returnToStart" @continue="finishSceneSetup"
          />
          <dialogue-composer v-else :modelValue="story" @update:modelValue="updateStory"
            @scene-settings="step = 'scene'"
          />
        </div>
      </n-notification-provider>
    </n-dialog-provider>
  </n-config-provider>
</template>

<style>
#app,
body {
  min-height: 100vh;
}

.project-shell {
  min-height: 100vh;
  background: #1b1b1f;
}

.project-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.11);
  background: #18181c;
}
</style>
