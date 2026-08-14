import { nanoid } from "nanoid";

import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";
import { CanvasNodeType } from "@/types/canvas";

// NYCATAI 模板画廊（P3）：精品工作流画布，一键克隆进本地（importProject）。
// 全部为纯节点+提示词（无媒体资产），克隆时现生成 id 避免冲突。

export type NycataiTemplate = {
    id: string;
    name: string;
    description: string;
    /** 一键克隆时构建全新 project 片段 */
    build: () => Partial<CanvasProject>;
};

type NodeSeed = { key: string; type: CanvasNodeType; title: string; x: number; y: number; w?: number; h?: number; prompt?: string; content?: string; model?: string };

function buildProject(title: string, seeds: NodeSeed[], edges: Array<[string, string]>): Partial<CanvasProject> {
    const ids = new Map(seeds.map((seed) => [seed.key, nanoid()]));
    const nodes: CanvasNodeData[] = seeds.map((seed) => ({
        id: ids.get(seed.key)!,
        type: seed.type,
        title: seed.title,
        position: { x: seed.x, y: seed.y },
        width: seed.w ?? (seed.type === CanvasNodeType.Image ? 320 : 320),
        height: seed.h ?? (seed.type === CanvasNodeType.Image ? 320 : 220),
        metadata: {
            status: "idle",
            ...(seed.prompt ? { prompt: seed.prompt, composerContent: seed.prompt } : {}),
            ...(seed.content ? { content: seed.content } : {}),
            ...(seed.model ? { model: seed.model } : {}),
        },
    }));
    const connections: CanvasConnection[] = edges.map(([from, to]) => ({ id: nanoid(), fromNodeId: ids.get(from)!, toNodeId: ids.get(to)! }));
    return { title, nodes, connections };
}

export const NYCATAI_TEMPLATES: NycataiTemplate[] = [
    {
        id: "poster-storyboard",
        name: "产品海报三分镜",
        description: "先定品牌视觉基调，再出两张风格一致的海报分镜。参考图连线到分镜保证一致性。",
        build: () =>
            buildProject("产品海报三分镜", [
                { key: "guide", type: CanvasNodeType.Text, title: "使用说明", x: 0, y: -280, content: "1) 把「品牌基调」节点的提示词改成你的产品与风格，点节点上的生成\n2) 基调图满意后，依次生成两个分镜（会自动引用基调图作参考）\n3) 也可以直接对左下角「编排助手」说：按这个模板帮我出图" },
                { key: "ref", type: CanvasNodeType.Image, title: "品牌基调", x: 0, y: 0, prompt: "【改成你的产品】品牌视觉基调参考图：高端商业摄影静物板，主色调×2、材质细节、光线氛围、留白构图，杂志级质感" },
                { key: "shot1", type: CanvasNodeType.Image, title: "分镜 1 · 主视觉", x: 380, y: -160, prompt: "沿用参考图的配色与光线：产品主视觉海报，居中构图，大量留白，顶部预留标题区" },
                { key: "shot2", type: CanvasNodeType.Image, title: "分镜 2 · 场景", x: 380, y: 220, prompt: "沿用参考图的配色与光线：产品使用场景特写，浅景深，自然光，生活化氛围" },
            ], [
                ["ref", "shot1"],
                ["ref", "shot2"],
            ]),
    },
    {
        id: "character-three-view",
        name: "角色三视图",
        description: "一张人设基准图延伸出正面/侧面/背面三视图，是角色一致性工作流的地基。",
        build: () =>
            buildProject("角色三视图", [
                { key: "base", type: CanvasNodeType.Image, title: "人设基准", x: 0, y: 120, prompt: "【描述你的角色】全身立绘，中性姿势，纯色背景，清晰展示服装/发型/配饰细节，角色设定图风格" },
                { key: "front", type: CanvasNodeType.Image, title: "正面", x: 380, y: -140, prompt: "同一角色的正面全身视图，保持服装发型配饰完全一致，纯色背景，角色设定三视图" },
                { key: "side", type: CanvasNodeType.Image, title: "侧面", x: 380, y: 240, prompt: "同一角色的侧面全身视图，保持服装发型配饰完全一致，纯色背景，角色设定三视图" },
                { key: "back", type: CanvasNodeType.Image, title: "背面", x: 760, y: 50, prompt: "同一角色的背面全身视图，保持服装发型配饰完全一致，纯色背景，角色设定三视图" },
            ], [
                ["base", "front"],
                ["base", "side"],
                ["base", "back"],
            ]),
    },
    {
        id: "grid-storyboard",
        name: "九宫格分镜",
        description: "剧本 → 一张 3×3 九宫格分镜图 → 用节点工具栏的「切分」拆成 9 个独立镜头节点。",
        build: () =>
            buildProject("九宫格分镜", [
                { key: "script", type: CanvasNodeType.Text, title: "剧本梗概", x: 0, y: 0, content: "【写下你的故事梗概，包含场景、角色、关键动作与情绪转折】" },
                { key: "grid", type: CanvasNodeType.Image, title: "九宫格分镜图", x: 380, y: -60, w: 420, h: 420, prompt: "根据上游剧本生成 3x3 九宫格分镜：按剧情顺序排布 9 个镜头，统一画风，每格含镜头语言（远/中/近景、俯仰角），格间留白色分隔线", model: "nycatai-image::nano-banana-pro-2k" },
                { key: "tip", type: CanvasNodeType.Text, title: "下一步", x: 380, y: 420, content: "生成后：选中九宫格图 → 节点工具栏「切分」→ 3×3 拆成 9 个镜头节点，即可逐个转视频" },
            ], [["script", "grid"]]),
    },
    {
        id: "ecommerce-set",
        name: "电商套图",
        description: "白底主图 + 场景图 + 细节图三件套，从同一产品参考延伸，风格统一。",
        build: () =>
            buildProject("电商套图", [
                { key: "product", type: CanvasNodeType.Image, title: "产品参考", x: 0, y: 100, prompt: "【描述你的产品】产品定妆照：白底，45 度角，清晰材质细节，均匀柔光" },
                { key: "main", type: CanvasNodeType.Image, title: "白底主图", x: 380, y: -140, prompt: "同一产品的电商白底主图：纯白背景，正面构图，商品居中占画面 80%，锐利细节" },
                { key: "scene", type: CanvasNodeType.Image, title: "场景图", x: 380, y: 220, prompt: "同一产品的使用场景图：生活化环境，自然光，产品为视觉焦点，浅景深" },
                { key: "detail", type: CanvasNodeType.Image, title: "细节特写", x: 760, y: 40, prompt: "同一产品的材质细节微距特写：突出工艺与质感，柔和侧光" },
            ], [
                ["product", "main"],
                ["product", "scene"],
                ["product", "detail"],
            ]),
    },
];
