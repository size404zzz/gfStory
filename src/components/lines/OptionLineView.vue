<script setup lang="ts">
import { NDynamicInput, NForm, NFormItem } from 'naive-ui';

import type { OptionLine } from '../../types/lines';

const props = defineProps<{
  modelValue: OptionLine,
}>();

const emit = defineEmits<{
  'update:modelValue': [value: OptionLine],
}>();

function updateOptions(value: unknown[]) {
  emit('update:modelValue', {
    ...props.modelValue,
    options: value.filter((option): option is OptionLine['options'][number] => (
      typeof option === 'object' && option !== null
      && 'key' in option && 'value' in option
      && typeof option.key === 'string' && typeof option.value === 'string'
    )),
  });
}
</script>

<template>
  <n-form inline :modelValue="modelValue">
    <n-form-item label="选项" path="options">
      <n-dynamic-input
        :value="modelValue.options"
        @update:value="updateOptions"
        preset="pair"
        key-placeholder="选项名称"
        value-placeholder="选项标识符（暂时没用）"
      />
    </n-form-item>
  </n-form>
</template>
