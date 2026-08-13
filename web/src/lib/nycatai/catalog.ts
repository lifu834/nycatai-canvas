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

export const NYCATAI_GROUPS: NycataiGroupDef[] = [
    {
        group: "image",
        channelName: "NYCATAI 生图",
        defaultModel: "gpt-image-2",
        models: [
            { name: "gpt-image-2", capability: "image" },
            { name: "nano-banana", capability: "image", price: { amount: 0.075, per: "image" } },
        ],
    },
    {
        group: "video",
        channelName: "NYCATAI 视频",
        defaultModel: "veo31-fast",
        models: [
            { name: "veo31", capability: "video", price: { amount: 0.25, per: "second" }, provisional: true },
            { name: "veo31-fast", capability: "video", price: { amount: 0.14, per: "second" }, provisional: true },
            { name: "veo31-ref", capability: "video", provisional: true },
            { name: "kling-v2v", capability: "video", price: { amount: 0.08, per: "second" }, provisional: true },
            // TODO(P1): 从网关 /video/v1/models 拉取真实清单补齐 #193（veo/kling/seedance/minimax 系）与 #174 可售子集，
            // 校准上面四条的价格档（禁止凭记忆猜模型名，以 usage_logs / 渠道配置为准）。
        ],
    },
    {
        group: "codex",
        channelName: "NYCATAI 对话",
        defaultModel: "gpt-5.5",
        models: [{ name: "gpt-5.5", capability: "text" }],
    },
    // audio 分组暂缺：确认 TTS 渠道后追加 { group: "audio", ... } 并在 bootstrap 里放开 audioModel 默认值。
];
