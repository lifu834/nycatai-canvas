import type { ModelCapability } from "@/stores/use-config-store";

// NYCATAI 模型目录：人工策划，不依赖 /v1/models 拉取（上游按模型名关键词猜能力，会把我们的部分命名猜错）。
// 价格单位为平台记账货币；provisional 条目须在 P1 用真实 key 对照网关 /v1/models 与 usage_logs 校准后转正。
export type NycataiGroup = "image" | "video" | "codex";

export type NycataiModelDef = {
    name: string;
    capability: ModelCapability;
    /** 展示用预估单价（P3 成本透明消费此字段） */
    price?: { amount: number; per: "second" | "image" | "call" };
    /** true = 型号名/价格未经网关实测校准 */
    provisional?: boolean;
};

export type NycataiGroupDef = {
    group: NycataiGroup;
    channelName: string;
    models: NycataiModelDef[];
    /** encodeChannelModel 后作为该能力的默认模型 */
    defaultModel?: string;
};

export const DEFAULT_GATEWAY = "https://api.nycatai.com";
export const NYCATAI_CHANNEL_PREFIX = "nycatai-";

// 模型名于 260813 用真实 key 对网关 /{group}/v1/models 校准（scripts/canvas-cors-check.py --key）。
// 策展原则：排除 ex- 兜底别名、-1k 死计费 key、leonardo-*/veo-3-1 重复别名（与无前缀canonical名同渠道能力）。
// price 仍为预估（provisional），P3 成本透明前再对 billing 表转正。
export const NYCATAI_GROUPS: NycataiGroupDef[] = [
    {
        group: "image",
        channelName: "NYCATAI 生图",
        defaultModel: "gpt-image-2",
        models: [
            { name: "gpt-image-2", capability: "image" },
            { name: "nano-banana-2", capability: "image", price: { amount: 0.075, per: "image" }, provisional: true },
            { name: "nano-banana-2-2k", capability: "image", provisional: true },
            { name: "nano-banana-2-4k", capability: "image", provisional: true },
            { name: "nano-banana-pro", capability: "image", price: { amount: 0.12, per: "image" }, provisional: true },
            { name: "nano-banana-pro-2k", capability: "image", provisional: true },
            { name: "nano-banana-pro-4k", capability: "image", provisional: true },
        ],
    },
    {
        group: "video",
        channelName: "NYCATAI 视频",
        // 默认模型选已端到端实证出片的 kling（260813 veo 两渠道 #180/#193 上游 5xx，e2e 未过；恢复后可评估切回 veo31-fast）
        defaultModel: "kling-3.0-720p",
        models: [
            { name: "veo31", capability: "video", price: { amount: 0.25, per: "second" }, provisional: true },
            { name: "veo31-fast", capability: "video", price: { amount: 0.14, per: "second" }, provisional: true },
            { name: "veo31-ref", capability: "video", provisional: true },
            { name: "kling-3.0-720p", capability: "video", price: { amount: 0.08, per: "second" }, provisional: true },
            { name: "kling-3.0-1080p", capability: "video", provisional: true },
            { name: "seedance-2.0-720p", capability: "video", provisional: true },
            { name: "seedance-2.0", capability: "video", provisional: true },
            { name: "seedance-2.0-mini-720p", capability: "video", provisional: true },
            { name: "minimax-h3-2k", capability: "video", provisional: true },
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
            // 注意：gpt-5.6 系暂不入目录（计费倍率硬编码 bug 未部署修复，见 memory gpt56-completion-ratio-hardcode-lock）
        ],
    },
    // audio 分组暂缺：确认 TTS 渠道后追加 { group: "audio", ... } 并在 bootstrap 里放开 audioModel 默认值。
];
