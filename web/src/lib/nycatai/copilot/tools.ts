import type { NavigateFunction } from "react-router-dom";

import { isSiteTool, runSiteTool } from "@/lib/agent/agent-site-tools";
import { summarizeCanvasAgentOps, type CanvasAgentOp, type CanvasAgentSnapshot } from "@/lib/canvas/canvas-agent-ops";
import type { AgentCanvasContext } from "@/stores/use-agent-store";

import type { ResponsesToolDef } from "./client";

// 云端画布编排助手的工具层：复用上游两套现成原语 ——
// canvas ops（applyCanvasAgentOps，经 use-agent-bridge 发布在 agent store 的 canvasContext）
// 与站点工具（agent-site-tools，本地 Agent 同款），本模块只做 schema 描述与分发。

const OPS_DOC = [
    "op 类型:",
    '- {"type":"add_node","id?":"自定义id","nodeType":"image|text|video|audio","title":"...","position":{"x":0,"y":0},"width?":320,"height?":240,"metadata?":{"prompt":"生成提示词"}}',
    '- {"type":"update_node","id":"nodeId","patch?":{"title":"..."},"metadata?":{"prompt":"..."}}',
    '- {"type":"connect_nodes","fromNodeId":"a","toNodeId":"b"} （连线=下游生成时引用上游内容/图片）',
    '- {"type":"delete_node","id?":"nodeId","ids?":["..."]} / {"type":"delete_connections","ids":["..."]}',
    '- {"type":"select_nodes","ids":["..."]} / {"type":"set_viewport","viewport":{"x":0,"y":0,"zoom":1}}',
    '- {"type":"run_generation","nodeId":"目标节点","mode":"text|image|video|audio","prompt":"本次生成提示词"} （真实调用生成，异步，用 generation_get_status 查进度）',
].join("\n");

export const COPILOT_TOOLS: ResponsesToolDef[] = [
    {
        type: "function",
        name: "canvas_get_state",
        description: "读取当前画布快照（节点/连线/选中/视口），任何操作前先调用。",
        parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
        type: "function",
        name: "canvas_apply_ops",
        description: `按顺序对画布应用一批操作。${OPS_DOC}`,
        parameters: {
            type: "object",
            properties: { ops: { type: "array", description: "操作数组，见工具描述中的 op 类型", items: { type: "object" } } },
            required: ["ops"],
        },
    },
    {
        type: "function",
        name: "generation_get_status",
        description: "查询画布/工作台生成任务状态（queued/running/succeeded/failed）。",
        parameters: {
            type: "object",
            properties: { scope: { type: "string", enum: ["all", "canvas", "image", "video"] }, nodeIds: { type: "array", items: { type: "string" } }, limit: { type: "number" } },
        },
    },
    {
        type: "function",
        name: "prompts_search",
        description: "搜索内置提示词库（风格/题材参考）。",
        parameters: { type: "object", properties: { keyword: { type: "string" }, page: { type: "number" }, pageSize: { type: "number" } } },
    },
    {
        type: "function",
        name: "assets_list",
        description: "列出用户素材库（图片/文本素材，可在 prompt 里引用其内容）。",
        parameters: { type: "object", properties: { kind: { type: "string", enum: ["all", "text", "image", "video"] }, keyword: { type: "string" }, page: { type: "number" } } },
    },
];

const DESTRUCTIVE_OP_TYPES = new Set(["delete_node", "delete_connections"]);

export function pickDestructiveOps(ops: CanvasAgentOp[]): CanvasAgentOp[] {
    return ops.filter((op) => DESTRUCTIVE_OP_TYPES.has(op.type));
}

/** 压缩快照给 LLM（控制 token；导出以便单测） */
export function compactSnapshot(snapshot: CanvasAgentSnapshot) {
    const clip = (value: unknown, max: number) => {
        const text = typeof value === "string" ? value.trim() : "";
        return text ? `${text.slice(0, max)}${text.length > max ? "…" : ""}` : undefined;
    };
    const nodes = snapshot.nodes.slice(0, 120).map((node) => ({
        id: node.id,
        type: node.type,
        title: clip(node.title, 40),
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
        w: Math.round(node.width),
        h: Math.round(node.height),
        status: node.metadata?.status,
        prompt: clip(node.metadata?.prompt || node.metadata?.composerContent, 80),
        content: node.type === "text" ? clip(node.metadata?.content, 120) : undefined,
        images: node.metadata?.images?.length || undefined,
    }));
    return {
        projectId: snapshot.projectId,
        title: snapshot.title,
        nodeCount: snapshot.nodes.length,
        truncated: snapshot.nodes.length > 120 || undefined,
        selected: snapshot.selectedNodeIds,
        viewport: { x: Math.round(snapshot.viewport.x), y: Math.round(snapshot.viewport.y), zoom: Number(snapshot.viewport.k.toFixed(2)) },
        nodes,
        connections: snapshot.connections.map((connection) => [connection.fromNodeId, connection.toNodeId]),
    };
}

export type CopilotToolDeps = {
    context: AgentCanvasContext;
    navigate: NavigateFunction;
    /** 返回 false = 用户拒绝本批含删除的操作 */
    confirmDestructive: (ops: CanvasAgentOp[]) => Promise<boolean>;
};

export async function runCopilotTool(name: string, argsJson: string, deps: CopilotToolDeps): Promise<string> {
    let args: Record<string, unknown> = {};
    try {
        args = argsJson ? JSON.parse(argsJson) : {};
    } catch {
        return JSON.stringify({ error: "arguments 不是合法 JSON" });
    }
    try {
        if (name === "canvas_get_state") return JSON.stringify(compactSnapshot(deps.context.snapshot));
        if (name === "canvas_apply_ops") {
            const ops = (Array.isArray(args.ops) ? args.ops : []).filter((op): op is CanvasAgentOp => Boolean(op && typeof op === "object" && (op as CanvasAgentOp).type));
            if (!ops.length) return JSON.stringify({ error: "ops 为空" });
            const destructive = pickDestructiveOps(ops);
            if (destructive.length && !(await deps.confirmDestructive(destructive))) {
                return JSON.stringify({ rejected: true, note: "用户拒绝了包含删除的操作，请不要重试删除" });
            }
            const beforeIds = new Set(deps.context.snapshot.nodes.map((node) => node.id));
            const next = deps.context.applyOps(ops);
            const createdIds = next.nodes.filter((node) => !beforeIds.has(node.id)).map((node) => node.id);
            return JSON.stringify({ ok: true, summary: summarizeCanvasAgentOps(ops), createdNodeIds: createdIds, nodeCount: next.nodes.length });
        }
        if (isSiteTool(name) && (name === "generation_get_status" || name === "prompts_search" || name === "assets_list")) {
            const result = await runSiteTool(name, args, deps.navigate, { canvasSnapshot: deps.context.snapshot });
            return JSON.stringify(result);
        }
        return JSON.stringify({ error: `未知工具 ${name}` });
    } catch (error) {
        return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
    }
}
