<script setup lang="ts">
import { NTabs, NTabPane } from 'naive-ui';

import OptionLineView from './OptionLineView.vue';
import SceneLineView from './SceneLineView.vue';
import TextLineView from './TextLineView.vue';
import type {
  Line, OptionLine, SceneLine, TextLine,
} from '../../types/lines';
import { convertLineType } from '../../types/lines';

const props = defineProps<{
  modelValue: Line,
}>();

const emit = defineEmits<{
  'update:modelValue': [value: Line],
}>();

function updateType(type: string) {
  if (type !== 'text' && type !== 'scene' && type !== 'option') return;
  if (props.modelValue.type === type) return;
  emit('update:modelValue', convertLineType(props.modelValue, type));
}
</script>

<template>
  <n-tabs :value="modelValue.type" @update:value="updateType">
    <n-tab-pane name="text" tab="文本内容">
      <text-line-view :modelValue="(modelValue as TextLine)"
        @update:modelValue="(v) => emit('update:modelValue', v)"
      ></text-line-view>
    </n-tab-pane>
    <n-tab-pane name="scene" tab="场景">
      <scene-line-view :modelValue="(modelValue as SceneLine)"
        @update:modelValue="(v) => emit('update:modelValue', v)"
      ></scene-line-view>
    </n-tab-pane>
    <n-tab-pane name="option" tab="选项">
      <option-line-view :modelValue="(modelValue as OptionLine)"
        @update:modelValue="(v) => emit('update:modelValue', v)"
      ></option-line-view>
    </n-tab-pane>
  </n-tabs>
</template>
