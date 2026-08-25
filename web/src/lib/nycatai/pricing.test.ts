import { describe, expect, it } from "vitest";

import { estimateImageCost, estimateVideoCost, findNycataiModel, formatCost } from "./pricing";

describe("nycatai pricing", () => {
    it("非受管渠道模型返回 null", () => {
        expect(findNycataiModel("default::gpt-image-2")).toBeNull();
        expect(estimateImageCost("default::gpt-image-2", 2)).toBeNull();
    });

    it("受管渠道无价格数据的模型返回 null（宁缺毋滥）", () => {
        expect(estimateImageCost("nycatai-image::gpt-image-2", 1)).toBeNull(); // tiered_expr 按尺寸分档，无常量单价
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
});
