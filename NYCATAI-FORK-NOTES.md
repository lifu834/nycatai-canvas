# NYCATAI fork 维护笔记

薄 fork 纪律：nycatai 代码集中在 `web/src/lib/nycatai/`；上游文件触点全部登记在下表。合并上游（`git fetch upstream && git merge <tag>`）后逐项回归。

## 上游触点清单

| 文件 | 改动 | 合并时注意 |
|---|---|---|
| `web/src/components/layout/client-root-init.tsx` | useEffect 里前置调用 `applyNycataiBootstrap()`，命中即跳过上游单渠道导入 | 上游若重构 URL 参数逻辑，重点回归 |
| `web/src/hooks/use-version-check.ts` | VERSION/CHANGELOG 两个 raw URL 指向 lifu834/nycatai-canvas | 上游改 URL 结构时同步 |
| `web/index.html` | title / meta description 品牌化 | 直接保留我方版本 |
| `web/src/i18n/locales/zh-CN.ts`、`en-US.ts` | 仅 `meta.title` / `meta.description` | 冲突时保留我方两行，其余全取上游 |
| `web/src/components/canvas/canvas-plugin-manager-modal.tsx` | 第三方插件 URL 安装 Tab 由 `VITE_ALLOW_PLUGIN_URL_INSTALL` 门禁（默认关） | 上游改 Tabs 结构时重点回归 |
| `web/package.json` | 加 `test`/`deploy:pages` 脚本 + devDeps（vitest / happy-dom） | 合并时保留我方行 |
| `web/src/pages/image/index.tsx`、`video/index.tsx` | 生成按钮上方插 `<NycataiCostHint/>`（各 1 行 + import） | 上游改按钮区布局时重新挂 |
| `web/src/components/layout/app-top-nav.tsx` | 右侧动作区插 `<NycataiUsageBadge/>`；fragment 尾部挂 `<NycataiCopilot/>`（全局挂载，自身按 canvasContext+凭据决定显隐）；logo 换 mascot img | 同上 |
| `web/src/i18n/locales/zh-CN.ts`、`en-US.ts` | `meta.*` 品牌 + `nycatai.*` 键组 | 冲突时保留我方两块，其余全取上游 |
| `web/src/main.tsx` | 引入 `nycatai-theme.css`（必须在 globals.css 之后）+ 字体栈改主站同款 | 上游改字体行时保留我方 |
| `web/src/lib/app-theme.ts` | 点缀式换肤：colorPrimary/colorLink/选中态 → 陶土橙，中性色不动 | 上游重构主题结构时重新挂 |
| `web/src/components/layout/app-providers.tsx` | ProConfigProvider 换到外层（其 dark 预设会派生覆盖 colorPrimary） | 上游改 provider 链时重点回归 |
| `web/src/pages/canvas/index.tsx` | 头部插 `<NycataiTemplateGallery/>`（1 行 + import） | 上游改列表页头部时重新挂 |
| `web/src/services/api/prompt-source-presets.ts` | DEFAULT_PROMPT_SOURCES 头部加 nycatai-official 内置源（同源 /nycatai-prompts.json） | 冲突时保留我方一行 |
| `web/src/components/layout/app-config-modal.tsx` | 渠道 tab 整体替换为只读 `<NycataiChannelsPanel/>`（本站只接 nycatai，无自建渠道） | 上游改配置弹窗结构时重新挂 |
| `web/src/components/layout/client-root-init.tsx` | 整文件重写：无条件 `applyNycataiBootstrap()`，**移除上游 ?baseUrl=/?apiKey= 外部接口导入** | 合并时保留我方版本 |

## nycatai 专属文件（无冲突面）

- `web/src/lib/nycatai/catalog.ts` — 三分组模型目录 + 价格元数据；video 列表 provisional，P1 用真实 key 校准。
- `web/src/lib/nycatai/bootstrap.ts` — hash/query 注入 → 三个 `nycatai-` 受管渠道；只动受管渠道，保留用户自建渠道与 per-model 脚本。**规则：query 里出现 `baseUrl` 时让给上游导入逻辑，不劫持。**
- `web/src/lib/nycatai/bootstrap.test.ts` + `web/vitest.config.ts` — 单测（`bun run test` / `node node_modules/vitest/vitest.mjs run`）；合并上游后必跑。

## 只接 NYCATAI（260824 定稿）

- 渠道表在**启动时无条件规整**为 4 个受管渠道（`image`/`overseas`/`video`/`codex`），外部/自建渠道一律移除；上游 `?baseUrl=` 外部导入路径已废除，hash/query 里的 `baseUrl` 会被抹掉。
- 配置弹窗的「渠道」tab = 只读面板（模型清单 + 真实单价 + 锁图标），没有新建/编辑/删除入口。
- 目录数据源 = 生产 `abilities` + `ModelPrice`（见 nycatai-ops 校准包）；**`/v1/models` 不是可路由性的真相**（nano-banana-pro-2k/-4k 不在列表却能路由），判可路由用 `canvas-catalog-check.py` 的下单探测。

## 已知限制

- 网关 CORS 只放行 `*.nycatai.com` 源：**本地 dev（localhost 源）无法直连网关**，生图/视频/余额请求会被拒；顶栏消耗徽标此时显示"消耗查询失败"（优雅降级已验证）。全链路验证在生产域名（或加 hosts 映射）做。
- 创意工坊令牌是 unlimited_quota，new-api subscription 端点对其返回占位大数 → 拿不到真实余额，顶栏展示「该密钥已消耗」（GetUsage）。用户级余额需 new-api 侧新端点，列为后续项。

## 本机工具链备注

- 本机 node v22 跑 `vite build` 会间歇性 Segmentation fault（esbuild service 被杀，与源码无关）；`bun node_modules/vite/bin/vite.js build` 稳定。构建/部署遇 139 退出码换 bun 跑。

## 部署约定

- ✅已上线 https://canvas.nycatai.com（CF Pages 项目 `nycatai-canvas`；DNS: CNAME canvas → nycatai-canvas.pages.dev, proxied=true，与 studio 同款）。
- 部署命令：`cd web && bun node_modules/vite/bin/vite.js build && bunx wrangler pages deploy dist --project-name nycatai-canvas --branch main --commit-dirty=true`（wrangler 无 `pages domain` 子命令，自定义域用 CF API 加，见 configs/.cf-pages.env 与 .cf-lb.env）。
- 浏览器直连灰云网关，**绝不走 Pages 同源代理**（CF 100s → 524，studio2 教训）。
- 生产构建不设 `VITE_ALLOW_PLUGIN_URL_INSTALL`。
- 上游许可 MIT；页面保留 infinite-canvas 署名，改品牌前已知会原作者（1844025705@qq.com）。

## 分支模型

`main` = 上游 main（当前锚 v0.15.1）+ 我方提交。合并上游：`git fetch upstream --tags && git merge vX.Y.Z`，回归上表触点 + 冒烟（`#apiKey=` 注入、生图、视频、插件弹窗）。
