import type { ModelCapability } from "@/stores/use-config-store";

// NYCATAI 模型目录 —— 数据源 = 生产 abilities（可路由性的唯一真相）+ ModelPrice（售价），
// 见 nycatai-ops「nycatai-canvas 目录校准包 260824 晚」。**只接 nycatai 自己的接口与模型**。
//
// 🔑 /v1/models **不是**可路由性的真相：实测 nano-banana-pro-2k/-4k 未出现在 /image/v1/models
//    却能正常路由到上游（返回上游错误而非 model_not_found）。判可路由要么查 abilities，
//    要么用 scripts/canvas-catalog-check.py 的下单探测。
// 🔑 价格单位是**人民币**（平台名义 "$" 额度实为 ¥）。
// 🔑 按秒/按次接口分不出来（/api/pricing 的 quota_type=1 两者都用），只能人工标注。
export type NycataiGroup = "image" | "overseas" | "video" | "codex";

export type NycataiModelDef = {
    name: string;
    capability: ModelCapability;
    /** 展示用单价（P3 成本透明消费此字段），单位人民币 */
    price?: { amount: number; per: "second" | "image" | "call" };
    /** 冗余渠道条数：越厚越稳，默认模型优先选厚的 */
    redundancy?: number;
    /** 供 UI/编排助手参考的一句话说明 */
    note?: string;
    /** true = 型号名/价格未经实测校准 */
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

/** 4K 请求尺寸写官方档 3840x2160；写 4096x4096 会被部分上游吸附降级 */
export const NYCATAI_4K_SIZE = "3840x2160";

export const NYCATAI_GROUPS: NycataiGroupDef[] = [
    {
        group: "image",
        channelName: "NYCATAI 生图",
        defaultModel: "nano-banana-2", // 冗余最厚（6 线）、最快约 13s
        models: [
            { name: "nano-banana-2", capability: "image", price: { amount: 0.08, per: "image" }, redundancy: 6, note: "推荐默认，最快约 13s" },
            { name: "nano-banana-2-2k", capability: "image", price: { amount: 0.11, per: "image" }, redundancy: 5, note: "真 2048²" },
            { name: "nano-banana-2-4k", capability: "image", price: { amount: 0.14, per: "image" }, redundancy: 5, note: "真 4K（5504×3072 级）" },
            { name: "nano-banana-pro", capability: "image", price: { amount: 0.1, per: "image" }, redundancy: 5 },
            { name: "nano-banana-pro-2k", capability: "image", price: { amount: 0.13, per: "image" }, redundancy: 3 },
            { name: "nano-banana-pro-4k", capability: "image", price: { amount: 0.15, per: "image" }, redundancy: 3, note: "真 4096²，AI 放大首选" },
            { name: "gpt-image-2-1k", capability: "image", price: { amount: 0.02, per: "image" }, redundancy: 1, note: "号池原生 1254×1254" },
            // gpt-image-2 按 token 计费（tiered_expr），≈¥0.06，非常量单价故不标 price
            { name: "gpt-image-2", capability: "image", redundancy: 1, note: "号池 + 本地超分，官方 7 档尺寸，≈¥0.06" },
            { name: "ex-gpt-image-2", capability: "image", price: { amount: 0.1, per: "image" }, redundancy: 2, note: "外部原生，按 size 出 1k/2k/4k" },
        ],
    },
    {
        group: "overseas",
        channelName: "NYCATAI 视频",
        defaultModel: "kling-3.0", // 最便宜且冗余 3 线
        models: [
            { name: "kling-3.0", capability: "video", price: { amount: 0.08, per: "second" }, redundancy: 3, note: "推荐默认" },
            { name: "kling-3.0-1080p", capability: "video", price: { amount: 0.12, per: "second" }, redundancy: 2 },
            { name: "kling-3.0-turbo", capability: "video", price: { amount: 0.083, per: "second" }, redundancy: 1 },
            { name: "kling-o3", capability: "video", price: { amount: 0.14, per: "second" }, redundancy: 2 },
            { name: "veo-3.1", capability: "video", price: { amount: 0.25, per: "second" }, redundancy: 2, note: "时长仅 4/6/8 秒" },
            { name: "veo-3.1-fast", capability: "video", price: { amount: 0.14, per: "second" }, redundancy: 2, note: "时长仅 4/6/8 秒" },
            { name: "sd-mini", capability: "video", price: { amount: 0.48, per: "second" }, redundancy: 3 },
            { name: "sd-fast", capability: "video", price: { amount: 0.64, per: "second" }, redundancy: 4 },
            { name: "sd-2.0", capability: "video", price: { amount: 0.68, per: "second" }, redundancy: 4, note: "时长 4–15 秒" },
            { name: "sd-2.0-1080p", capability: "video", price: { amount: 1.55, per: "second" }, redundancy: 4 },
            { name: "sd-2.0-4k", capability: "video", price: { amount: 6.2, per: "second" }, redundancy: 3 },
            { name: "sd-2.5-480p", capability: "video", price: { amount: 0.38, per: "second" }, redundancy: 1, note: "2.5 系：时长 4–30 秒 / 锁脸 / 参考视频 / 首尾帧" },
            { name: "sd-2.5", capability: "video", price: { amount: 0.88, per: "second" }, redundancy: 1, note: "=720p；2.5 系全能力" },
            { name: "sd-2.5-720p", capability: "video", price: { amount: 0.88, per: "second" }, redundancy: 1, note: "与 sd-2.5 同价同能力" },
            { name: "sd-2.5-1080p", capability: "video", price: { amount: 1.98, per: "second" }, redundancy: 1, note: "2.5 系全能力" },
            // leonardo-kling-* / leonardo-veo-* 是同价别名，不重复暴露
        ],
    },
    {
        group: "video",
        channelName: "NYCATAI 视频·按次",
        // 不设 defaultModel：视频默认走 overseas 的 kling-3.0（按秒更便宜）
        models: [
            { name: "seedance-2.0", capability: "video", price: { amount: 2.85, per: "call" }, note: "不乘时长，4–15 秒同价" },
            { name: "minimax-h3-2k", capability: "video", price: { amount: 3.5, per: "call" }, note: "2K 原生，分辨率与时长固定" },
            // seedance-2.5 / -10s 已配价建渠道，等网关重启后再入目录
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
        ],
    },
];
