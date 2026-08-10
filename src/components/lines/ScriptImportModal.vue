<script setup lang="ts">
import {
  NAlert, NButton, NCard, NEmpty, NInput, NModal, NRadio, NRadioGroup,
  NSpace, NTag, NText, NUpload,
  type UploadCustomRequestOptions,
} from 'naive-ui';
import { computed, ref, watch } from 'vue';

import {
  parseScript, type ScriptParseResult,
} from '../../story/scriptParser';
import type { GfStory } from '../../types/lines';

const props = defineProps<{
  show: boolean,
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

function parseCurrent() {
  parseError.value = '';
  parsed.value = null;
  if (!hasContent.value) {
    parseError.value = '请先粘贴剧本或选择一个文本文件。';
    return;
  }
  try {
    parsed.value = parseScript(script.value);
  } catch (error) {
    parseError.value = error instanceof Error ? error.message : '剧本解析失败，请检查文本格式。';
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
    title="自动解析剧本" :bordered="false"
    @update:show="(value) => emit('update:show', value)"
  >
    <n-space vertical size="large">
      <n-alert type="info" :show-icon="false">
        支持 gfStory 原始剧本格式，也支持“角色：对白”、背景、BGM、音效和列表选项等常见写法。
        解析结果会先预览，确认后再写入编辑器。
      </n-alert>

      <n-space justify="space-between" align="center">
        <n-upload :show-file-list="false" accept=".txt,.md,text/plain,text/markdown"
          :custom-request="handleUpload"
        >
          <n-button>选择剧本文件</n-button>
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
        placeholder="粘贴剧本内容，例如：\n指挥官：准备好了吗？\n背景：station.png\n小队长||<bgm=rain>: 出发。"
        @update:value="() => { parsed = null; parseError = ''; }"
      />

      <n-space justify="end">
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
            <n-tag type="success">{{ parsed.stats.generatedLines }} 个节点</n-tag>
            <n-tag>{{ parsed.stats.textLines }} 段对白</n-tag>
            <n-tag type="info">{{ parsed.stats.sceneLines }} 个场景</n-tag>
            <n-tag type="warning">{{ parsed.stats.optionLines }} 个选项节点</n-tag>
            <n-tag>{{ parsed.stats.characters }} 个角色</n-tag>
          </n-space>
          <n-text depth="3">
            已读取 {{ parsed.stats.sourceLines }} 行有效剧本，生成的节点会沿用原编辑器的文本、场景和选项类型。
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
