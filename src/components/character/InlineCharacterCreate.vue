<script setup lang="ts">
import {
  NButton, NForm, NFormItem, NInput, NModal, NSpace,
} from 'naive-ui';
import { AddFilled } from '@vicons/material';
import { computed, ref } from 'vue';

import MediaSelector from '../media/MediaSelector.vue';
import { getUniqueName, type Character } from '../../types/character';

const props = defineProps<{
  characters: Character[],
  modelValue: string[],
  remote: Record<string, boolean>,
}>();

const show = ref(false);
const characterName = ref('');
const spriteName = ref('');
const spriteUrl = ref('');
const canCreate = computed(() => (
  characterName.value.trim() !== ''
  && spriteName.value.trim() !== ''
  && spriteUrl.value.trim() !== ''
));

function reset() {
  characterName.value = '';
  spriteName.value = '';
  spriteUrl.value = '';
}

function create() {
  if (!canCreate.value) return;
  const name = getUniqueName(characterName.value.trim(), props.characters, 0)
    ?? characterName.value.trim();
  const sprite = spriteName.value.trim();
  props.characters.push({
    id: '',
    name,
    imported: false,
    sprites: [{
      id: '',
      name: sprite,
      url: spriteUrl.value,
      center: [-1, -1],
      scale: -1,
    }],
  });
  props.modelValue.push(`${name}/${sprite}`);
  props.remote[`${name}/${sprite}`] = false;
  show.value = false;
  reset();
}
</script>

<template>
  <n-button size="small" secondary type="primary" @click="show = true">
    <n-icon><add-filled /></n-icon>
    在节点中添加立绘
  </n-button>
  <n-modal v-model:show="show" preset="card" title="在当前节点添加角色立绘" style="max-width: 560px"
    @after-leave="reset"
  >
    <n-form label-placement="left" label-width="88">
      <n-form-item label="角色名称">
        <n-input v-model:value="characterName" placeholder="例如：G36" />
      </n-form-item>
      <n-form-item label="立绘名称">
        <n-input v-model:value="spriteName" placeholder="例如：默认" />
      </n-form-item>
      <n-form-item label="立绘资源">
        <media-selector v-model:modelValue="spriteUrl" type="sprite" />
      </n-form-item>
    </n-form>
    <template #action>
      <n-space justify="end">
        <n-button @click="show = false">取消</n-button>
        <n-button type="primary" :disabled="!canCreate" @click="create">添加到当前节点</n-button>
      </n-space>
    </template>
  </n-modal>
</template>
