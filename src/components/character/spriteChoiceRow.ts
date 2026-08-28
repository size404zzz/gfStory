import { NPopover } from 'naive-ui';
import { h, shallowRef, type CSSProperties } from 'vue';

import { db, isMediaUrl } from '../../db/media';

/** 级联行高固定 34px，缩略图尺寸必须自己收敛，否则内容会溢出压到相邻行。 */
const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minWidth: '0',
  lineHeight: 'normal',
};

const thumbStyle: CSSProperties = {
  flex: '0 0 auto',
  width: '24px',
  height: '24px',
  objectFit: 'contain',
};

const previewStyle: CSSProperties = {
  display: 'block',
  width: '160px',
  maxHeight: '280px',
  objectFit: 'contain',
};

const labelStyle: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const resolvedUrls = shallowRef<Record<string, string>>({});
const resolving = new Set<string>();

/** 数据库里的立绘是 `sprite:名称`，必须先解析成可用的地址；解析期间留一个占位，行高才不会跳。 */
function resolveSrc(url: string) {
  if (!isMediaUrl(url) || /^(data|blob):/i.test(url)) return url;
  const cached = resolvedUrls.value[url];
  if (cached === undefined && !resolving.has(url)) {
    resolving.add(url);
    db.toDataUrl(url).then((value) => {
      resolving.delete(url);
      resolvedUrls.value = { ...resolvedUrls.value, [url]: value };
    });
  }
  return cached ?? '';
}

export interface SpriteChoiceRow {
  label: string,
  /** 立绘地址，可为 `/images/...`、data/blob 地址或数据库的 `sprite:名称`。 */
  url: string,
  /** 只有叶子行才用浮层放大预览，父节点右侧正是展开中的立绘列。 */
  leaf: boolean,
}

/** 立绘级联选择器的行渲染：单行不换行的「缩略图 + 名称」，悬停叶子行放大预览。 */
export function renderSpriteChoiceRow(option: SpriteChoiceRow) {
  const src = resolveSrc(option.url);
  const thumb = src
    ? h('img', {
      src,
      alt: '',
      loading: 'lazy',
      style: thumbStyle,
    })
    : h('span', { style: thumbStyle });
  return h('span', { style: rowStyle }, [
    option.leaf && src ? h(NPopover, {
      trigger: 'hover',
      placement: 'right',
      showArrow: false,
      delay: 200,
      style: { padding: '4px' },
    }, {
      default: () => h('img', {
        src,
        alt: '',
        style: previewStyle,
      }),
      trigger: () => thumb,
    }) : thumb,
    h('span', { title: option.label, style: labelStyle }, option.label),
  ]);
}
