import { decodeChannelModel } from "@/stores/use-config-store";

import { findNycataiModelDef, NYCATAI_CHANNEL_PREFIX, NYCATAI_GROUPS, type NycataiModelDef } from "./catalog";

// 成本透明（P3）：从 catalog 的价格元数据算「生成前预估费用」。
// 只对 nycatai- 受管渠道生效；无价格数据的模型返回 null（UI 不显示，宁缺毋滥）。

export type CostEstimate = {
    amount: number;
    /** 供给单点的模型（sd-2.5 系）：UI 可据此提示"线路较少" */
    fragile: boolean;
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
    return { amount: model.price.amount * n, fragile: Boolean(model.fragile) };
}

export function estimateVideoCost(modelValue: string, seconds: number): CostEstimate | null {
    const model = findNycataiModel(modelValue);
    if (!model?.price) return null;
    if (model.price.per === "second") {
        const s = Math.max(1, Math.floor(seconds) || 1);
        return { amount: model.price.amount * s, fragile: Boolean(model.fragile) };
    }
    if (model.price.per === "call") return { amount: model.price.amount, fragile: Boolean(model.fragile) };
    return null;
}

/** 平台记账货币展示：**人民币**（平台名义的 "$" 额度实为 ¥，见 memory pricing-margin-redline） */
export function formatCost(amount: number): string {
    return `¥${amount.toFixed(amount < 0.1 ? 3 : 2)}`;
}

/** new-api 口径：每 1M tokens 价 = 2.0 × ratio（与主站 models 页 formatPricePerMillion 一致） */
const TOKEN_PRICE_BASE = 2.0;

export function tokenPricePerMillion(ratio: number): number {
    return TOKEN_PRICE_BASE * ratio;
}

/** 下拉/标签用的单价文案："¥0.08/张" / "¥0.08/秒" / "¥2.85/次" / "¥5.00/¥30.00 每 1M" */
export function unitPriceLabel(sku: string): string | null {
    const model = findNycataiModelDef(sku);
    if (model?.price) {
        const unit = model.price.per === "second" ? "/秒" : model.price.per === "call" ? "/次" : "/张";
        return `${model.approxPrice ? "≈" : ""}${formatCost(model.price.amount)}${unit}`;
    }
    if (model?.tokenRatio) {
        // 文本模型按 token 计费：展示「输入/输出」两个价，用户最关心的就是这两个数
        const input = tokenPricePerMillion(model.tokenRatio.input);
        const output = tokenPricePerMillion(model.tokenRatio.input * model.tokenRatio.completionMultiplier);
        return `¥${input.toFixed(2)}/¥${output.toFixed(2)}`;
    }
    return null;
}

/** 计费规则一句话（含时长/档位限制等），供下拉副标题展示 */
export function billingRuleLabel(sku: string): string | null {
    const model = findNycataiModelDef(sku);
    if (!model) return null;
    const parts: string[] = [];
    if (model.price?.per === "second") parts.push("按秒计费");
    else if (model.price?.per === "call") parts.push("一口价");
    else if (model.price?.per === "image") parts.push("按张计费");
    else if (model.tokenRatio) {
        const cache = model.tokenRatio.cacheMultiplier;
        parts.push(`输入/输出 每 1M tokens${cache ? `，缓存命中 ${Math.round(cache * 100)}%` : ""}`);
    } else parts.push("按 token 计费");
    if (model.note) parts.push(model.note);
    if (model.fragile) parts.push("⚠ 线路少，故障时改用 Seedance 2.0");
    return parts.join(" · ");
}
