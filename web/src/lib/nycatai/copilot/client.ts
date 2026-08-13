import { buildApiUrl } from "@/stores/use-config-store";

// 轻量 /v1/responses 流式客户端（带 function_call 解析）。
// 上游 image.ts 里有同协议实现但未导出，为守薄 fork 纪律在此独立实现（协议知识来源：OpenAI Responses SSE）。

export type ResponsesToolDef = { type: "function"; name: string; description?: string; parameters: Record<string, unknown> };
export type ResponsesToolCall = { call_id: string; name: string; arguments: string };
export type ResponsesInputItem = { role: "system" | "user" | "assistant"; content: string } | { type: "function_call"; call_id: string; name: string; arguments: string } | { type: "function_call_output"; call_id: string; output: string };
export type ResponsesTurnResult = { text: string; toolCalls: ResponsesToolCall[] };

type OutputItem = { type?: string; call_id?: string; id?: string; name?: string; arguments?: string; content?: Array<{ type?: string; text?: string }> };

/** 从 response.completed 的 output 数组提取文本与工具调用（导出以便单测） */
export function parseResponseOutput(output: OutputItem[] | undefined): ResponsesTurnResult {
    const items = Array.isArray(output) ? output : [];
    const toolCalls = items
        .filter((item) => item.type === "function_call" && item.name)
        .map((item) => ({ call_id: item.call_id || item.id || "", name: item.name!, arguments: item.arguments || "{}" }));
    const text = items
        .filter((item) => item.type === "message")
        .flatMap((item) => item.content || [])
        .filter((part) => part.type === "output_text" && part.text)
        .map((part) => part.text)
        .join("");
    return { text, toolCalls };
}

/** 逐行解析 SSE data 载荷（导出以便单测） */
export function extractSseDataLines(buffer: string): { events: string[]; rest: string } {
    const events: string[] = [];
    const parts = buffer.split("\n");
    const rest = parts.pop() ?? "";
    for (const line of parts) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data:")) events.push(trimmed.slice(5).trim());
    }
    return { events, rest };
}

export async function streamResponsesTurn(options: {
    baseUrl: string;
    apiKey: string;
    model: string;
    input: ResponsesInputItem[];
    tools: ResponsesToolDef[];
    onDelta?: (accumulated: string) => void;
    signal?: AbortSignal;
}): Promise<ResponsesTurnResult> {
    const response = await fetch(buildApiUrl(options.baseUrl, "/responses"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream", Authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify({ model: options.model, input: options.input, tools: options.tools, stream: true }),
        signal: options.signal,
    });
    if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => "");
        throw new Error(`responses http ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamedText = "";
    let completed: ResponsesTurnResult | null = null;
    let failure: string | null = null;

    const handleEvent = (raw: string) => {
        if (!raw || raw === "[DONE]") return;
        let data: Record<string, unknown>;
        try {
            data = JSON.parse(raw);
        } catch {
            return;
        }
        const type = String(data.type || "");
        if (type === "response.output_text.delta" && typeof data.delta === "string") {
            streamedText += data.delta;
            options.onDelta?.(streamedText);
        } else if (type === "response.completed") {
            const payload = data.response as { output?: OutputItem[] } | undefined;
            completed = parseResponseOutput(payload?.output);
        } else if (type === "response.failed" || type === "error") {
            const payload = data.response as { error?: { message?: string } } | undefined;
            failure = payload?.error?.message || (data.error as { message?: string } | undefined)?.message || "response failed";
        }
    };

    for (;;) {
        const { done, value } = await reader.read();
        if (value) {
            buffer += decoder.decode(value, { stream: true });
            const { events, rest } = extractSseDataLines(buffer);
            buffer = rest;
            events.forEach(handleEvent);
        }
        if (done) break;
    }
    extractSseDataLines(buffer + "\n").events.forEach(handleEvent);

    if (failure) throw new Error(failure);
    if (completed) return { text: (completed as ResponsesTurnResult).text || streamedText, toolCalls: (completed as ResponsesTurnResult).toolCalls };
    return { text: streamedText, toolCalls: [] };
}
