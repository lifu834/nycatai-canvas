import type { ModelCapability } from "@/stores/use-config-store";

// NYCATAI 模型目录：人工策划，不依赖 /v1/models 猜能力（上游按模型名关键词猜，会把我们的命名猜错）。
// 🔑 价格单位是**人民币**：平台名义的 "$" 额度实为 ¥（见 memory pricing-margin-redline）。
// 🔑 按秒/按次的区分**接口拿不到**（/api/pricing 的 quota_type=1 两者都用），只能人工标注：
//    kling/veo/sd 系按秒；seedance-2.0、minimax-h3-2k 按次固定价。
export type NycataiGroup = "image" | "overseas" | "video" | "codex";

export type NycataiModelDef = {
    name: string;
    capability: ModelCapability;
    /** 展示用预估单价（P3 成本透明消费此字段），单位人民币 */
    price?: { amount: number; per: "second" | "image" | "call" };
    /** true = 型号名/价格未经网关实测校准 */
    provisional?: boolean;
};

export type NycataiGroupDef = {
    /** 同时是渠道 id 后缀与网关路径前缀（保持 id ≡ 路径，避免错位） */
    group: NycataiGroup;
    channelName: string;
    models: NycataiModelDef[];
    /** encodeChannelModel 后作为该能力的默认模型；同一 capability 只允许一个分组设置 */
    defaultModel?: string;
};

export const DEFAULT_GATEWAY = "https://api.nycatai.com";
export const NYCATAI_CHANNEL_PREFIX = "nycatai-";

// 260824 用真实 key 对 /{group}/v1/models（可路由）× /api/pricing（真实售价）双向校准。
// 策展原则：只收后端**当前可路由**的模型；排除 ex- 兜底别名与 codex 组里混入的图像模型。
// ⚠️ 后端模型会漂移（260813→260824 就有 7 个视频模型改名/下架），合并上游或例行体检时用
//    scripts/canvas-catalog-check.py 复核。
export const NYCATAI_GROUPS: NycataiGroupDef[] = [
    {
        group: "image",
        channelName: "NYCATAI 生图",
        defaultModel: "nano-banana-2",
        models: [
            // gpt-image-2 走 tiered_expr 按尺寸分档计费，单价非常量，故不标 price
            { name: "gpt-image-2", capability: "image" },
            { name: "gpt-image-2-1k", capability: "image", price: { amount: 0.02, per: "image" } },
            { name: "nano-banana-2", capability: "image", price: { amount: 0.08, per: "image" } },
            { name: "nano-banana-pro", capability: "image", price: { amount: 0.1, per: "image" } },
            // 2K/4K 六 SKU（nano-banana-*-2k/-4k）260813 在售，260824 已不可路由（供给侧收缩）；
            // 后端恢复 abilities 后可加回，定价条目仍在（2k ¥0.11/0.13，4k ¥0.14/0.15）。
        ],
    },
    {
        group: "overseas",
        channelName: "NYCATAI 视频",
        defaultModel: "kling-3.0",
        models: [
            { name: "kling-3.0", capability: "video", price: { amount: 0.08, per: "second" } },
            { name: "kling-3.0-turbo", capability: "video", price: { amount: 0.083, per: "second" } },
            { name: "kling-o3", capability: "video", price: { amount: 0.14, per: "second" } },
            { name: "veo-3.1", capability: "video", price: { amount: 0.25, per: "second" } },
            { name: "veo-3.1-fast", capability: "video", price: { amount: 0.14, per: "second" } },
            { name: "sd-mini", capability: "video", price: { amount: 0.48, per: "second" } },
            { name: "sd-fast", capability: "video", price: { amount: 0.64, per: "second" } },
            { name: "sd-2.0", capability: "video", price: { amount: 0.68, per: "second" } },
            { name: "sd-2.5-480p", capability: "video", price: { amount: 0.38, per: "second" } },
            { name: "sd-2.5", capability: "video", price: { amount: 0.88, per: "second" } },
            { name: "sd-2.5-720p", capability: "video", price: { amount: 0.88, per: "second" } },
            { name: "sd-2.5-1080p", capability: "video", price: { amount: 1.98, per: "second" } },
        ],
    },
    {
        group: "video",
        channelName: "NYCATAI 视频·按次",
        // 不设 defaultModel：视频默认走 overseas 的 kling-3.0（按秒更便宜）
        models: [
            { name: "seedance-2.0", capability: "video", price: { amount: 2.85, per: "call" } },
            { name: "minimax-h3-2k", capability: "video", price: { amount: 3.5, per: "call" }, provisional: true },
        ],
    },
    {
        group: "codex",
        channelName: "NYCATAI 对话",
        defaultModel: "gpt-5.5",
        models: [
            { name: "gpt-5.5", capability: "text" },
            { name: "gpt-5.4", capability: "text" },
            { name: "gpt-5.4-mini", capability: "text" },
            // gpt-5.6 系（sol/terra）可路由，暂不入目录：计费倍率修复后再评估
        ],
    },
    // audio 分组暂缺：确认 TTS 渠道后追加 { group: "audio", ... } 并在 bootstrap 里放开 audioModel 默认值。
];
