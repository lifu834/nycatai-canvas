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

## nycatai 专属文件（无冲突面）

- `web/src/lib/nycatai/catalog.ts` — 三分组模型目录 + 价格元数据；video 列表 provisional，P1 用真实 key 校准。
- `web/src/lib/nycatai/bootstrap.ts` — hash/query 注入 → 三个 `nycatai-` 受管渠道；只动受管渠道，保留用户自建渠道与 per-model 脚本。

## 部署约定

- CF Pages 项目 `nycatai-canvas` → canvas.nycatai.com；浏览器直连灰云网关，**绝不走 Pages 同源代理**（CF 100s → 524，studio2 教训）。
- 生产构建不设 `VITE_ALLOW_PLUGIN_URL_INSTALL`。
- 上游许可 MIT；页面保留 infinite-canvas 署名，改品牌前已知会原作者（1844025705@qq.com）。

## 分支模型

`main` = 上游 main（当前锚 v0.15.1）+ 我方提交。合并上游：`git fetch upstream --tags && git merge vX.Y.Z`，回归上表触点 + 冒烟（`#apiKey=` 注入、生图、视频、插件弹窗）。
