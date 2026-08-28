<script setup lang="ts">
import {
  NCascader, NCheckbox, type CascaderOption,
} from 'naive-ui';
import { computed } from 'vue';

import MediaItem from '../media/MediaItem.vue';
import { renderSpriteChoiceRow } from './spriteChoiceRow';
import {
  getNamePath, getSprite,
  type Character, type CharacterSprite,
  type NamePath, type SpritePath,
} from '../../types/character';

const props = defineProps<{
  modelValue: string,
  remoteRecord: Record<string, boolean>,
  characters: Character[],
}>();
const namePath = computed(() => props.modelValue.split('/'));
const id = computed(() => (getSprite(
  namePath.value as [string, string],
  props.characters,
) as CharacterSprite)?.id);

function renderLabel(o: CascaderOption) {
  const option = o as unknown as Character | CharacterSprite;
  const leaf = !!(option as CharacterSprite).url;
  const sprite = leaf ? option as CharacterSprite : (option as Character).sprites[0];
  if (!sprite) {
    return option.name;
  }
  return renderSpriteChoiceRow({
    label: option.name,
    url: sprite.url,
    leaf,
  });
}

const emit = defineEmits<{
  'update:modelValue': [modelValue: string],
  'update:remote': [path: string, value: boolean],
}>();

const remote = computed(() => !!props.remoteRecord[props.modelValue]);
function updateSelected(_v: never, _option: never, path: SpritePath) {
  emit('update:modelValue', getNamePath(path).join('/'));
}
function updateRemote(r: boolean) {
  emit('update:remote', namePath.value.join('/'), r);
}
const url = computed(() => {
  if (namePath.value.length !== 2) {
    return '';
  }
  return getSprite(namePath.value as unknown as NamePath, props.characters)?.url ?? '';
});
</script>

<template>
  <n-space align="center">
    <media-item :url="url"></media-item>
    <n-cascader
      :options="(characters as unknown as CascaderOption[])"
      :value="id"
      @update:value="updateSelected"
      label-field="name"
      value-field="id"
      children-field="sprites"
      check-strategy="child"
      expand-trigger="hover"
      filterable
      :render-label="renderLabel"
    >
    </n-cascader>
    <n-checkbox :checked="remote" @update:checked="updateRemote">
      电子外观
    </n-checkbox>
  </n-space>
</template>
