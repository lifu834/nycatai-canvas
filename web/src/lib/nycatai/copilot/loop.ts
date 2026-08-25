import { resolveModelRequestConfig, useConfigStore } from "@/stores/use-config-store";

import { streamResponsesTurn, type ResponsesInputItem } from "./client";
import { COPILOT_TOOLS, runCopilotTool, type CopilotToolDeps } from "./tools";

// 编排助手对话循环：/v1/responses + function_call，工具执行后把结果回填 input 继续，直到无工具调用。
// 无状态全量重发（不依赖 previous_response_id，避免会话粘性/缓存语义耦合）。

const MAX_TOOL_ROUNDS = 12;

export const COPILOT_SYSTEM_PROMPT = [
    "你是 NYCATAI 无限画布的编排助手（云端）。用户在一个节点画布上创作：节点类型有 image/text/video/audio，连线表示下游生成时引用上游内容（文本作为提示词上下文、图片作为参考图）。",
    "你通过工具直接操作画布。原则：",
    "1. 动手前先 canvas_get_state 了解现状；新建内容摆放在已有节点右侧或下方空白处，不要重叠（图片节点约 320x320、文本约 320x220，横向间距 380、纵向 260）。",
    "2. 创建节点时把生成提示词写进 metadata.prompt；随后用 run_generation（带同样 prompt 与正确 mode）触发真实生成。生成是异步的：提交后用 generation_get_status 轮询，全部 succeeded 再继续下一步。",
    "3. 多镜头/分镜类任务：先建人设/风格参考（图片节点），再按镜头建节点并从参考节点连线过去，保证一致性。",
    "4. 提示词写作：具体、含风格/镜头/光线描述；视频提示词补充运动与节奏。",
    "5. 除非用户明确要求，不删除或覆盖用户已有节点。",
    "6. 快照里 pinned=true 的节点是用户钉住的角色/风格锚点：凡新建 image/video 节点，必须 connect_nodes 从每个钉住节点连线引用，除非用户明确说不需要。",
    "7. AI 放大：用户要放大/高清化某张图时，新建 image 节点、设 metadata.model 为 nycatai-image::nano-banana-pro-4k（输出真 4096²）与 metadata.size 为 3840x2160，从原图节点连线，run_generation 用提示词「忠实放大原图，严格保持内容构图色调不变，仅增强清晰度与材质细节」。",
    "8. 视频模型选择（用真实 SKU 名下单）：默认 kling-3.0（¥0.08/秒，3 线最稳）；kling-3.0-1080p ¥0.12；veo-3.1/-fast 时长只能 4/6/8 秒；Seedance 2.0 系 sd-2.0-720p/-1080p/-4k 与 sd-fast-720p、sd-mini-720p 时长 4–15 秒；**Seedance 2.5 系（sd-2.5-480p/-720p/-1080p）功能最强（4–30 秒、锁脸、参考视频、首尾帧），但三档都是单点供给，不要主动推荐，失败时引导用户改用 sd-2.0-720p**。seconds 必须是字符串。视频出片 3–7 分钟（30 秒片 5–10 分钟），耐心轮询。",
    "9. 回复用户时简洁说明做了什么、接下来在等什么；语言跟随用户。",
].join("\n");

export type CopilotTurnCallbacks = {
    onDelta?: (accumulated: string) => void;
    onToolStart?: (name: string) => void;
    onToolResult?: (name: string, resultJson: string) => void;
};

export function resolveCopilotCredential() {
    const { config } = useConfigStore.getState();
    const request = resolveModelRequestConfig(config, config.textModel || config.model);
    if (!request.baseUrl.trim() || !request.apiKey.trim()) return null;
    if (request.apiFormat !== "openai") return null;
    return { baseUrl: request.baseUrl, apiKey: request.apiKey, model: request.model };
}

/** 跑一轮用户输入（内部可能多轮工具调用）。返回累计后的对话历史与最终回复。 */
export async function runCopilotTurn(options: { userText: string; history: ResponsesInputItem[]; deps: CopilotToolDeps; callbacks?: CopilotTurnCallbacks; signal?: AbortSignal }): Promise<{ history: ResponsesInputItem[]; finalText: string }> {
    const credential = resolveCopilotCredential();
    if (!credential) throw new Error("copilot-credential-missing");
    const history: ResponsesInputItem[] = [...options.history, { role: "user", content: options.userText }];

    let finalText = "";
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const result = await streamResponsesTurn({
            ...credential,
            input: [{ role: "system", content: COPILOT_SYSTEM_PROMPT }, ...history],
            tools: COPILOT_TOOLS,
            onDelta: options.callbacks?.onDelta,
            signal: options.signal,
        });
        if (result.text.trim()) {
            history.push({ role: "assistant", content: result.text });
            finalText = result.text;
        }
        if (!result.toolCalls.length) break;
        if (round === MAX_TOOL_ROUNDS) {
            finalText = finalText || "已达到单轮工具调用上限，请继续对话推进。";
            break;
        }
        for (const call of result.toolCalls) {
            options.callbacks?.onToolStart?.(call.name);
            history.push({ type: "function_call", call_id: call.call_id, name: call.name, arguments: call.arguments });
            const output = await runCopilotTool(call.name, call.arguments, options.deps);
            options.callbacks?.onToolResult?.(call.name, output);
            history.push({ type: "function_call_output", call_id: call.call_id, output });
        }
    }
    return { history, finalText };
}
