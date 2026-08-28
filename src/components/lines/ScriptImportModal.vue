<script setup lang="ts">
import {
  NAlert, NButton, NCard, NEmpty, NInput, NModal, NRadio, NRadioGroup,
  NSpace, NTag, NText, NUpload,
  type UploadCustomRequestOptions,
} from 'naive-ui';
import { computed, ref, watch } from 'vue';

import {
  parseScript, type ScriptParseOptions, type ScriptParseResult,
} from '../../story/scriptParser';
import { parseStoryJson, looksLikeJson } from '../../story/jsonParser';
import type { GfStory } from '../../types/lines';

const props = defineProps<{
  show: boolean,
  parseOptions?: ScriptParseOptions,
}>();

const emit = defineEmits<{
  'update:show': [value: boolean],
  apply: [story: GfStory, mode: 'replace' | 'append'],
}>();

const script = ref('');
const parsed = ref<ScriptParseResult | null>(null);
const mode = ref<'replace' | 'append'>('replace');
const parseError = ref('');

const hasContent = computed(() => script.value.trim() !== '');
const canApply = computed(() => parsed.value !== null && parsed.value.story.lines.length > 0);
const detectedFormat = computed<'json' | 'script' | 'empty'>(() => {
  if (!hasContent.value) return 'empty';
  return looksLikeJson(script.value) ? 'json' : 'script';
});
const placeholderText = [
  '粘贴剧本或 JSON，例如：',
  '指挥官：准备好了吗？',
  '背景：station.png',
  '小队长||<bgm=rain>: 出发。',
  '',
  '[{ "bgm": "rain", "speaker": "格琳", "sprite": "NPC-Kalin(0)", "text": "早啊，指挥官。" }]',
].join('\n');
const formatName = computed(() => (parsed.value?.format === 'json' ? 'JSON 剧情数据' : '文本剧本'));
const sourceUnit = computed(() => (parsed.value?.format === 'json' ? '条记录' : '行有效剧本'));

interface StatTag {
  label: string,
  value: number,
  type: 'default' | 'info' | 'success' | 'warning',
}

const statTags = computed<StatTag[]>(() => {
  const stats = parsed.value?.stats;
  if (!stats) return [];
  return [
    { label: '个节点', value: stats.generatedLines, type: 'success' },
    { label: '段对白', value: stats.textLines, type: 'default' },
    { label: '个说话人', value: stats.speakers, type: 'default' },
    { label: '段带立绘', value: stats.spriteLines, type: 'default' },
    { label: '个角色', value: stats.characters, type: 'info' },
    { label: '条背景音乐', value: stats.bgmLines, type: 'info' },
    { label: '个背景', value: stats.backgroundLines, type: 'info' },
    { label: '条音效', value: stats.seLines, type: 'info' },
    { label: '个选项节点', value: stats.optionLines, type: 'warning' },
  ];
});

function parseCurrent() {
  parseError.value = '';
  parsed.value = null;
  if (!hasContent.value) {
    parseError.value = '请先粘贴剧本、JSON 数据，或选择一个文件。';
    return;
  }
  try {
    parsed.value = detectedFormat.value === 'json'
      ? parseStoryJson(script.value, props.parseOptions)
      : parseScript(script.value, props.parseOptions);
  } catch (error) {
    parseError.value = error instanceof Error ? error.message : '内容解析失败，请检查格式。';
  }
}

async function handleUpload(options: UploadCustomRequestOptions) {
  const { file } = options.file;
  if (!file) return;
  script.value = await file.text();
  parseCurrent();
  options.onFinish();
}

function apply() {
  if (!parsed.value) return;
  emit('apply', parsed.value.story, mode.value);
  emit('update:show', false);
}

function reset() {
  script.value = '';
  parsed.value = null;
  parseError.value = '';
  mode.value = 'replace';
}

watch(() => props.show, (show) => {
  if (!show) reset();
});
</script>

<template>
  <n-modal :show="show" preset="card" style="width: min(860px, calc(100vw - 32px))"
    title="导入剧本 / JSON" :bordered="false"
    @update:show="(value) => emit('update:show', value)"
  >
    <n-space vertical size="large">
      <n-alert type="info" :show-icon="false">
        支持粘贴文本剧本或任意 JSON 剧情数据。JSON 会自动辨认字段含义：对白（text/content/对白）、
        说话人（speaker/name/角色）、立绘（sprite/立绘/角色名(编号)）、背景音乐（bgm/music）、
        背景与音效，识别结果会先预览，确认后再写入编辑器。
      </n-alert>

      <n-space justify="space-between" align="center">
        <n-upload :show-file-list="false"
          accept=".txt,.md,.json,text/plain,text/markdown,application/json"
          :custom-request="handleUpload"
        >
          <n-button>选择剧本 / JSON 文件</n-button>
        </n-upload>
        <n-space align="center">
          <n-text depth="3">导入方式</n-text>
          <n-radio-group v-model:value="mode" name="script-import-mode">
            <n-radio value="replace">替换当前剧情</n-radio>
            <n-radio value="append">追加到末尾</n-radio>
          </n-radio-group>
        </n-space>
      </n-space>

      <n-input v-model:value="script" type="textarea" :autosize="{ minRows: 10, maxRows: 18 }"
        :placeholder="placeholderText"
        @update:value="() => { parsed = null; parseError = ''; }"
      />

      <n-space justify="end" align="center">
        <n-text v-if="detectedFormat !== 'empty'" depth="3">
          识别为{{ detectedFormat === 'json' ? ' JSON 剧情数据' : '文本剧本' }}
        </n-text>
        <n-button type="primary" secondary :disabled="!hasContent" @click="parseCurrent">
          开始解析
        </n-button>
      </n-space>

      <n-alert v-if="parseError" type="error" :show-icon="false">
        {{ parseError }}
      </n-alert>

      <n-card v-if="parsed" size="small" title="解析预览">
        <n-space vertical>
          <n-space>
            <n-tag>{{ formatName }}</n-tag>
            <n-tag v-for="stat in statTags" :key="stat.label" :type="stat.type">
              {{ stat.value }} {{ stat.label }}
            </n-tag>
          </n-space>
          <n-text depth="3">
            已读取 {{ parsed.stats.sourceLines }} {{ sourceUnit }}，生成的节点会沿用原编辑器的文本、场景和选项类型。
          </n-text>
          <n-alert v-if="parsed.warnings.length > 0" type="warning" :show-icon="false">
            <template #header>有 {{ parsed.warnings.length }} 条需要人工确认的提示</template>
            <ul class="warnings">
              <li v-for="warning in parsed.warnings.slice(0, 8)"
                :key="`${warning.line}-${warning.message}`"
              >
                第 {{ warning.line }} 行：{{ warning.message }}
              </li>
            </ul>
            <n-text v-if="parsed.warnings.length > 8" depth="3">
              其余提示将在导入后保留在解析日志中。
            </n-text>
          </n-alert>
          <n-empty v-else description="没有发现需要确认的解析问题" size="small" />
        </n-space>
      </n-card>

      <n-space justify="end">
        <n-button @click="emit('update:show', false)">取消</n-button>
        <n-button type="primary" :disabled="!canApply" @click="apply">导入并生成节点</n-button>
      </n-space>
    </n-space>
  </n-modal>
</template>

<style scoped>
.warnings {
  margin: 0.5em 0 0;
  padding-left: 1.25em;
}
.warnings li + li {
  margin-top: 0.35em;
}
</style>
