# gfStory 解包与 Cloudflare Workers 发布

本项目不会把游戏资源直接提交到 Git。资源体积很大，而且资源来自独立的数据仓库，因此发布工作由 GitHub Actions 在 Ubuntu Runner 上完成：下载资源、解包、生成索引、构建 Vite 网站，最后使用 Wrangler 上传到 Cloudflare Worker 的 Static Assets。

## 一次性准备

### 1. Fork 并确认默认分支

Fork [gudzpoz/gfStory](https://github.com/gudzpoz/gfStory)，把本仓库的默认分支设为 `main`。本项目的子模块是：

- `unpack/downloader`：资源下载器
- `unpack/gf-data-ch`：资源索引

GitHub Actions 会使用递归子模块检出，因此不需要把这些大文件复制到自己的仓库。

### 2. 创建 Cloudflare Worker 项目

在 Cloudflare 控制台的 Workers & Pages 中创建一个 Worker，项目名使用 `gfstory`。选择上传静态文件或 Hello World 都可以，初始内容会被 GitHub Actions 的正式构建覆盖。

也可以在本机登录 Wrangler 后手动发布已经生成的 `dist`：

```text
npx wrangler login
npx wrangler deploy
```

如果项目名不是 `gfstory`，需要同步修改 `wrangler.toml` 中的 `name`。

如果该 Worker 已经连接了 Cloudflare 的 Git 自动构建，请关闭或断开这条自动构建。它只会执行 `npx wrangler deploy`，不会运行本项目所需的资源解包流程；正式发布由本仓库的 GitHub Actions 完成。

### 3. 创建 Cloudflare API Token

在 Cloudflare 创建一个只用于部署的 API Token：

- 权限：Account / Workers Scripts / Edit
- Account Resources：只选择实际部署的账号
- 不要把 Token 写进代码或提交到 Git

同时准备 Cloudflare Account ID。它可以在 Cloudflare 账号首页或控制台 URL 中找到。

### 4. 写入 GitHub Secrets

进入仓库的 `Settings -> Secrets and variables -> Actions`，新建以下两个 Repository secrets：

| Secret | 值 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 上一步创建的 API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |

## 发布流程

日常发布：提交并推送到 `main`，`Deploy Editor From Cached Resources` 会自动用
Actions 缓存里的资源完成构建和发布（只装 Node 依赖、跑构建，不解包资源，速度很快）。

需要重建资源缓存时（首次部署、游戏资源大版本更新、解包脚本变化），在 GitHub 的
`Actions -> Build Documentation -> Run workflow` 手动运行全量构建。它会重新下载并
解包资源、刷新缓存，之后日常推送继续走快速通道。

全量构建工作流会依次完成：

1. 检出两个资源子模块。
2. 安装 Python、Unity 解包器、ffmpeg、pngquant 和 vgmstream。
3. 下载资源到 `unpack/downloader/output`。
4. 从资源中生成 `public/images`、`public/audio`、`public/stories`。
5. 生成 `src/assets/*.json` 资源索引。
6. 生成 Pagefind 搜索索引并执行 Vite 构建。
7. 检查 `dist` 中的入口页面和资源目录。
8. 使用 Wrangler 发布到 Cloudflare Worker `gfstory`。

第一次运行可能较慢，因为需要下载完整资源并建立 GitHub Actions 缓存。后续运行会复用缓存；资源索引或解包代码变化时，缓存键会自动变化，避免使用旧资源。

## 验收清单

部署成功后打开 Worker 地址：

- `https://gfstory.<你的账号子域>.workers.dev/`：编辑器
- `https://gfstory.<你的账号子域>.workers.dev/simulator.html`：剧情模拟器
- `https://gfstory.<你的账号子域>.workers.dev/viewer.html`：单文件阅读器入口

编辑器验收：

1. 点击“自动解析剧本”。
2. 粘贴剧本文本并打开解析预览。
3. 确认节点、对白、场景、选项和警告统计合理。
4. 选择替换或追加，确认原有场景 UI 样式和节点编辑行为没有改变。
5. 导出并在模拟器中打开，确认背景、立绘、BGM 和选项仍能正常工作。

发布日志中至少应看到 `Validate generated resources`、`Validate site output` 和 `Publish to Cloudflare Worker` 三步成功。

## 本机开发说明

完整资源解包依赖 Linux 工具链，推荐把完整构建交给 GitHub Actions。本机只做编辑器和解析器开发时，可以使用已有的 Node 依赖运行：

```text
pnpm exec vitest run test/script-parser.test.ts
```

如果需要在本机生成完整站点，必须先初始化子模块，并安装 Python 3.11+、uv、ImageMagick、pngquant、ffmpeg 和 vgmstream-cli；具体解包命令以 `.github/workflows/build.yml` 为准。

## 大资源的托管方式

资源最终会被复制到 Vite 的 `dist/audio`、`dist/images` 和 `dist/stories`，由 Cloudflare Worker Static Assets 作为静态文件托管并通过 Cloudflare CDN 分发。GitHub 仓库只保存解包程序和索引，不保存这些生成物。

如果将来出现单个文件超过 Cloudflare Worker Static Assets 的文件大小限制，或需要独立更新资源而不重新构建网站，再把对应资源迁移到 Cloudflare R2，并在应用中改为读取 R2 的公开 URL；当前原项目的发布链路没有使用 R2。
