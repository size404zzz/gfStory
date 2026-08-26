<script setup lang="ts">
import {
  NButton, NEmpty, NForm, NFormItem, NModal, NSelect, NSpace, NTag,
  type SelectOption,
} from 'naive-ui';
import { computed, ref } from 'vue';

import assetCharacterPresets from '../../assets/characters.json';
import { IMAGE_PATH_PREFIX, type GfCharactersInfo } from '../../types/assets';
import type { Character, CharacterSprite } from '../../types/character';

type PresetUpdate = {
  sprites: string[],
  characters: Character[],
};

const props = defineProps<{
  modelValue: string[],
  characters: Character[],
}>();

const emit = defineEmits<{
  update: [value: PresetUpdate],
}>();

const characterPresets = assetCharacterPresets as unknown as GfCharactersInfo;
const show = ref(false);
const pendingSprites = ref<string[]>([]);

const presetOptions = computed<SelectOption[]>(() => Object.entries(characterPresets)
  .flatMap(([character, sprites]) => Object.keys(sprites).map((sprite) => ({
    label: `${character} / ${sprite}`,
    value: `${character}/${sprite}`,
  })))
  .sort((left, right) => String(left.label).localeCompare(String(right.label))));

function open() {
  pendingSprites.value = [...props.modelValue];
  show.value = true;
}

function mergeCharacters(paths: string[]) {
  const characters = props.characters.map((character) => ({
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

function update(paths: string[]) {
  const sprites = [...new Set(paths)];
  emit('update', { sprites, characters: mergeCharacters(sprites) });
}

function apply() {
  update(pendingSprites.value);
  show.value = false;
}

function remove(path: string) {
  update(props.modelValue.filter((item) => item !== path));
}
</script>

<template>
  <n-button type="primary" secondary @click="open">选择预设立绘</n-button>
  <n-space v-if="modelValue.length > 0" class="selected-sprites" wrap>
    <n-tag v-for="sprite in modelValue" :key="sprite" closable @close="remove(sprite)">
      {{ sprite }}
    </n-tag>
  </n-space>
  <n-empty v-else size="small" description="尚未选择立绘" />

  <n-modal v-model:show="show" preset="card" title="选择预设立绘" style="width: min(760px, calc(100vw - 32px))">
    <n-form label-placement="top">
      <n-form-item label="全部预设">
        <n-select v-model:value="pendingSprites" :options="presetOptions" multiple filterable
          clearable placeholder="搜索角色或立绘名称"
        />
      </n-form-item>
    </n-form>
    <template #action>
      <n-space justify="end">
        <n-button @click="show = false">取消</n-button>
        <n-button type="primary" @click="apply">应用立绘</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<style scoped>
.selected-sprites {
  margin-top: 14px;
}
</style>
