import { create } from "zustand";

import { DEFAULT_GATEWAY, NYCATAI_GROUPS, type NycataiGroup } from "./catalog";

// 与后端对齐模型目录（260909）。
//
// 分工：**catalog.ts 是"怎么展示"，/api/pricing 是"卖多少钱 / 还在不在"**。
// - 网关权威的部分（单价、计费单位、模型是否还挂在这个分组下）每次启动都现拉；
// - 展示部分（友好名、档位标签、线路条数、说明、fragile 标记）留在 catalog.ts 人工维护
//   —— /api/pricing 里没有这些，而且它还会吐内部隐藏名（leonardo-* 之类），
//   直接照单全收会把不该露的 SKU 摆到用户面前。
//
// 于是「新增模型」仍需要在 catalog.ts 加一行（决定它叫什么、归哪档），
// 但「改价 / 下架」不需要动代码，刷新页面就跟上。
// 只在 catalog 里、网关已经没有的 SKU 会被自动摘掉，避免"点了必失败"。
//
// 拉取失败一律 fail-open：保留 catalog 里的静态价与全量模型，绝不因为体检不通就把功能关掉
// （"探测失败当故障"是 monitoring-reorg-260826 修过的老毛病）。

export type LiveBillingUnit = "call" | "second" | "token";

export type LiveModel = {
    /** quota_type=1 的固定价（人民币） */
    price?: number;
    /** quota_type=0 的 token 倍率 */
    ratio?: number;
    completionRatio?: number;
    unit: LiveBillingUnit;
    groups: string[];
};

type PricingItem = {
    model_name?: unknown;
    quota_type?: unknown;
    model_price?: unknown;
    model_ratio?: unknown;
    completion_ratio?: unknown;
    billing_unit?: unknown;
    enable_groups?: unknown;
};

type LivePricingState = {
    models: Record<string, LiveModel>;
    /** 0 = 还没成功同步过；UI 订阅它来在同步完成后重渲染 */
    fetchedAt: number;
    apply: (models: Record<string, LiveModel>) => void;
};

export const useLivePricingStore = create<LivePricingState>((set) => ({
    models: {},
    fetchedAt: 0,
    apply: (models) => set({ models, fetchedAt: Date.now() }),
}));

/** 单个 SKU 的网关现价；没同步到就返回 undefined，调用方回落 catalog 静态值 */
export function liveModel(sku: string): LiveModel | undefined {
    return useLivePricingStore.getState().models[sku];
}

export function hasLivePricing() {
    return useLivePricingStore.getState().fetchedAt > 0;
}

function asString(value: unknown) {
    return typeof value === "string" ? value : "";
}

function asNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** 把 /api/pricing 的 data[] 规整成 name → LiveModel（导出以便单测） */
export function parsePricingPayload(payload: unknown): Record<string, LiveModel> {
    const data = (payload as { data?: unknown })?.data;
    if (!Array.isArray(data)) return {};
    const models: Record<string, LiveModel> = {};
    for (const raw of data as PricingItem[]) {
        const name = asString(raw?.model_name).trim();
        if (!name) continue;
        const groups = Array.isArray(raw?.enable_groups) ? (raw.enable_groups as unknown[]).map(asString).filter(Boolean) : [];
        // billing_unit 缺席 = 按 token 计费（quota_type=0），网关就是这么表达的
        const rawUnit = asString(raw?.billing_unit);
        const unit: LiveBillingUnit = rawUnit === "call" || rawUnit === "second" ? rawUnit : "token";
        models[name] = {
            price: asNumber(raw?.model_price),
            ratio: asNumber(raw?.model_ratio),
            completionRatio: asNumber(raw?.completion_ratio),
            unit,
            groups,
        };
    }
    return models;
}

/**
 * 某个 SKU 在指定分组下是否仍可下单。
 * 没同步到定价表时一律返回 true（fail-open）。
 */
export function isRoutable(sku: string, group: NycataiGroup): boolean {
    if (!hasLivePricing()) return true;
    const model = useLivePricingStore.getState().models[sku];
    return Boolean(model && model.groups.includes(group));
}

/** catalog 里有、网关已经不认的 SKU（供体检脚本/日志用） */
export function delistedSkus(): string[] {
    if (!hasLivePricing()) return [];
    return NYCATAI_GROUPS.flatMap((def) => def.models.filter((model) => !isRoutable(model.name, def.group)).map((model) => model.name));
}

/** 网关有、catalog 还没登记的生图/视频 SKU（提醒我们去补展示信息） */
export function unannotatedSkus(): string[] {
    if (!hasLivePricing()) return [];
    const known = new Set(NYCATAI_GROUPS.flatMap((def) => def.models.map((model) => model.name)));
    const wanted = new Set<NycataiGroup>(["image", "video"]);
    return Object.entries(useLivePricingStore.getState().models)
        .filter(([name, model]) => !known.has(name) && model.groups.some((group) => wanted.has(group as NycataiGroup)))
        .map(([name]) => name);
}

/** 拉一次网关定价表并落进 store。失败静默（保留静态目录），返回是否成功。 */
export async function syncLivePricing(gateway = DEFAULT_GATEWAY, apiKey = "", signal?: AbortSignal): Promise<boolean> {
    const root = gateway.replace(/\/+$/, "");
    try {
        const response = await fetch(`${root}/api/pricing`, {
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
            signal,
        });
        if (!response.ok) return false;
        const models = parsePricingPayload(await response.json());
        if (!Object.keys(models).length) return false;
        useLivePricingStore.getState().apply(models);
        return true;
    } catch {
        return false;
    }
}
