<script setup lang="ts">
import {
  NForm, NFormItem, NRadioButton, NRadioGroup,
  NSelect, NTooltip, type SelectOption,
} from 'naive-ui';

import MediaSelector from '../media/MediaSelector.vue';
import { type SceneLine } from '../../types/lines';

const props = defineProps<{
  modelValue: SceneLine,
}>();

const emit = defineEmits<{
  'update:modelValue': [value: SceneLine],
}>();

function update(patch: Partial<SceneLine>) {
  emit('update:modelValue', { ...props.modelValue, ...patch });
}

const classOptions: SelectOption[] = Object.entries({
  night: '夜间滤镜',
  blank: '黑屏渐出',
  'fade-in': '渐入',
}).flatMap(([value, label]) => [
  { label, value },
  { label: `取消${label}`, value: `!${value}` },
]);
</script>

<template>
  <n-form>
    <n-form-item label="类型" path="scene">
      <n-radio-group :value="modelValue.scene" @update:value="(v) => update({ scene: v })">
        <n-radio-button value="background">背景图片</n-radio-button>
        <n-radio-button value="audio">背景音乐</n-radio-button>
        <n-radio-button value="se">音效</n-radio-button>
      </n-radio-group>
    </n-form-item>
    <n-form-item v-if="modelValue.scene === 'background'" label="效果" path="classes">
      <n-select :options="classOptions" multiple filterable clearable
        :value="modelValue.classes ?? []"
        @update:value="(v) => update({ classes: v })"
      >
      </n-select>
    </n-form-item>
    <n-form-item v-if="modelValue.scene === 'background'" label="显示方式" path="style">
      <n-radio-group :value="modelValue.style" @update:value="(v) => update({ style: v })">
        <n-radio-button value="cover">
          <n-tooltip trigger="hover">
            <template #trigger>
              图片填满页面
            </template>
            可能无法完整显示图片
          </n-tooltip>
        </n-radio-button>
        <n-radio-button value="contain">
          <n-tooltip trigger="hover">
            <template #trigger>
              图片完整显示
            </template>
            可能有黑边
          </n-tooltip>
        </n-radio-button>
      </n-radio-group>
    </n-form-item>
    <n-form-item label="媒体文件" path="media">
      <media-selector :type="modelValue.scene === 'se' ? 'audio' : modelValue.scene"
        :modelValue="modelValue.media" @update:model-value="(v) => update({ media: v })">
      </media-selector>
    </n-form-item>
  </n-form>
</template>
