import { nanoid } from "nanoid";

import { resolveModelRequestConfig, useConfigStore } from "@/stores/use-config-store";

import { streamResponsesTurn, type ResponsesInputItem } from "./copilot/client";

// 简易对话（/chat 页）：与「编排助手」的区别是**不带任何工具**——纯文本一问一答，
// 用来写提示词、拆分镜、改文案，再复制到生图/视频工作台或画布里用。
// 走同一条 /v1/responses 流式通道（copilot/client.ts），tools 传空数组。
//
// 两条成本纪律（文本模型按 token 计费，历史会重复计费）：
// - 上行只带最近 CHAT_CONTEXT_MESSAGES 条，长会话不会线性烧钱；
// - 落盘只留 MAX_STORED_MESSAGES 条，localStorage 不会无限膨胀。

const STORAGE_KEY = "nycatai:chat-thread";
const MAX_STORED_MESSAGES = 100;

/** 单次请求上行携带的历史条数上限（不含本轮用户输入与 system） */
export const CHAT_CONTEXT_MESSAGES = 20;

export type ChatRole = "user" | "assistant";
export type ChatMessage = { id: string; role: ChatRole; text: string; model?: string; createdAt: number };

export const CHAT_SYSTEM_PROMPT = [
    "你是 NYCATAI 无限画布的对话助手。用户在这里做创意生产：写生图/视频提示词、拆分镜、改文案、定风格。",
    "原则：",
    "1. 直接给可用结果，不要先复述需求再动手；提示词类回答直接给成品，必要时再补一句改动建议。",
    "2. 写生图提示词时给足主体、风格、构图、光线、镜头；写视频提示词时补运动与节奏。",
    "3. 你只能对话，不能操作画布或触发生成。用户要你直接在画布上建节点、连线、出图时，告诉他改用左下角的「编排助手」。",
    "4. 语言跟随用户。",
].join("\n");

export function createChatMessage(role: ChatRole, text: string, model?: string): ChatMessage {
    return { id: nanoid(), role, text, model, createdAt: Date.now() };
}

function isChatMessage(value: unknown): value is ChatMessage {
    const record = value as Partial<ChatMessage> | null;
    return Boolean(record && typeof record === "object" && typeof record.id === "string" && typeof record.text === "string" && (record.role === "user" || record.role === "assistant"));
}

/** 读取落盘会话；存储损坏/被清时返回空数组，不抛错。 */
export function loadChatThread(): ChatMessage[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isChatMessage).map((item) => ({ ...item, createdAt: Number(item.createdAt) || Date.now() }));
    } catch {
        return [];
    }
}

/** 落盘会话（尾部截断到 MAX_STORED_MESSAGES）；返回实际保存的列表。 */
export function saveChatThread(messages: ChatMessage[]): ChatMessage[] {
    const trimmed = messages.slice(-MAX_STORED_MESSAGES);
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
        // 存储满/隐私模式时静默失败：会话只影响体验，不影响正确性
    }
    return trimmed;
}

export function clearChatThread() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // 同上
    }
}

/** 组装上行 input：system + 最近若干条历史 + 本轮输入 */
export function buildChatInput(history: ChatMessage[], userText: string): ResponsesInputItem[] {
    const recent = history.slice(-CHAT_CONTEXT_MESSAGES);
    return [{ role: "system", content: CHAT_SYSTEM_PROMPT }, ...recent.map((item) => ({ role: item.role, content: item.text })), { role: "user", content: userText }];
}

/**
 * 解析当前对话凭据。与 copilot 的同名函数刻意各写一份：简易对话不该依赖编排助手的工具图。
 * 返回 null 表示未注入密钥或渠道非 openai 协议，调用方应提示用户从主站一键进入。
 */
export function resolveChatCredential(): { baseUrl: string; apiKey: string; model: string } | null {
    const { config } = useConfigStore.getState();
    const request = resolveModelRequestConfig(config, config.textModel || config.model);
    if (!request.baseUrl.trim() || !request.apiKey.trim()) return null;
    if (request.apiFormat !== "openai") return null;
    return { baseUrl: request.baseUrl, apiKey: request.apiKey, model: request.model };
}

/** 跑一轮对话，流式回调 onDelta，返回完整回复文本。 */
export async function runChatTurn(options: { history: ChatMessage[]; userText: string; onDelta?: (accumulated: string) => void; signal?: AbortSignal }): Promise<{ text: string; model: string }> {
    const credential = resolveChatCredential();
    if (!credential) throw new Error("chat-credential-missing");
    const result = await streamResponsesTurn({
        ...credential,
        input: buildChatInput(options.history, options.userText),
        tools: [],
        onDelta: options.onDelta,
        signal: options.signal,
    });
    return { text: result.text, model: credential.model };
}
