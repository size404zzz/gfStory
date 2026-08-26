<script setup lang="ts">
import {
  NButton, NCard, NIcon,
  NSpace,
} from 'naive-ui';
import {
  AddFilled,
  MoveUpFilled, MoveDownFilled, RemoveFilled,
} from '@vicons/material';

import CharacterSelector from './CharacterSelector.vue';
import type { Character } from '../../types/character';

const props = defineProps<{
  modelValue: string[],
  remote: Record<string, boolean>,
  characters: Character[],
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string[]],
  'update:remote': [path: string, value: boolean],
}>();

function exchange(i: number, j: number) {
  const arr = [...props.modelValue];
  if (i >= 0 && i < j && j < arr.length) {
    const item = arr[i];
    arr[i] = arr[j];
    arr[j] = item;
    emit('update:modelValue', arr);
  }
}

function updateSelected(index: number, value: string) {
  const next = [...props.modelValue];
  next[index] = value;
  emit('update:modelValue', next);
}

function remove(index: number) {
  emit('update:modelValue', props.modelValue.filter((_value, i) => i !== index));
}

function add() {
  emit('update:modelValue', [...props.modelValue, '']);
}
</script>

<template>
  <n-card>
    <n-space vertical>
      <n-space v-for="sprite, i in modelValue" :key="`${sprite}-${i}`">
        <character-selector :modelValue="sprite" :characters="characters"
          :remoteRecord="remote" @update:modelValue="(v) => updateSelected(i, v)"
          @update:remote="(path, value) => emit('update:remote', path, value)"
        >
        </character-selector>
        <n-button @click="exchange(i - 1, i)">
          <n-icon><move-up-filled></move-up-filled></n-icon>
        </n-button>
        <n-button @click="exchange(i, i + 1)">
          <n-icon><move-down-filled></move-down-filled></n-icon>
        </n-button>
        <n-button @click="remove(i)">
          <n-icon><remove-filled></remove-filled></n-icon>
        </n-button>
      </n-space>
      <n-button @click="add">
          <n-icon><add-filled></add-filled></n-icon>
      </n-button>
    </n-space>
  </n-card>
</template>
