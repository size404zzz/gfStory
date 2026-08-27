<script setup lang="ts">
import { VolumeOffFilled, VolumeUpFilled } from '@vicons/material';
import { NIcon, NTooltip } from 'naive-ui';
import {
  computed, onMounted, onUnmounted, ref, watch,
} from 'vue';

import StoryScene from '../viewer/StoryScene.vue';
import {
  playAudioPreview, stopAudioPreview, subscribeAudioPreview,
} from './audioPreview';
import type { Character, CharacterSprite } from '../../types/character';
import type { TextLine } from '../../types/lines';
import type { SpriteImage } from '../../story/interpreter';

const props = defineProps<{
  background: string,
  music: string,
  characters: Character[],
  sprites: string[],
  line?: TextLine,
}>();

const previewSprites = ref<SpriteImage[]>([]);
const playing = ref(false);
let imageRequest = 0;
let unsubscribeAudioPreview = () => {};

function selectedSprite(path: string): [string, CharacterSprite] | null {
  const separator = path.indexOf('/');
  if (separator === -1) return null;
  const name = path.substring(0, separator);
  const spriteName = path.substring(separator + 1);
  const character = props.characters.find((item) => item.name === name);
  const sprite = character?.sprites.find((item) => item.name === spriteName);
  return sprite ? [name, sprite] : null;
}

function loadSprite(name: string, sprite: CharacterSprite) {
  return new Promise<SpriteImage>((resolve) => {
    const image = new Image();
    const preview = {
      ...sprite,
      id: `${name}/${sprite.name}`,
      image,
    } as SpriteImage;
    image.onload = () => resolve(preview);
    image.onerror = () => {
      image.classList.add('failed');
      resolve(preview);
    };
    image.src = sprite.url;
  });
}

async function refreshSprites() {
  const request = imageRequest + 1;
  imageRequest = request;
  const selected = props.sprites.map(selectedSprite)
    .filter((item): item is [string, CharacterSprite] => item !== null);
  const sprites = await Promise.all(selected.map(([name, sprite]) => loadSprite(name, sprite)));
  if (request === imageRequest) previewSprites.value = sprites;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character] as string));
}

function safeColor(value?: string) {
  return /^#[\da-f]{3,8}$/i.test(value ?? '') ? value! : '#ffffff';
}

const narratorHtml = computed(() => {
  if (!props.line?.narrator) return '';
  return `<span style="color: ${safeColor(props.line.narratorColor)}">${escapeHtml(props.line.narrator)}</span>`;
});
const textHtml = computed(() => props.line?.text || '<p>在这里预览对白</p>');
const remote = computed(() => new Set(Object.entries(props.line?.remote ?? {})
  .filter(([, enabled]) => enabled)
  .map(([path]) => path)));
// 说话人立绘：显式标记优先，否则取角色名与说话人一致的立绘。
const speaker = computed(() => {
  const line = props.line;
  if (!line) return '';
  if (line.speaker) return line.speaker;
  if (!line.narrator) return '';
  return props.sprites.find((path) => path.split('/')[0] === line.narrator) ?? '';
});

function stopMusic() {
  stopAudioPreview();
}

function toggleMusic() {
  if (!props.music) return;
  if (playing.value) {
    stopMusic();
  } else {
    playAudioPreview(props.music, true);
  }
}

watch(() => [props.characters, props.sprites], refreshSprites, { deep: true, immediate: true });
watch(() => props.music, stopMusic);
onMounted(() => {
  unsubscribeAudioPreview = subscribeAudioPreview((value) => {
    playing.value = value.playing && value.loop && value.source === props.music;
  });
});
onUnmounted(() => {
  unsubscribeAudioPreview();
  stopMusic();
});
</script>

<template>
  <div class="preview-frame">
    <story-scene
      class="editor-preview"
      :background-url="background"
      background-style="cover"
      :classes="[]"
      :narrator-html="narratorHtml"
      :sprites="previewSprites"
      :remote="remote"
      :speaker="speaker"
      :text-html="textHtml"
      :options="[]"
    >
      <n-tooltip v-if="music">
        <template #trigger>
          <button type="button" :aria-label="playing ? '暂停音乐预览' : '播放音乐预览'"
            :title="playing ? '暂停音乐预览' : '播放音乐预览'" @click.stop="toggleMusic"
          >
            <n-icon size="22">
              <volume-off-filled v-if="playing" /><volume-up-filled v-else />
            </n-icon>
          </button>
        </template>
        {{ playing ? '暂停音乐预览' : '播放音乐预览' }}
      </n-tooltip>
    </story-scene>
  </div>
</template>

<style scoped>
.preview-frame {
  aspect-ratio: 16 / 9;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: #09090b;
}

.editor-preview {
  height: 100%;
}

</style>
