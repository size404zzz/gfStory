<script setup lang="ts">
import {
  NButton, NForm, NFormItem, NIcon, NModal, NSelect, NSpace, NTag,
} from 'naive-ui';
import { ImportContactsFilled } from '@vicons/material';
import {
  computed, ref, watch,
} from 'vue';

import MediaItem from '../media/MediaItem.vue';
import {
  IMAGE_PATH_PREFIX, type GfCharactersInfo, type GfSpriteInfo,
} from '../../types/assets';
import { getUniqueName, type Character, type CharacterSprite } from '../../types/character';

import assetCharacterPresets from '../../assets/characters.json';

const props = defineProps<{
  characters: Character[],
  modelValue: string[],
  remote: Record<string, boolean>,
}>();

const characterPresets = assetCharacterPresets as unknown as GfCharactersInfo;
const show = ref(false);
const selectedCharacter = ref<string | null>(null);
const selectedSprite = ref<string | null>(null);

const characterOptions = computed(() => Object.keys(characterPresets)
  .sort((left, right) => left.localeCompare(right))
  .map((name) => ({ label: name, value: name })));

const spriteOptions = computed(() => {
  if (!selectedCharacter.value) return [];
  return Object.keys(characterPresets[selectedCharacter.value] ?? {})
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({ label: name, value: name }));
});

const selectedPreset = computed<GfSpriteInfo | null>(() => {
  if (!selectedCharacter.value || !selectedSprite.value) return null;
  return characterPresets[selectedCharacter.value]?.[selectedSprite.value] ?? null;
});

const previewUrl = computed(() => (
  selectedPreset.value ? `${IMAGE_PATH_PREFIX}${selectedPreset.value.path}` : ''
));

const canAdd = computed(() => selectedCharacter.value !== null && selectedSprite.value !== null
  && selectedPreset.value !== null);

watch(selectedCharacter, () => {
  selectedSprite.value = null;
});

function reset() {
  selectedCharacter.value = null;
  selectedSprite.value = null;
}

function addPreset() {
  const characterName = selectedCharacter.value;
  const spriteName = selectedSprite.value;
  const preset = selectedPreset.value;
  if (!characterName || !spriteName || !preset) return;

  let character = props.characters.find((item) => item.name === characterName);
  if (!character) {
    character = {
      id: '',
      name: characterName,
      imported: true,
      sprites: [],
    };
    props.characters.push(character);
  }

  const expectedUrl = `${IMAGE_PATH_PREFIX}${preset.path}`;
  let sprite = character.sprites.find((item) => item.name === spriteName);
  if (!sprite || sprite.url !== expectedUrl) {
    const name = sprite
      ? (getUniqueName(spriteName, character.sprites, 0) ?? spriteName)
      : spriteName;
    sprite = {
      id: '',
      name,
      url: expectedUrl,
      center: [-1, -1],
      scale: preset.scale,
    } satisfies CharacterSprite;
    character.sprites.push(sprite);
  }

  const path = `${character.name}/${sprite.name}`;
  if (!props.modelValue.includes(path)) props.modelValue.push(path);
  if (props.remote[path] === undefined) props.remote[path] = false;
  show.value = false;
  reset();
}
</script>

<template>
  <n-button size="small" secondary type="info" @click="show = true">
    <n-icon><import-contacts-filled /></n-icon>
    使用预设立绘
  </n-button>
  <n-modal v-model:show="show" preset="card" title="从预设资源添加立绘" style="max-width: 600px"
    @after-leave="reset"
  >
    <n-form label-placement="left" label-width="76">
      <n-form-item label="角色">
        <n-select v-model:value="selectedCharacter" :options="characterOptions" filterable
          placeholder="选择角色"
        />
      </n-form-item>
      <n-form-item label="立绘">
        <n-select v-model:value="selectedSprite" :options="spriteOptions" filterable
          :disabled="selectedCharacter === null" placeholder="选择立绘"
        />
      </n-form-item>
      <n-form-item v-if="selectedPreset" label="预览">
        <n-space align="center">
          <media-item :url="previewUrl" />
          <n-tag>{{ selectedPreset.path }}</n-tag>
        </n-space>
      </n-form-item>
    </n-form>
    <template #action>
      <n-space justify="end">
        <n-button @click="show = false">取消</n-button>
        <n-button type="primary" :disabled="!canAdd" @click="addPreset">添加到当前节点</n-button>
      </n-space>
    </template>
  </n-modal>
</template>
