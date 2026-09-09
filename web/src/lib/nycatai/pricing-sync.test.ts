import { beforeEach, describe, expect, it } from "vitest";

import { NYCATAI_GROUPS } from "./catalog";
import { delistedSkus, isRoutable, parsePricingPayload, unannotatedSkus, useLivePricingStore, type LiveModel } from "./pricing-sync";

function reset() {
    useLivePricingStore.setState({ models: {}, fetchedAt: 0 });
}

function seed(models: Record<string, Partial<LiveModel>>) {
    const full = Object.fromEntries(Object.entries(models).map(([name, model]) => [name, { unit: "call", groups: [], ...model } as LiveModel]));
    useLivePricingStore.getState().apply(full);
}

beforeEach(reset);

describe("parsePricingPayload", () => {
    it("按 billing_unit 分出 call / second / token（缺席即 token）", () => {
        const models = parsePricingPayload({
            data: [
                { model_name: "nano-banana-2-1k", quota_type: 1, model_price: 0.08, billing_unit: "call", enable_groups: ["image"] },
                { model_name: "kling-3.0-720p", quota_type: 1, model_price: 0.12, billing_unit: "second", enable_groups: ["video"] },
                { model_name: "gpt-5.5", quota_type: 0, model_ratio: 2.5, completion_ratio: 6, enable_groups: ["codex"] },
            ],
        });
        expect(models["nano-banana-2-1k"]).toEqual({ price: 0.08, ratio: undefined, completionRatio: undefined, unit: "call", groups: ["image"] });
        expect(models["kling-3.0-720p"].unit).toBe("second");
        expect(models["gpt-5.5"]).toMatchObject({ ratio: 2.5, completionRatio: 6, unit: "token" });
    });

    it("坏载荷不抛错，返回空表（调用方据此 fail-open）", () => {
        expect(parsePricingPayload(null)).toEqual({});
        expect(parsePricingPayload({ data: "nope" })).toEqual({});
        expect(parsePricingPayload({ data: [{ quota_type: 1 }, { model_name: "   " }] })).toEqual({});
    });
});

describe("isRoutable", () => {
    it("没同步到定价表时一律放行（fail-open，不能因为探测失败就关功能）", () => {
        expect(isRoutable("whatever", "image")).toBe(true);
    });

    it("同步后按 enable_groups 判定，跨分组不算数", () => {
        seed({ "nano-banana-2-1k": { groups: ["image"] }, "kling-3.0-720p": { groups: ["video"] } });
        expect(isRoutable("nano-banana-2-1k", "image")).toBe(true);
        expect(isRoutable("nano-banana-2-1k", "video")).toBe(false);
        expect(isRoutable("已下架的模型", "image")).toBe(false);
    });
});

describe("目录与网关的差集", () => {
    it("delisted = catalog 有、网关没有", () => {
        const first = NYCATAI_GROUPS[0].models[0].name;
        seed({ [first]: { groups: ["image"] } });
        const delisted = delistedSkus();
        expect(delisted).not.toContain(first);
        expect(delisted.length).toBeGreaterThan(0);
    });

    it("unannotated = 网关有、catalog 没登记（只看 image/video）", () => {
        seed({ "brand-new-image-sku": { groups: ["image"] }, "some-text-sku": { groups: ["codex"] } });
        const pending = unannotatedSkus();
        expect(pending).toContain("brand-new-image-sku");
        expect(pending).not.toContain("some-text-sku");
    });

    it("未同步时两个差集都为空，不误报", () => {
        expect(delistedSkus()).toEqual([]);
        expect(unannotatedSkus()).toEqual([]);
    });
});
