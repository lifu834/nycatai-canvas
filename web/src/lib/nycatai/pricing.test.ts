import { describe, expect, it } from "vitest";

import { billingRuleLabel, estimateImageCost, estimateVideoCost, findNycataiModel, formatCost, unitPriceLabel } from "./pricing";

describe("nycatai pricing", () => {
    it("非受管渠道模型返回 null", () => {
        expect(findNycataiModel("default::gpt-image-2")).toBeNull();
        expect(estimateImageCost("default::gpt-image-2", 2)).toBeNull();
    });

    it("阶梯计费模型标 ≈ 价（gpt-image-2 非 vvip 是 flat 一口价）", () => {
        expect(estimateImageCost("nycatai-image::gpt-image-2", 2)!.amount).toBeCloseTo(0.12);
        expect(unitPriceLabel("gpt-image-2")).toBe("≈¥0.060/张");
    });

    it("按张计价 × 数量", () => {
        const estimate = estimateImageCost("nycatai-image::nano-banana-2", 3);
        expect(estimate).not.toBeNull();
        expect(estimate!.amount).toBeCloseTo(0.08 * 3);
        expect(estimate!.fragile).toBe(false);
    });

    it("按秒计价 × 时长，非法数量兜底为 1", () => {
        const estimate = estimateVideoCost("nycatai-overseas::kling-3.0", 6);
        expect(estimate!.amount).toBeCloseTo(0.48);
        expect(estimateVideoCost("nycatai-overseas::kling-3.0", 0)!.amount).toBeCloseTo(0.08);
    });

    it("视频模型无价格返回 null", () => {
        expect(estimateVideoCost("nycatai-codex::gpt-5.5", 6)).toBeNull();
    });

    it("formatCost 小额三位小数，常规两位", () => {
        expect(formatCost(0.075)).toBe("¥0.075");
        expect(formatCost(0.48)).toBe("¥0.48");
    });

    it("单价文案按计费单位区分张/秒/次", () => {
        expect(unitPriceLabel("nano-banana-2")).toBe("¥0.080/张");
        expect(unitPriceLabel("kling-3.0")).toBe("¥0.080/秒");
        expect(unitPriceLabel("seedance-2.0")).toBe("¥2.85/次");
        expect(unitPriceLabel("gpt-image-2-1k")).toBe("¥0.020/张");
        expect(unitPriceLabel("gpt-5.5")).toBe("¥5.00/¥30.00"); // 文本模型展示 输入/输出 每 1M
        expect(unitPriceLabel("gpt-5.6-terra")).toBe("¥2.00/¥12.00"); // ratio 1 → 输入 ¥2/1M
        expect(unitPriceLabel("no-such-sku")).toBeNull();
    });

    it("计费规则含单位说明、限制与线路风险", () => {
        expect(billingRuleLabel("kling-3.0")).toContain("按秒计费");
        expect(billingRuleLabel("seedance-2.0")).toContain("一口价");
        expect(billingRuleLabel("veo-3.1")).toContain("4/6/8 秒");
        expect(billingRuleLabel("sd-2.5-720p")).toContain("线路少");
        expect(billingRuleLabel("gpt-5.5")).toContain("每 1M tokens");
        expect(billingRuleLabel("gpt-5.6-terra")).toContain("缓存命中 10%");
    });
});
