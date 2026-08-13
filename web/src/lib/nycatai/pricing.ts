import { decodeChannelModel } from "@/stores/use-config-store";

import { NYCATAI_CHANNEL_PREFIX, NYCATAI_GROUPS, type NycataiModelDef } from "./catalog";

// 成本透明（P3）：从 catalog 的价格元数据算「生成前预估费用」。
// 只对 nycatai- 受管渠道生效；无价格数据的模型返回 null（UI 不显示，宁缺毋滥）。

export type CostEstimate = {
    amount: number;
    /** 价格元数据尚未对账单校准 */
    provisional: boolean;
};

export function findNycataiModel(modelValue: string): NycataiModelDef | null {
    const decoded = decodeChannelModel(modelValue);
    if (!decoded || !decoded.channelId.startsWith(NYCATAI_CHANNEL_PREFIX)) return null;
    const group = decoded.channelId.slice(NYCATAI_CHANNEL_PREFIX.length);
    const def = NYCATAI_GROUPS.find((item) => item.group === group);
    return def?.models.find((model) => model.name === decoded.model) || null;
}

export function estimateImageCost(modelValue: string, count: number): CostEstimate | null {
    const model = findNycataiModel(modelValue);
    if (!model?.price || model.price.per !== "image") return null;
    const n = Math.max(1, Math.floor(count) || 1);
    return { amount: model.price.amount * n, provisional: Boolean(model.provisional) };
}

export function estimateVideoCost(modelValue: string, seconds: number): CostEstimate | null {
    const model = findNycataiModel(modelValue);
    if (!model?.price) return null;
    if (model.price.per === "second") {
        const s = Math.max(1, Math.floor(seconds) || 1);
        return { amount: model.price.amount * s, provisional: Boolean(model.provisional) };
    }
    if (model.price.per === "call") return { amount: model.price.amount, provisional: Boolean(model.provisional) };
    return null;
}

/** 平台记账货币展示（与控制台一致用 $ 记号） */
export function formatCost(amount: number): string {
    return `$${amount.toFixed(amount < 0.1 ? 3 : 2)}`;
}
