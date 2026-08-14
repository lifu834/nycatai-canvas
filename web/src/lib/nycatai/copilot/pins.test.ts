import { beforeEach, describe, expect, it } from "vitest";

import { getPinnedNodeIds, prunePinnedNodes, togglePinnedNodes } from "./pins";

beforeEach(() => localStorage.clear());

describe("copilot pins（角色钉住）", () => {
    it("toggle: 未钉→钉上, 全钉→解除", () => {
        expect(togglePinnedNodes("p1", ["a", "b"])).toEqual(["a", "b"]);
        expect(getPinnedNodeIds("p1")).toEqual(["a", "b"]);
        expect(togglePinnedNodes("p1", ["a", "b"])).toEqual([]);
    });

    it("部分已钉时补齐为全钉", () => {
        togglePinnedNodes("p1", ["a"]);
        expect(togglePinnedNodes("p1", ["a", "b"]).sort()).toEqual(["a", "b"]);
    });

    it("按画布隔离", () => {
        togglePinnedNodes("p1", ["a"]);
        expect(getPinnedNodeIds("p2")).toEqual([]);
    });

    it("prune 清掉已删除节点", () => {
        togglePinnedNodes("p1", ["a", "gone"]);
        expect(prunePinnedNodes("p1", new Set(["a"]))).toEqual(["a"]);
        expect(getPinnedNodeIds("p1")).toEqual(["a"]);
    });

    it("空选择与损坏存储不炸", () => {
        localStorage.setItem("nycatai:copilot-pins", "{broken");
        expect(getPinnedNodeIds("p1")).toEqual([]);
        expect(togglePinnedNodes("p1", [])).toEqual([]);
    });
});
