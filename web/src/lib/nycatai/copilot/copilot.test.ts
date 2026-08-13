import { describe, expect, it, vi } from "vitest";

import type { CanvasAgentSnapshot } from "@/lib/canvas/canvas-agent-ops";

import { extractSseDataLines, parseResponseOutput } from "./client";
import { compactSnapshot, pickDestructiveOps, runCopilotTool } from "./tools";

const snapshot: CanvasAgentSnapshot = {
    projectId: "p1",
    title: "测试画布",
    nodes: [
        { id: "n1", type: "image", title: "人设", position: { x: 10.6, y: 20.2 }, width: 320, height: 320, metadata: { status: "success", prompt: "a hero character, ".repeat(10) } },
        { id: "n2", type: "text", title: "剧本", position: { x: 400, y: 20 }, width: 320, height: 220, metadata: { status: "idle", content: "第一幕……" } },
    ] as CanvasAgentSnapshot["nodes"],
    connections: [{ id: "c1", fromNodeId: "n1", toNodeId: "n2" }],
    selectedNodeIds: ["n1"],
    viewport: { x: 0, y: 0, k: 0.876 },
};

describe("copilot client 解析", () => {
    it("SSE 缓冲按行提取 data 载荷并保留残行", () => {
        const { events, rest } = extractSseDataLines('event: x\ndata: {"a":1}\ndata: {"b":2}\ndata: {"部分');
        expect(events).toEqual(['{"a":1}', '{"b":2}']);
        expect(rest).toBe('data: {"部分');
    });

    it("completed output 提取文本与工具调用", () => {
        const result = parseResponseOutput([
            { type: "reasoning" },
            { type: "function_call", call_id: "c1", name: "canvas_get_state", arguments: "{}" },
            { type: "message", content: [{ type: "output_text", text: "好的" }] },
        ]);
        expect(result.toolCalls).toEqual([{ call_id: "c1", name: "canvas_get_state", arguments: "{}" }]);
        expect(result.text).toBe("好的");
    });
});

describe("copilot tools", () => {
    it("compactSnapshot 压缩坐标/截断长prompt", () => {
        const compact = compactSnapshot(snapshot);
        expect(compact.nodes[0]).toMatchObject({ id: "n1", x: 11, y: 20, status: "success" });
        expect(compact.nodes[0].prompt!.length).toBeLessThanOrEqual(81);
        expect(compact.connections).toEqual([["n1", "n2"]]);
        expect(compact.viewport.zoom).toBe(0.88);
    });

    it("pickDestructiveOps 只挑删除类", () => {
        expect(pickDestructiveOps([{ type: "add_node" }, { type: "delete_node", id: "n1" }, { type: "connect_nodes", fromNodeId: "a", toNodeId: "b" }])).toEqual([{ type: "delete_node", id: "n1" }]);
    });

    it("canvas_apply_ops: 拒绝含删除批次时不执行且返回 rejected", async () => {
        const applyOps = vi.fn();
        const output = await runCopilotTool("canvas_apply_ops", JSON.stringify({ ops: [{ type: "delete_node", id: "n1" }] }), {
            context: { snapshot, applyOps, undoOps: () => null, canUndo: false },
            navigate: vi.fn() as never,
            confirmDestructive: async () => false,
        });
        expect(JSON.parse(output).rejected).toBe(true);
        expect(applyOps).not.toHaveBeenCalled();
    });

    it("canvas_apply_ops: 执行并报告新建节点 id", async () => {
        const applyOps = vi.fn(() => ({ ...snapshot, nodes: [...snapshot.nodes, { id: "n3", type: "image", title: "", position: { x: 0, y: 0 }, width: 1, height: 1 }] }) as CanvasAgentSnapshot);
        const output = await runCopilotTool("canvas_apply_ops", JSON.stringify({ ops: [{ type: "add_node", nodeType: "image" }] }), {
            context: { snapshot, applyOps, undoOps: () => null, canUndo: false },
            navigate: vi.fn() as never,
            confirmDestructive: async () => true,
        });
        const parsed = JSON.parse(output);
        expect(parsed.ok).toBe(true);
        expect(parsed.createdNodeIds).toEqual(["n3"]);
    });

    it("未知工具与非法 JSON 返回 error 而非抛出", async () => {
        const deps = { context: { snapshot, applyOps: vi.fn(), undoOps: () => null, canUndo: false }, navigate: vi.fn() as never, confirmDestructive: async () => true };
        expect(JSON.parse(await runCopilotTool("nope", "{}", deps)).error).toContain("未知工具");
        expect(JSON.parse(await runCopilotTool("canvas_apply_ops", "{oops", deps)).error).toContain("JSON");
    });
});
