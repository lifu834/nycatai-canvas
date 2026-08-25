import type { ModelCapability } from "@/stores/use-config-store";

// NYCATAI 模型目录（260825 版，含档位映射）—— 数据源 = 生产 abilities + /api/pricing 现场核对。
// **本站只接入 NYCATAI 自有接口与模型。**
//
// 设计：用户看到的是「友好模型名 · 档位」（如 "Nano Banana 2 · 4K"），真实 SKU 名藏在 name 字段里。
// 后端按 SKU 名分档不变 —— 那是对每条上游渠道逐档验收过落盘像素的锚点；改成按 size 计价会失去这层
// 保证（上游虚标档位反复出现：声称 4096 实出 1254²、声称 4K 只给 1024²、2560×1440 静默吸附成 4K）。
//
// 🔑 /v1/models **不是**可路由性的真相（nano-banana-pro-2k/-4k 不在列表却能路由）；
//    判可路由用 scripts/canvas-catalog-check.py 的下单探测。
// 🔑 价格单位是**人民币**；按秒/按次接口分不出来（quota_type=1 两者都用），只能人工标注。
// 🔑 生图 `size` 只定宽高比、不是档位开关（唯一例外 ex-gpt-image-2 按 size 出档）；4K 写 3840x2160。
export type NycataiGroup = "image" | "overseas" | "video" | "codex";

export type NycataiModelDef = {
    /** 真实 SKU 名（发给网关的 model 字段） */
    name: string;
    /** 展示用友好名，如 "Nano Banana 2"；档位另见 tier */
    label: string;
    /** 档位标签，如 "1K"/"4K"/"720p"/"Fast"；无档位留空 */
    tier?: string;
    capability: ModelCapability;
    /** 单价，单位人民币 */
    price?: { amount: number; per: "second" | "image" | "call" };
    /** 冗余渠道条数：越厚越稳，默认模型优先选厚的 */
    redundancy?: number;
    /** ⚠️ 单点单家供给，勿设默认；失败时应引导用户改用替代模型 */
    fragile?: boolean;
    /** 供 UI/编排助手参考的一句话说明 */
    note?: string;
};

export type NycataiGroupDef = {
    /** 同时是渠道 id 后缀与网关路径前缀（保持 id ≡ 路径，避免错位） */
    group: NycataiGroup;
    channelName: string;
    models: NycataiModelDef[];
    /** 该能力的默认 SKU；同一 capability 只允许一个分组设置 */
    defaultModel?: string;
};

export const DEFAULT_GATEWAY = "https://api.nycatai.com";
export const NYCATAI_CHANNEL_PREFIX = "nycatai-";

/** 4K 请求尺寸写官方档 3840x2160；写 4096x4096 会被部分上游吸附降级 */
export const NYCATAI_4K_SIZE = "3840x2160";

export const NYCATAI_GROUPS: NycataiGroupDef[] = [
    {
        group: "image",
        channelName: "生图",
        defaultModel: "nano-banana-2", // 冗余最厚（6 条渠道）
        models: [
            { name: "nano-banana-2", label: "Nano Banana 2", tier: "1K", capability: "image", price: { amount: 0.08, per: "image" }, redundancy: 6, note: "推荐默认，最快约 13s" },
            { name: "nano-banana-2-2k", label: "Nano Banana 2", tier: "2K", capability: "image", price: { amount: 0.11, per: "image" }, redundancy: 5, note: "真 2048²" },
            { name: "nano-banana-2-4k", label: "Nano Banana 2", tier: "4K", capability: "image", price: { amount: 0.14, per: "image" }, redundancy: 5, note: "真 4K" },
            { name: "nano-banana-pro", label: "Nano Banana Pro", tier: "1K", capability: "image", price: { amount: 0.1, per: "image" }, redundancy: 5 },
            { name: "nano-banana-pro-2k", label: "Nano Banana Pro", tier: "2K", capability: "image", price: { amount: 0.13, per: "image" }, redundancy: 3 },
            { name: "nano-banana-pro-4k", label: "Nano Banana Pro", tier: "4K", capability: "image", price: { amount: 0.15, per: "image" }, redundancy: 3, note: "真 4096²，AI 放大首选" },
            { name: "gpt-image-2-1k", label: "GPT Image 2", tier: "1K", capability: "image", price: { amount: 0.02, per: "image" }, redundancy: 2, note: "号池原生输出 1254×1254，不是 1024²" },
            { name: "ex-gpt-image-2", label: "GPT Image 2 外部原生", tier: "按尺寸", capability: "image", price: { amount: 0.1, per: "image" }, redundancy: 3, note: "唯一按 size 出档的生图 SKU" },
        ],
    },
    {
        group: "overseas",
        channelName: "视频",
        defaultModel: "kling-3.0", // 3 条渠道且最便宜
        models: [
            { name: "kling-3.0", label: "Kling 3.0", tier: "720p", capability: "video", price: { amount: 0.08, per: "second" }, redundancy: 3, note: "推荐默认" },
            { name: "kling-3.0-1080p", label: "Kling 3.0", tier: "1080p", capability: "video", price: { amount: 0.12, per: "second" }, redundancy: 2 },
            { name: "kling-3.0-turbo", label: "Kling 3.0 Turbo", capability: "video", price: { amount: 0.083, per: "second" }, redundancy: 1 },
            { name: "kling-o3", label: "Kling O3", capability: "video", price: { amount: 0.14, per: "second" }, redundancy: 2 },
            { name: "veo-3.1", label: "Veo 3.1", tier: "标准", capability: "video", price: { amount: 0.25, per: "second" }, redundancy: 2, note: "时长仅 4/6/8 秒" },
            { name: "veo-3.1-fast", label: "Veo 3.1", tier: "Fast", capability: "video", price: { amount: 0.14, per: "second" }, redundancy: 2, note: "时长仅 4/6/8 秒" },
            { name: "sd-2.0-720p", label: "Seedance 2.0", tier: "720p", capability: "video", price: { amount: 0.68, per: "second" }, redundancy: 4, note: "时长 4–15 秒" },
            { name: "sd-2.0-1080p", label: "Seedance 2.0", tier: "1080p", capability: "video", price: { amount: 1.55, per: "second" }, redundancy: 4 },
            { name: "sd-2.0-4k", label: "Seedance 2.0", tier: "4K", capability: "video", price: { amount: 6.2, per: "second" }, redundancy: 3 },
            { name: "sd-fast-720p", label: "Seedance 2.0 Fast", tier: "720p", capability: "video", price: { amount: 0.64, per: "second" }, redundancy: 4 },
            { name: "sd-mini-720p", label: "Seedance 2.0 Mini", tier: "720p", capability: "video", price: { amount: 0.48, per: "second" }, redundancy: 3 },
            { name: "sd-2.5-480p", label: "Seedance 2.5", tier: "480p", capability: "video", price: { amount: 0.38, per: "second" }, redundancy: 1, fragile: true, note: "支持锁脸/参考视频/4–30 秒" },
            { name: "sd-2.5-720p", label: "Seedance 2.5", tier: "720p", capability: "video", price: { amount: 0.88, per: "second" }, redundancy: 1, fragile: true, note: "支持锁脸/参考视频/4–30 秒" },
            { name: "sd-2.5-1080p", label: "Seedance 2.5", tier: "1080p", capability: "video", price: { amount: 1.98, per: "second" }, redundancy: 1, fragile: true, note: "支持锁脸/参考视频/4–30 秒" },
            // leonardo-* 是同价别名，不重复暴露
        ],
    },
    {
        group: "video",
        channelName: "视频·一口价",
        // 不设 defaultModel：视频默认走 overseas 的 kling-3.0（按秒更便宜）
        models: [
            { name: "seedance-2.0", label: "Seedance 2.0 一口价", capability: "video", price: { amount: 2.85, per: "call" }, redundancy: 4, note: "4–15 秒同价" },
            { name: "minimax-h3-2k", label: "MiniMax H3", tier: "2K", capability: "video", price: { amount: 3.5, per: "call" }, redundancy: 4, note: "分辨率与时长固定" },
        ],
    },
    {
        group: "codex",
        channelName: "对话",
        defaultModel: "gpt-5.5",
        models: [
            { name: "gpt-5.5", label: "GPT-5.5", capability: "text" },
            { name: "gpt-5.4", label: "GPT-5.4", capability: "text" },
            { name: "gpt-5.4-mini", label: "GPT-5.4 Mini", capability: "text" },
        ],
    },
];

/** SKU 名 → 定义（跨分组查找） */
export function findNycataiModelDef(sku: string): NycataiModelDef | undefined {
    for (const def of NYCATAI_GROUPS) {
        const model = def.models.find((item) => item.name === sku);
        if (model) return model;
    }
    return undefined;
}

/** 友好展示名："Nano Banana 2 · 4K"；未知 SKU 原样返回 */
export function nycataiModelLabel(sku: string): string {
    const model = findNycataiModelDef(sku);
    if (!model) return sku;
    return model.tier ? `${model.label} · ${model.tier}` : model.label;
}
