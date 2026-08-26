<script setup lang="ts">
import {
  NColorPicker, NForm, NFormItem, NFormItemRow, NSelect, NSpace,
} from 'naive-ui';
import { computed, inject, type Ref } from 'vue';

import CharacterListSelector from '../character/CharacterListSelector.vue';
import InlineCharacterCreate from '../character/InlineCharacterCreate.vue';
import InlineCharacterPreset from '../character/InlineCharacterPreset.vue';
import ClassicEditor from './editor';
import { type TextLine } from '../../types/lines';
import type { Character } from '../../types/character';

const props = defineProps<{
  modelValue: TextLine,
}>();
const characters = inject<Ref<Character[]>>('characters')!;
const characterStore = inject<Ref<Character[]>>('characterStore')!;
const narrators = inject<Ref<{ value: string }[]>>('narrators')!;

const emit = defineEmits<{
  'update:modelValue': [value: TextLine],
}>();

const color = computed(() => props.modelValue.narratorColor);

function update(patch: Partial<TextLine>) {
  emit('update:modelValue', { ...props.modelValue, ...patch });
}

function updateRemote(path: string, value: boolean) {
  update({ remote: { ...props.modelValue.remote, [path]: value } });
}

function updateCharacters(value: Character[]) {
  characterStore.value = value;
}

function updateSprites(sprites: string[]) {
  update({ sprites });
}

function updateColor(value: string) {
  update({ narratorColor: value });
}
</script>

<template>
  <n-form inline :modelValue="modelValue" style="flex-wrap: wrap">
    <n-form-item-row label="立绘" path="tachie">
      <n-space vertical>
        <n-space align="center">
          <character-list-selector :characters="characters" :modelValue="modelValue.sprites"
            :remote="modelValue.remote"
            @update:modelValue="updateSprites" @update:remote="updateRemote"
          />
          <inline-character-preset :characters="characterStore"
            :modelValue="modelValue.sprites"
            @update:modelValue="updateSprites" @update:remote="updateRemote"
            @update:characters="updateCharacters"
          />
          <inline-character-create :characters="characterStore"
            :modelValue="modelValue.sprites"
            @update:modelValue="updateSprites" @update:remote="updateRemote"
            @update:characters="updateCharacters"
          />
        </n-space>
      </n-space>
    </n-form-item-row>
    <n-form-item label="名称显示" path="narrator" class="narrator">
      <n-select
        :value="modelValue.narrator"
        @update:value="(v) => update({ narrator: v ?? '' })"
        :style="{ '--narrator-text-color': color }"
        :options="narrators"
        clearable
        filterable
        tag
      ></n-select>
    </n-form-item>
    <n-form-item label="名称颜色" path="narratorColor">
      <n-color-picker
        :value="modelValue.narratorColor"
        :modes="['hex']"
        @update:value="updateColor"
      ></n-color-picker>
    </n-form-item>
    <n-form-item class="n-ck-editor" label="文字内容">
      <ckeditor :editor="ClassicEditor"
        :modelValue="modelValue.text"
        @update:modelValue="(v) => update({ text: v })"
      ></ckeditor>
    </n-form-item>
  </n-form>
</template>

<style>
@import './editor.css';

.n-form {
  flex-wrap: wrap;
}
.n-ck-editor {
  flex-basis: 100%;
}
.n-ck-editor .ck-editor {
  max-width: 100%;
  width: 100%;
}

.n-form .narrator .n-base-selection .n-base-selection-label .n-base-selection-overlay {
  color: var(--narrator-text-color, var(--n-text-color));
}
</style>
