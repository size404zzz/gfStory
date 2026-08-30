<script setup lang="ts">
import type { SelectLine, TextLine } from '@brocatel/mdc';
import {
  computed, onUnmounted, ref, watch,
} from 'vue';
import {
  HistoryFilled, MenuFilled, PlayArrowFilled, TextSnippetFilled,
} from '@vicons/material';

import StoryRecorder from './StoryRecorder.vue';
import StoryScene from './StoryScene.vue';
import {
  StoryInterpreter, type HistoryLine, type SpriteImage, type Tags,
} from '../../story/interpreter';
import type { StoryPlaybackController } from '../../story/recorder';

const props = defineProps<{
  chunk?: string,

  loading?: boolean,
  menuButton?: boolean,
  textButton?: boolean,

  /** 是否提供「录制」按钮。注意 Vue 会把未传入的 Boolean prop 转成 false，所以这里用反向开关（默认显示）。 */
  hideRecordButton?: boolean,

  /** 挂载后直接弹出录制设置（编辑器的「录制视频」入口用）。 */
  autoRecord?: boolean,
}>();

// eslint-disable-next-line no-spaced-func
const emit = defineEmits<{
  (event: 'menu'): void,
  (event: 'text'): void,
}>();

const story = new StoryInterpreter();
let backgroundMusic: HTMLAudioElement | null = null;
const background = ref('');
const classes = ref<string[]>([]);
const style = ref<string>('cover');
const narrator = ref('');
const narratorColor = ref('');
const narratorHtml = computed(() => `<span style="color: ${narratorColor.value}">${narrator.value}</span>`);
const sprites = ref<SpriteImage[]>([]);
const remote = ref<Set<string>>(new Set<string>());
// 说话的立绘：名称与旁白一致的台上角色；其余立绘在渲染时套暗影模板。
const speaker = computed(() => {
  if (narrator.value === '') return '';
  const match = sprites.value.find((sprite) => sprite.id.split('/')[0] === narrator.value);
  return match?.id ?? '';
});
const text = ref('');
const ended = ref(false);
const auto = ref(false);
const autoSpeed = ref(1);
const storyLoaded = ref(false);
const recordingActive = ref(false);
const options = ref<SelectLine['select']>([]);
const history: HistoryLine[] = [];

function toText(s: string) {
  return s.trim().replace(/\\/g, '');
}

const showingHistory = ref<HistoryLine[]>();
function showHistory() {
  showingHistory.value = history;
}

function updateClasses(classString: string) {
  const classUpdates = classString.split(' ').map((s) => s.trim()).filter((s) => s !== '');
  const newClasses = classes.value.concat(classUpdates.filter((s) => !s.startsWith('!')));
  classUpdates.filter((s) => s.startsWith('!')).forEach((s) => {
    const name = s.substring(1);
    let i = newClasses.indexOf(name);
    while (i !== -1) {
      newClasses.splice(i, 1);
      i = newClasses.indexOf(name);
    }
  });
  classes.value = newClasses;
}

function updateAudio(audio: string) {
  if (backgroundMusic !== null) {
    backgroundMusic.pause();
    backgroundMusic = null;
  }
  if (audio !== '') {
    backgroundMusic = new Audio(audio);
    backgroundMusic.loop = true;
    try {
      backgroundMusic.play();
    } catch (_) { /* empty */ }
  }
}

function playAudio(audio: string) {
  const sePlayer = new Audio(audio);
  sePlayer.loop = false;
  try {
    sePlayer.play();
  } catch (_) { /* empty */ }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let autoHandle: any = 0;
function scheduleAuto() {
  if (autoHandle !== 0) {
    clearTimeout(autoHandle);
    autoHandle = 0;
  }
  if (auto.value) {
    // updateLine / scheduleAuto / nextLine 之间是循环调用，函数声明提升保证了运行顺序。
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    autoHandle = setTimeout(nextLine, (text.value.length / 20) * (5000 / autoSpeed.value));
  }
}
watch(auto, scheduleAuto);

let lastLineHtml: string | null = null;

function updateLine(line: string, tags: Tags) {
  narrator.value = toText(tags.narrator ?? '');
  const color = (tags.color ?? '').replace('\\', '');
  narratorColor.value = color;
  if (tags.sprites !== undefined) {
    sprites.value = tags.sprites.split('|').map(toText)
      .map((s) => {
        const [name, n, effects] = s.split('/');
        const image = s === '' ? null : story.getImage(`${name}/${n}`);
        if (!effects || effects === '') {
          return image;
        }
        return {
          ...image,
          effects: effects.split(','),
        };
      })
      .filter((s) => s) as SpriteImage[];
  }
  if (tags.remote !== undefined) {
    remote.value = new Set(tags.remote.split('|').map(toText));
  }
  // 与上一行内容完全相同（比如连续空行）时文字动画不会重新播放，
  // animation-finished 不会触发，自动播放要在这里自己接上，否则会卡住。
  if (auto.value && line === lastLineHtml) {
    scheduleAuto();
  }
  lastLineHtml = line;
  text.value = line;
  history.push({
    narrator: narrator.value,
    narratorColor: color,
    line,
  });
}

function nextLine(option?: number) {
  if (showingHistory.value) {
    showingHistory.value = undefined;
    return;
  }
  if (option === undefined && options.value.length > 0) {
    return;
  }

  let l = story.next(option);
  while (l) {
    if ((l as SelectLine).select) {
      const line = l as SelectLine;
      options.value = line.select;
      return;
    }
    options.value = [];

    const line = l as TextLine;
    const tags = line.tags as Tags;
    if (tags.classes) {
      updateClasses(tags.classes);
    }

    if (tags.background !== undefined) {
      background.value = toText(line.text);
      const display = tags.background.trim();
      style.value = display;
    } else if (tags.se !== undefined) {
      playAudio(toText(line.text));
    } else if (tags.audio !== undefined) {
      updateAudio(toText(line.text));
    } else {
      updateLine(line.text, tags);
      return;
    }
    l = story.next();
  }
  text.value = '<i>故事结束</i>';
  ended.value = true;
}

async function getGlobalStory() {
  const script = document.head.querySelector('script[type="application/lua"]');
  return script?.innerHTML ?? await fetch('./sample.lua').then((res) => res.text()) ?? '';
}

const preloading = ref(false);
async function updateStory(chunk?: string, holdLine: boolean = false) {
  const s = chunk ?? await getGlobalStory();
  if (s.trim() === '') {
    return;
  }
  preloading.value = true;
  background.value = '';
  style.value = 'cover';
  classes.value = [];
  sprites.value = [];
  remote.value = new Set();
  narrator.value = '';
  narratorColor.value = '';
  text.value = '';
  ended.value = false;
  options.value = [];
  backgroundMusic?.pause();
  backgroundMusic = null;
  history.splice(0);
  lastLineHtml = null;
  await story.reload(s);
  preloading.value = false;
  storyLoaded.value = true;
  auto.value = false;
  // autoSpeed.value = 1; // Do not reset autoSpeed
  // holdLine 为 true 时先不出第一行，等录制正式开始后再播放。
  if (!holdLine) {
    nextLine();
  }
}
updateStory(props.chunk);
watch(() => props.chunk, (chunk) => updateStory(chunk));

const recorderController: StoryPlaybackController = {
  get ready() {
    return storyLoaded.value && !preloading.value;
  },
  async restart(hold: boolean) {
    await updateStory(props.chunk, hold);
  },
  play(speed: number) {
    autoSpeed.value = speed;
    auto.value = true;
    nextLine();
  },
  get ended() {
    return ended.value;
  },
  get optionsCount() {
    return options.value.length;
  },
  choose(index: number) {
    const option = options.value[index];
    if (option) {
      nextLine(option.key);
    }
  },
};

/** 录制期间屏蔽一切手动操作，避免打断自动播放。 */
function guardInteraction(event: Event) {
  if (!recordingActive.value) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}

onUnmounted(() => {
  backgroundMusic?.pause();
  backgroundMusic = null;
});
</script>

<template>
  <div class="teller-root" :class="{ 'recording-theater': recordingActive }"
    @click.capture="guardInteraction"
  >
    <story-scene
      :background-url="background"
      :background-style="style"
      :classes="classes"
      :narrator-html="narratorHtml"
      :sprites="sprites"
      :remote="remote"
      :speaker="speaker"
      :text-html="text"
      :pop-char-animation-interval="auto ? 42 / autoSpeed : 42"
      :options="options"
      :hide-controls="recordingActive"
      @click="() => { auto = false; nextLine(); }"
      @choose="(v) => nextLine(v)"
      @animation-finished="scheduleAuto"
      :loading="loading || preloading"
      :history="showingHistory"
      :text-height="showingHistory ? 'calc(100vh - 6em - 24px)' : undefined"
    >
      <button v-if="menuButton" @click="emit('menu')">
        <menu-filled></menu-filled><span>菜单</span>
      </button>
      <button v-if="textButton" @click="emit('text')">
        <text-snippet-filled></text-snippet-filled><span>文本</span>
      </button>
      <button @click="showHistory">
        <history-filled></history-filled><span>回放</span>
      </button>
      <button v-if="!ended" @click="auto = !auto" :class="{ toggled: auto }">
        <play-arrow-filled></play-arrow-filled><span>自动</span>
      </button>
      <div class="auto-speed">
        <span v-if="auto">{{ autoSpeed }}</span>
        <input v-if="auto" type="range" min="1" max="10" v-model="autoSpeed" />
      </div>
      <story-recorder
        v-if="!hideRecordButton"
        :controller="recorderController"
        :auto-open="autoRecord"
        @active="recordingActive = $event"
      />
    </story-scene>
  </div>
</template>

<style>
.teller-root {
  width: 100%;
  height: 100%;
}

/* 录制时的「剧院模式」：黑底居中一个 16:9 舞台，让导出的视频比例规整。 */
.teller-root.recording-theater {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
}

.teller-root.recording-theater > .story-background {
  width: min(100vw, calc(100vh * 16 / 9));
  height: min(100vh, calc(100vw * 9 / 16));
}

.auto-speed {
  margin-left: 1em;
  position: relative;
  height: 45px;
  width: 90px;
  color: white;
  display: flex;
  align-items: center;
  opacity: 0.7;
}
.auto-speed > span::before {
  content: "X";
  transform: scaleX(0.8);
  display: inline-block;
}
.auto-speed > span {
  position: absolute;
  font-size: small;
  left: 0;
  top: -0.5em;
}
.auto-speed > input {
  margin: 0;
}
</style>

<style scoped>
/* https://css-tricks.com/styling-cross-browser-compatible-range-inputs-css/ */
input[type=range] {
  -webkit-appearance: none; /* Hides the slider so that custom slider can be made */
  appearance: none;
  width: 100%; /* Specific width is required for Firefox. */
  background: transparent; /* Otherwise white in Chrome */
}

input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
}

input[type=range]:focus {
  /* Removes the blue border.
   * You should probably do some kind of focus styling for accessibility reasons though.
   */
  outline: none;
}

input[type=range]::-ms-track {
  width: 100%;
  cursor: pointer;

  /* Hides the slider so custom styles can be added */
  background: transparent;
  border-color: transparent;
  color: transparent;
}

/* Special styling for WebKit/Blink */
input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
  border: 1px solid #000000;
  height: 18px;
  width: 12px;
  border-radius: 2px;
  background: #ffffff;
  cursor: pointer;
  /* You need to specify a margin in Chrome, but in Firefox and IE it is automatic */
  margin-top: -14px;
  box-shadow: 1px 1px 1px #000000, 0px 0px 1px #0d0d0d; /* Add cool effects to your sliders! */
}

/* All the same stuff for Firefox */
input[type=range]::-moz-range-thumb {
  box-shadow: 1px 1px 1px #000000, 0px 0px 1px #0d0d0d;
  border: 1px solid #000000;
  height: 18px;
  width: 12px;
  border-radius: 3px;
  background: #ffffff;
  cursor: pointer;
}

/* All the same stuff for IE */
input[type=range]::-ms-thumb {
  box-shadow: 1px 1px 1px #000000, 0px 0px 1px #0d0d0d;
  border: 1px solid #000000;
  height: 18px;
  width: 12px;
  border-radius: 3px;
  background: #ffffff;
  cursor: pointer;
}

input[type=range]::-webkit-slider-runnable-track {
  width: 100%;
  height: 4px;
  cursor: pointer;
  border-radius: 1.3px;
  border: 0.2px solid white;
}

input[type=range]::-moz-range-track {
  width: 100%;
  height: 3px;
  cursor: pointer;
  border-radius: 1.3px;
  border: 0.2px solid white;
}

input[type=range]::-ms-track {
  width: 100%;
  height: 8.4px;
  cursor: pointer;
  background: transparent;
  border-color: transparent;
  border-width: 16px 0;
  color: transparent;
}
input[type=range]::-ms-fill-lower {
  border: 0.2px solid white;
  border-radius: 2.6px;
}
input[type=range]::-ms-fill-upper {
  border: 0.2px solid white;
  border-radius: 2.6px;
}
</style>
