<script setup lang="ts">
import {
  NButton, NColorPicker, NEmpty, NIcon, NInput, NSelect,
  type SelectOption,
} from 'naive-ui';
import { AddFilled, DeleteFilled } from '@vicons/material';
import { computed, ref, watch } from 'vue';

import EditorStoryPreview from './EditorStoryPreview.vue';
import ClassicEditor from '../lines/editor';
import {
  defaultLine, type GfStory, type Line, type TextLine,
} from '../../types/lines';
import { IMAGE_PATH_PREFIX, type GfCharactersInfo } from '../../types/assets';
import type { Character, CharacterSprite } from '../../types/character';

import assetCharacterPresets from '../../assets/characters.json';

const characterPresets = assetCharacterPresets as unknown as GfCharactersInfo;

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
const activeDialogueId = ref('');
const previewLine = computed(() => dialogueLines.value
  .find((line) => line.id === activeDialogueId.value) ?? dialogueLines.value[0]);
const spriteSelectShown = ref<Record<string, boolean>>({});

watch(dialogueLines, (lines) => {
  if (!lines.some((line) => line.id === activeDialogueId.value)) {
    activeDialogueId.value = lines[0]?.id ?? '';
  }
}, { immediate: true });

const spriteOptions = computed<SelectOption[]>(() => {
  const options = new Map<string, SelectOption>();
  props.modelValue.characters.forEach((character) => {
    character.sprites.forEach((sprite) => {
      const path = `${character.name}/${sprite.name}`;
      options.set(path, { label: `${character.name} / ${sprite.name}`, value: path });
    });
  });
  Object.entries(characterPresets).forEach(([character, sprites]) => {
    Object.keys(sprites).forEach((sprite) => {
      const path = `${character}/${sprite}`;
      if (!options.has(path)) {
        options.set(path, { label: `${character} / ${sprite}`, value: path });
      }
    });
  });
  return [...options.values()]
    .sort((left, right) => String(left.label).localeCompare(String(right.label)));
});

function updateLines(lines: Line[], characters = props.modelValue.characters) {
  emit('update:modelValue', { characters, lines });
}

function updateDialogue(id: string, patch: Partial<TextLine>) {
  updateLines(props.modelValue.lines.map((line) => (
    line.type === 'text' && line.id === id ? { ...line, ...patch } : line
  )));
}

function mergeCharacters(paths: string[]) {
  const characters = props.modelValue.characters.map((character) => ({
    ...character,
    sprites: character.sprites.map((sprite) => ({ ...sprite })),
  }));

  paths.forEach((path) => {
    const [name, spriteName] = path.split('/');
    const preset = characterPresets[name]?.[spriteName];
    if (!preset) return;
    let character = characters.find((item) => item.name === name);
    if (!character) {
      character = {
        id: '', name, imported: true, sprites: [],
      };
      characters.push(character);
    }
    if (character.sprites.some((sprite) => sprite.name === spriteName)) return;
    character.sprites.push({
      id: '',
      name: spriteName,
      url: `${IMAGE_PATH_PREFIX}${preset.path}`,
      center: [-1, -1],
      scale: preset.scale,
    } satisfies CharacterSprite);
  });

  return characters;
}

function updateLineSprites(id: string, paths: string[]) {
  const sprites = [...new Set(paths)];
  // 选中后收起下拉，避免菜单遮挡下方的说话人标记。
  spriteSelectShown.value = { ...spriteSelectShown.value, [id]: false };
  updateLines(
    props.modelValue.lines.map((line) => (
      line.type === 'text' && line.id === id
        ? {
          ...line,
          sprites,
          remote: Object.fromEntries(
            Object.entries(line.remote).filter(([path]) => sprites.includes(path)),
          ),
          speaker: line.speaker && sprites.includes(line.speaker) ? line.speaker : '',
        }
        : line
    )),
    mergeCharacters(sprites),
  );
}

function showSpriteSelect(id: string) {
  spriteSelectShown.value = { ...spriteSelectShown.value, [id]: true };
}

function updateSpriteSelectShown(id: string, value: boolean) {
  spriteSelectShown.value = { ...spriteSelectShown.value, [id]: value };
}

function toggleLineSpeaker(id: string, path: string) {
  const line = props.modelValue.lines.find(
    (item) => item.type === 'text' && item.id === id,
  ) as TextLine | undefined;
  if (!line) return;
  updateDialogue(id, { speaker: line.speaker === path ? '' : path });
}

function addDialogue() {
  const line = defaultLine();
  const previous = dialogueLines.value[dialogueLines.value.length - 1];
  if (previous) {
    line.sprites = [...previous.sprites];
    line.remote = { ...previous.remote };
    line.speaker = previous.speaker;
  }
  activeDialogueId.value = line.id;
  updateLines([...props.modelValue.lines, line]);
}

function removeDialogue(id: string) {
  if (dialogueLines.value.length === 1) {
    updateDialogue(id, {
      narrator: '',
      narratorColor: '#ffffff',
      remote: {},
      sprites: [],
      speaker: '',
      text: '',
    });
    return;
  }
  updateLines(props.modelValue.lines.filter((line) => line.id !== id));
}
</script>

<template>
  <main class="composer-page">
    <section class="dialogue-panel">
      <div class="panel-heading">
        <div class="section-heading">对白</div>
        <n-button text type="primary" @click="emit('scene-settings')">背景与音乐</n-button>
      </div>
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
            <n-input :value="line.narrator" clearable placeholder="说话人名称（留空为旁白）"
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
          <div class="sprite-line">
            <n-select class="dialogue-sprites" :value="line.sprites" :options="spriteOptions"
              multiple filterable clearable
              placeholder="选择云端立绘（可搜索角色 / 立绘名称）"
              :show="spriteSelectShown[line.id] ?? false"
              @update:show="(value) => updateSpriteSelectShown(line.id, value)"
              @update:value="(value) => updateLineSprites(line.id, value)"
            />
            <n-button class="add-sprite" size="small" secondary
              title="添加立绘" @click.stop="showSpriteSelect(line.id)"
            >
              <n-icon size="16"><add-filled /></n-icon>
              添加立绘
            </n-button>
          </div>
          <div v-if="line.sprites.length > 1" class="sprite-speakers">
            <button v-for="path in line.sprites" :key="path" type="button"
              class="sprite-chip" :class="{ speaker: line.speaker === path }"
              :title="line.speaker === path ? '说话人' : '设为说话人'"
              @click.stop="toggleLineSpeaker(line.id, path)"
            >
              <span class="sprite-chip-name">{{ path }}</span>
              <span class="sprite-chip-role">{{ line.speaker === path ? '说话人' : '设为说话人' }}</span>
            </button>
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
        :characters="modelValue.characters" :sprites="previewLine?.sprites ?? []" :line="previewLine"
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
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.9fr);
  min-height: calc(100vh - 56px);
}

.composer-page > * {
  box-sizing: border-box;
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

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-heading {
  margin-bottom: 0;
  color: rgba(255, 255, 255, 0.88);
  font-size: 15px;
}

.preview-panel .section-heading {
  margin-bottom: 16px;
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
  grid-template-columns: minmax(140px, 200px) 42px 34px;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  min-width: 0;
}

.dialogue-meta :deep(.n-color-picker) {
  width: 42px;
}

.sprite-line {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 10px;
  min-width: 0;
}

.sprite-line .dialogue-sprites {
  flex: 1;
  min-width: 0;
}

.add-sprite {
  flex: 0 0 auto;
}

.sprite-speakers {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.sprite-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 3px;
  background: transparent;
  color: rgba(255, 255, 255, 0.78);
  cursor: pointer;
  font-size: 12px;
  line-height: 17px;
}

.sprite-chip:hover {
  border-color: rgba(255, 255, 255, 0.55);
}

.sprite-chip.speaker {
  border-color: rgba(99, 226, 183, 0.7);
  background: rgba(99, 226, 183, 0.1);
  color: #63e2b7;
}

.sprite-chip-name {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sprite-chip-role {
  font-size: 11px;
  opacity: 0.75;
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
  .composer-page {
    grid-template-columns: 1fr;
  }

  .preview-panel {
    border-top: 1px solid rgba(255, 255, 255, 0.11);
    border-left: 0;
  }
}

@media (max-width: 800px) {
  .dialogue-panel, .preview-panel {
    padding: 20px 16px 36px;
  }
}
</style>
