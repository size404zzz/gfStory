<script setup lang="ts">
import {
  NButton, NButtonGroup, NCard, NCheckbox, NEmpty,
  NForm, NFormItem, NIcon, NInput, NMenu, NModal,
  NRadioButton, NRadioGroup, NSelect, NSpace, NTag,
  NUpload, useDialog,
  type MenuOption, type UploadCustomRequestOptions,
} from 'naive-ui';
import {
  AddFilled, ContentPasteFilled, DeleteFilled, DownloadFilled,
  HelpCenterFilled, MoveDownFilled, MoveUpFilled,
  RefreshFilled, UploadFilled,
} from '@vicons/material';
import {
  computed, h, provide, ref, watch,
} from 'vue';

import ScriptImportModal from './ScriptImportModal.vue';
import StoryLineView from './StoryLineView.vue';
import StoryList from '../simulator/StoryList.vue';
import {
  defaultLine, nextId, type GfStory, type Line, type OptionLine,
  type SceneLine, type TextLine,
} from '../../types/lines';
import { labelCharactersWithIds, type Character } from '../../types/character';
import { importMarkdownString } from '../../story/compiler';
import { db } from '../../db/media';

const props = defineProps<{
  modelValue: GfStory,
}>();
const characters = ref(props.modelValue.characters);
const lines = ref(props.modelValue.lines);

provide('characters', computed(() => labelCharactersWithIds(characters.value)));
provide('characterStore', characters);
provide('narrators', computed(() => {
  const narrators = characters.value.map((character) => character.name).concat(lines.value
    .filter((line) => line.type === 'text' && line.narrator !== '')
    .map((line) => (line as TextLine).narrator));
  return ['', ...new Set(narrators)]
    .map((narrator) => ({ label: narrator, value: narrator }));
}));

const emit = defineEmits<{
  'update:modelValue': [value: GfStory],
  'export': [type: 'json' | 'markdown' | 'zip'],
  'import': [type: 'json' | 'markdown'],
}>();

type LineFilter = 'all' | Line['type'];
type NewLineType = Line['type'];
type BatchScope = 'selection' | 'visible';

const shouldShowScriptImport = ref(false);
const showStorySelect = ref(false);
const showBatchEditor = ref(false);
const query = ref('');
const typeFilter = ref<LineFilter>('all');
const activeId = ref(lines.value[0]?.id ?? '');
const selectedIds = ref<string[]>(activeId.value ? [activeId.value] : []);
const batchScope = ref<BatchScope>('selection');
const batchFind = ref('');
const batchReplace = ref('');
const batchNarrator = ref<string | null>(null);
const shouldChangeNarrator = ref(false);

const narratorOptions = computed(() => {
  const names = new Set<string>();
  characters.value.forEach((character) => names.add(character.name));
  lines.value.forEach((line) => {
    if (line.type === 'text' && line.narrator) names.add(line.narrator);
  });
  return [...names].map((name) => ({ label: name, value: name }));
});

function pruneHtml(html: string) {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container.innerText.replace(/\s+/g, ' ').trim();
}

function sceneLabel(line: SceneLine) {
  if (line.scene === 'background') return '背景';
  if (line.scene === 'audio') return 'BGM';
  return '音效';
}

function lineLabel(line: Line) {
  if (line.type === 'text') return line.narrator || '旁白';
  if (line.type === 'scene') return sceneLabel(line);
  return '选项';
}

function linePreview(line: Line) {
  if (line.type === 'text') return pruneHtml(line.text) || '空白对白';
  if (line.type === 'scene') return line.media || '未选择资源';
  return line.options.map((option) => option.key).filter(Boolean).join(' / ') || '未填写选项';
}

const filteredLines = computed(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase();
  return lines.value.map((line, index) => ({ line, index })).filter(({ line }) => {
    if (typeFilter.value !== 'all' && line.type !== typeFilter.value) return false;
    if (!normalizedQuery) return true;
    return `${lineLabel(line)} ${linePreview(line)}`.toLocaleLowerCase().includes(normalizedQuery);
  });
});

watch(filteredLines, (items) => {
  if (items.length === 0 || items.some(({ line }) => line.id === activeId.value)) return;
  activeId.value = items[0].line.id;
  if (selectedIds.value.length === 0) selectedIds.value = [activeId.value];
});

const activeLine = computed(() => lines.value.find((line) => line.id === activeId.value));
const activeIndex = computed(() => lines.value.findIndex((line) => line.id === activeId.value));
const selectedCount = computed(() => selectedIds.value.length);
const selectedLineIds = computed(() => new Set(selectedIds.value));
const batchTargetIds = computed(() => {
  if (batchScope.value === 'selection' && selectedIds.value.length > 0) {
    return new Set(selectedIds.value);
  }
  return new Set(filteredLines.value.map(({ line }) => line.id));
});
const batchTextCount = computed(() => lines.value.filter((line) => (
  line.type === 'text' && batchTargetIds.value.has(line.id)
)).length);
const canApplyBatch = computed(() => (
  batchTextCount.value > 0
  && (batchFind.value !== '' || (shouldChangeNarrator.value && batchNarrator.value !== null))
));

function setActive(id: string, keepSelection = false) {
  activeId.value = id;
  if (!keepSelection) selectedIds.value = id ? [id] : [];
}

function selectLine(id: string) {
  setActive(id);
}

function toggleSelected(id: string, checked: boolean) {
  if (checked) {
    if (!selectedIds.value.includes(id)) selectedIds.value.push(id);
    if (!activeId.value) activeId.value = id;
    return;
  }
  selectedIds.value = selectedIds.value.filter((item) => item !== id);
  if (activeId.value === id) activeId.value = selectedIds.value[0] ?? '';
}

function resetSelection(preferredId = lines.value[0]?.id ?? '') {
  setActive(preferredId);
}

function insertLine(line: Line) {
  const insertionIndex = activeIndex.value === -1 ? lines.value.length : activeIndex.value + 1;
  lines.value.splice(insertionIndex, 0, line);
  resetSelection(line.id);
}

function createTextLine() {
  const line = defaultLine();
  for (let i = lines.value.length - 1; i >= 0; i -= 1) {
    const previous = lines.value[i];
    if (previous.type === 'text') {
      line.sprites = [...previous.sprites];
      break;
    }
  }
  return line;
}

function createSceneLine(): SceneLine {
  return {
    type: 'scene',
    id: nextId(),
    scene: 'background',
    media: '',
    style: 'cover',
    classes: [],
  };
}

function createOptionLine(): OptionLine {
  return {
    type: 'option',
    id: nextId(),
    options: [
      { key: '选项 1', value: '1' },
      { key: '选项 2', value: '2' },
    ],
  };
}

function addLine(type: NewLineType) {
  if (type === 'text') insertLine(createTextLine());
  if (type === 'scene') insertLine(createSceneLine());
  if (type === 'option') insertLine(createOptionLine());
}

function duplicateSelected() {
  const ids = selectedIds.value.length > 0 ? selectedLineIds.value : new Set([activeId.value]);
  const copies: string[] = [];
  for (let index = lines.value.length - 1; index >= 0; index -= 1) {
    const line = lines.value[index];
    if (ids.has(line.id)) {
      const copy = JSON.parse(JSON.stringify(line)) as Line;
      copy.id = nextId();
      lines.value.splice(index + 1, 0, copy);
      copies.unshift(copy.id);
    }
  }
  if (copies.length > 0) {
    activeId.value = copies[0];
    selectedIds.value = copies;
  }
}

function removeSelected() {
  const ids = selectedIds.value.length > 0 ? selectedLineIds.value : new Set([activeId.value]);
  const fallbackIndex = activeIndex.value;
  lines.value.splice(0, lines.value.length, ...lines.value.filter((line) => !ids.has(line.id)));
  resetSelection(lines.value[Math.min(Math.max(fallbackIndex, 0), lines.value.length - 1)]?.id ?? '');
}

function moveActive(offset: -1 | 1) {
  const index = activeIndex.value;
  const targetIndex = index + offset;
  if (index < 0 || targetIndex < 0 || targetIndex >= lines.value.length) return;
  const current = lines.value[index];
  lines.value[index] = lines.value[targetIndex];
  lines.value[targetIndex] = current;
}

function openBatchEditor() {
  batchScope.value = selectedIds.value.length > 0 ? 'selection' : 'visible';
  batchFind.value = '';
  batchReplace.value = '';
  batchNarrator.value = null;
  shouldChangeNarrator.value = false;
  showBatchEditor.value = true;
}

function applyBatchChanges() {
  if (!canApplyBatch.value) return;
  lines.value.forEach((line) => {
    if (line.type !== 'text' || !batchTargetIds.value.has(line.id)) return;
    if (batchFind.value !== '') {
      line.text = line.text.split(batchFind.value).join(batchReplace.value);
    }
    if (shouldChangeNarrator.value && batchNarrator.value !== null) {
      line.narrator = batchNarrator.value;
    }
  });
  showBatchEditor.value = false;
}

function mergeImportedCharacters(imported: GfStory['characters']) {
  imported.forEach((character) => {
    const existing = characters.value.find((item) => item.name === character.name);
    if (!existing) {
      characters.value.push({
        ...character,
        id: '',
        sprites: character.sprites.map((sprite) => ({ ...sprite, id: '' })),
      });
      return;
    }
    character.sprites.forEach((sprite) => {
      if (!existing.sprites.some((item) => item.name === sprite.name)) {
        existing.sprites.push({ ...sprite, id: '' });
      }
    });
  });
}

function applyScriptImport(story: GfStory, mode: 'replace' | 'append') {
  if (mode === 'replace') {
    characters.value.splice(0, characters.value.length, ...story.characters.map((character) => ({
      ...character,
      id: '',
      sprites: character.sprites.map((sprite) => ({ ...sprite, id: '' })),
    })));
    lines.value.splice(0, lines.value.length, ...story.lines.map((line) => ({ ...line, id: nextId() })));
  } else {
    mergeImportedCharacters(story.characters);
    lines.value.push(...story.lines.map((line) => ({ ...line, id: nextId() })));
  }
  resetSelection(lines.value[0]?.id ?? '');
  emit('update:modelValue', props.modelValue);
}

const dialog = useDialog();
function showHelpDialog() {
  dialog.info({
    title: '编辑器说明',
    content: '剧本大纲用于定位、筛选和批量管理节点；选择一个节点后，可在右侧修改详细内容。修改完成后使用“暂存并预览”刷新右侧模拟器。',
  });
}

async function importJson(options: UploadCustomRequestOptions) {
  const { file } = options.file;
  if (!file) return;
  const story: GfStory = JSON.parse(await file.text());
  if (!Array.isArray(story.characters) || !Array.isArray(story.lines)) return;
  if (!story.characters.every((c) => c.id && c.name && Array.isArray(c.sprites)
    && c.sprites.every((s) => s.id && s.name && s.url))) return;
  if (!story.lines.every((line) => line.id && line.type)) return;
  const current = props.modelValue;
  current.characters.splice(0, current.characters.length, ...story.characters);
  current.lines.splice(0, current.lines.length, ...story.lines);
  resetSelection(current.lines[0]?.id ?? '');
  emit('update:modelValue', current);
}

async function importMarkdownFile(markdown: string) {
  const parsed = importMarkdownString(markdown);
  if (!parsed) return;
  const mapping = await db.importResources(parsed.resources);
  parsed.lines.forEach((line) => {
    line.id = nextId();
    if (line.type === 'scene' && mapping[line.media]) line.media = mapping[line.media];
  });
  (parsed.characters as Character[]).forEach((character) => {
    character.imported = true;
  });
  const current = props.modelValue;
  current.lines.splice(0, current.lines.length, ...parsed.lines);
  current.characters.splice(0, current.characters.length, ...labelCharactersWithIds(parsed.characters as Character[]));
  lines.value = current.lines;
  resetSelection(current.lines[0]?.id ?? '');
  emit('update:modelValue', current);
}

async function importMarkdown(options: UploadCustomRequestOptions) {
  const { file } = options.file;
  if (!file) return;
  await importMarkdownFile(await file.text());
}

async function importStory(file: string) {
  showStorySelect.value = false;
  const [, path] = file.split('|');
  await importMarkdownFile(await fetch(`/stories/${path}`).then((res) => res.text()));
}

const ioOptions: MenuOption[] = [
  {
    title: '导出',
    icon: () => h(DownloadFilled),
    key: 'export',
    children: [
      { title: '导出为 JSON', key: 'json' },
      { title: '导出为 Markdown', key: 'markdown' },
      { title: '导出为完整压缩包', key: 'zip' },
    ],
  },
  {
    title: '导入',
    icon: () => h(UploadFilled),
    key: 'import',
    children: [
      { title: '清空内容', key: 'reset' },
      {
        title: () => h(NUpload, {
          customRequest: importJson,
          accept: 'application/json',
        }, { default: () => '导入 JSON（实验性）' }),
        key: 'import-json',
      },
      {
        title: () => h(NUpload, {
          customRequest: importMarkdown,
          accept: 'text/plain',
        }, { default: () => '尝试导入 Markdown（实验性）' }),
        key: 'import-markdown',
      },
      {
        title: '尝试导入剧情模拟器 Markdown（实验性）',
        key: 'import-simulator',
      },
    ],
  },
];

function doIo(value: string) {
  switch (value) {
    case 'json':
    case 'markdown':
    case 'zip':
      emit('update:modelValue', props.modelValue);
      emit('export', value);
      break;
    case 'import-simulator':
      showStorySelect.value = true;
      break;
    case 'reset': {
      const current = props.modelValue;
      current.characters.splice(0);
      current.lines.splice(0);
      lines.value = current.lines;
      resetSelection('');
      emit('update:modelValue', current);
      break;
    }
    default:
      break;
  }
}
</script>

<template>
  <script-import-modal v-model:show="shouldShowScriptImport" @apply="applyScriptImport" />
  <n-modal v-model:show="showStorySelect" preset="card">
    <story-list value="" @update:value="importStory" />
  </n-modal>
  <n-modal v-model:show="showBatchEditor" preset="card" title="批量编辑对白" style="max-width: 620px">
    <n-form label-placement="left" label-width="96">
      <n-form-item label="应用范围">
        <n-radio-group v-model:value="batchScope">
          <n-radio-button value="selection" :disabled="selectedCount === 0">已选节点</n-radio-button>
          <n-radio-button value="visible">当前筛选结果</n-radio-button>
        </n-radio-group>
      </n-form-item>
      <n-form-item label="查找">
        <n-input v-model:value="batchFind" placeholder="要替换的对白内容" />
      </n-form-item>
      <n-form-item label="替换为">
        <n-input v-model:value="batchReplace" placeholder="留空即可删除查找到的内容" />
      </n-form-item>
      <n-form-item label="角色名">
        <n-space vertical size="small" style="width: 100%">
          <n-checkbox v-model:checked="shouldChangeNarrator">同时更改角色名</n-checkbox>
          <n-select v-model:value="batchNarrator" :options="narratorOptions" filterable tag clearable
            :disabled="!shouldChangeNarrator" placeholder="选择或输入角色名"
          />
        </n-space>
      </n-form-item>
    </n-form>
    <template #action>
      <n-space justify="space-between" align="center">
        <n-tag>{{ batchTextCount }} 个对白节点</n-tag>
        <n-space>
          <n-button @click="showBatchEditor = false">取消</n-button>
          <n-button type="primary" :disabled="!canApplyBatch" @click="applyBatchChanges">应用更改</n-button>
        </n-space>
      </n-space>
    </template>
  </n-modal>

  <n-card class="editor-toolbar" size="small" :bordered="false">
    <div class="toolbar-row">
      <n-button-group>
        <n-button type="primary" @click="addLine('text')">
          <n-icon><add-filled /></n-icon>对白
        </n-button>
        <n-button secondary type="primary" @click="addLine('scene')">场景</n-button>
        <n-button secondary type="primary" @click="addLine('option')">选项</n-button>
        <n-button type="info" @click="shouldShowScriptImport = true">
          <n-icon><upload-filled /></n-icon>自动解析剧本
        </n-button>
      </n-button-group>
      <n-space class="toolbar-actions" wrap>
        <n-button quaternary :disabled="selectedCount === 0" title="复制选中节点" @click="duplicateSelected">
          <n-icon><content-paste-filled /></n-icon>
        </n-button>
        <n-button quaternary type="error" :disabled="selectedCount === 0" title="删除选中节点" @click="removeSelected">
          <n-icon><delete-filled /></n-icon>
        </n-button>
        <n-button quaternary :disabled="activeIndex <= 0" title="上移当前节点" @click="moveActive(-1)">
          <n-icon><move-up-filled /></n-icon>
        </n-button>
        <n-button quaternary :disabled="activeIndex === -1 || activeIndex >= lines.length - 1" title="下移当前节点" @click="moveActive(1)">
          <n-icon><move-down-filled /></n-icon>
        </n-button>
        <n-button secondary :disabled="lines.length === 0" @click="openBatchEditor">批量编辑</n-button>
        <n-button type="warning" @click="emit('update:modelValue', modelValue)">
          <n-icon><refresh-filled /></n-icon>暂存并预览
        </n-button>
        <n-button quaternary title="帮助" @click="showHelpDialog">
          <n-icon><help-center-filled /></n-icon>
        </n-button>
      </n-space>
    </div>
    <div class="toolbar-meta">
      <n-tag>{{ lines.length }} 个节点</n-tag>
      <n-tag type="info">{{ lines.filter((line) => line.type === 'text').length }} 段对白</n-tag>
      <n-tag type="success">{{ lines.filter((line) => line.type === 'scene').length }} 个场景</n-tag>
      <n-tag type="warning">{{ lines.filter((line) => line.type === 'option').length }} 个选项</n-tag>
      <n-menu class="io-menu" mode="horizontal" :options="ioOptions" @update:value="doIo" />
    </div>
  </n-card>

  <section class="story-workbench">
    <aside class="story-outline" aria-label="剧情节点大纲">
      <div class="outline-tools">
        <n-input v-model:value="query" clearable placeholder="搜索对白、角色或资源" />
        <n-button-group class="type-filter">
          <n-button size="small" :type="typeFilter === 'all' ? 'primary' : 'default'" @click="typeFilter = 'all'">全部</n-button>
          <n-button size="small" :type="typeFilter === 'text' ? 'primary' : 'default'" @click="typeFilter = 'text'">对白</n-button>
          <n-button size="small" :type="typeFilter === 'scene' ? 'primary' : 'default'" @click="typeFilter = 'scene'">场景</n-button>
          <n-button size="small" :type="typeFilter === 'option' ? 'primary' : 'default'" @click="typeFilter = 'option'">选项</n-button>
        </n-button-group>
      </div>
      <div class="outline-count">显示 {{ filteredLines.length }} / {{ lines.length }} 个节点</div>
      <div class="outline-list">
        <div v-for="({ line, index }) in filteredLines" :key="line.id" class="outline-node"
          :class="[`outline-node--${line.type}`, { 'is-active': line.id === activeId }]"
        >
          <n-checkbox class="node-checkbox" :checked="selectedLineIds.has(line.id)" :aria-label="`选择第 ${index + 1} 个节点`"
            @click.stop @update:checked="(checked) => toggleSelected(line.id, checked)"
          />
          <button class="node-main" type="button" @click="selectLine(line.id)">
            <span class="node-index">{{ String(index + 1).padStart(3, '0') }}</span>
            <span class="node-copy">
              <span class="node-kind">{{ lineLabel(line) }}</span>
              <span class="node-preview">{{ linePreview(line) }}</span>
            </span>
          </button>
        </div>
        <n-empty v-if="filteredLines.length === 0" size="small" description="没有匹配的节点" />
      </div>
    </aside>

    <main class="node-inspector">
      <template v-if="activeLine">
        <header class="inspector-header">
          <div>
            <span class="inspector-eyebrow">节点 {{ String(activeIndex + 1).padStart(3, '0') }}</span>
            <h2>{{ lineLabel(activeLine) }}</h2>
          </div>
          <n-space>
            <n-tag :type="activeLine.type === 'text' ? 'info' : activeLine.type === 'scene' ? 'success' : 'warning'">
              {{ activeLine.type === 'text' ? '对白节点' : activeLine.type === 'scene' ? '场景节点' : '选项节点' }}
            </n-tag>
            <n-button quaternary title="复制当前节点" @click="duplicateSelected">
              <n-icon><content-paste-filled /></n-icon>
            </n-button>
            <n-button quaternary type="error" title="删除当前节点" @click="removeSelected">
              <n-icon><delete-filled /></n-icon>
            </n-button>
          </n-space>
        </header>
        <story-line-view :modelValue="activeLine" />
      </template>
      <n-empty v-else description="从左侧选择节点，或创建一个新节点" />
    </main>
  </section>
</template>

<style scoped>
.editor-toolbar {
  position: sticky;
  top: 0;
  z-index: 3;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 0;
  background: rgba(24, 24, 28, 0.96);
  backdrop-filter: blur(12px);
}

.toolbar-row,
.toolbar-meta,
.outline-tools,
.inspector-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toolbar-row {
  justify-content: space-between;
  flex-wrap: wrap;
}

.toolbar-row > .n-button-group,
.toolbar-actions {
  max-width: 100%;
}

.toolbar-row > .n-button-group {
  display: flex;
  flex-wrap: wrap;
}

.toolbar-actions {
  justify-content: flex-end;
}

.toolbar-meta {
  margin-top: 8px;
  min-height: 28px;
}

.io-menu {
  margin-left: auto;
}

.story-workbench {
  display: grid;
  grid-template-columns: minmax(250px, 34%) minmax(0, 1fr);
  min-height: calc(100vh - 114px);
}

.story-outline {
  min-width: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.12);
  background: #1a1a1e;
}

.outline-tools {
  position: sticky;
  top: 114px;
  z-index: 2;
  flex-wrap: wrap;
  padding: 12px;
  background: #1a1a1e;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.outline-tools :deep(.n-input) {
  flex: 1 1 100%;
}

.type-filter {
  display: flex;
  width: 100%;
}

.type-filter :deep(.n-button) {
  flex: 1;
}

.outline-count {
  padding: 8px 12px;
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
}

.outline-list {
  padding: 0 8px 16px;
}

.outline-node {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: stretch;
  min-height: 64px;
  margin-bottom: 4px;
  border-left: 3px solid #777;
  background: rgba(255, 255, 255, 0.025);
}

.outline-node--text { border-left-color: #4f9cf9; }
.outline-node--scene { border-left-color: #40b089; }
.outline-node--option { border-left-color: #dba64a; }

.outline-node.is-active {
  background: rgba(255, 255, 255, 0.11);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15);
}

.node-checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
}

.node-main {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  min-width: 0;
  padding: 10px 10px 10px 4px;
  border: 0;
  color: inherit;
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.node-main:hover { background: rgba(255, 255, 255, 0.045); }

.node-index,
.inspector-eyebrow {
  color: rgba(255, 255, 255, 0.45);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.node-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.node-kind {
  color: rgba(255, 255, 255, 0.82);
  font-size: 13px;
}

.node-preview {
  overflow: hidden;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.node-inspector {
  min-width: 0;
  padding: 20px 24px 36px;
  background: #202024;
}

.inspector-header {
  justify-content: space-between;
  min-height: 52px;
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.inspector-header h2 {
  margin: 2px 0 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.25;
}

@media (max-width: 1100px) {
  .toolbar-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .toolbar-row > :last-child {
    width: 100%;
    justify-content: flex-end;
  }
}

@media (max-width: 760px) {
  .editor-toolbar { position: static; }
  .toolbar-meta { flex-wrap: wrap; }
  .io-menu { width: 100%; margin-left: 0; }
  .story-workbench { grid-template-columns: 1fr; }
  .story-outline { border-right: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.12); }
  .outline-tools { position: static; }
  .outline-list { max-height: 360px; overflow-y: auto; }
  .node-inspector { padding: 16px 12px 28px; }
}
</style>
