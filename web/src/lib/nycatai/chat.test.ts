import { beforeEach, describe, expect, it } from "vitest";

import { defaultConfig, defaultWebdavSyncConfig, encodeChannelModel, useConfigStore } from "@/stores/use-config-store";

import { ensureNycataiChannels } from "./bootstrap";
import { buildChatInput, CHAT_CONTEXT_MESSAGES, CHAT_SYSTEM_PROMPT, clearChatThread, createChatMessage, loadChatThread, resolveChatCredential, saveChatThread, type ChatMessage } from "./chat";

function resetStore() {
    useConfigStore.setState({ config: structuredClone(defaultConfig), webdav: { ...defaultWebdavSyncConfig }, isConfigOpen: false });
}

function thread(count: number, role: ChatMessage["role"] = "user"): ChatMessage[] {
    return Array.from({ length: count }, (_, index) => createChatMessage(role, `m${index}`));
}

beforeEach(() => {
    localStorage.clear();
    resetStore();
});

describe("chat 会话落盘", () => {
    it("保存后能原样读回", () => {
        const messages = [createChatMessage("user", "写一条提示词"), createChatMessage("assistant", "好的", "gpt-5.5")];
        saveChatThread(messages);
        const loaded = loadChatThread();
        expect(loaded.map((item) => item.text)).toEqual(["写一条提示词", "好的"]);
        expect(loaded[1].model).toBe("gpt-5.5");
    });

    it("超出上限时保留最近 100 条", () => {
        const saved = saveChatThread(thread(140));
        expect(saved).toHaveLength(100);
        expect(saved[0].text).toBe("m40");
        expect(loadChatThread()).toHaveLength(100);
    });

    it("存储损坏或结构不对时返回空数组，不抛错", () => {
        localStorage.setItem("nycatai:chat-thread", "{broken");
        expect(loadChatThread()).toEqual([]);
        localStorage.setItem("nycatai:chat-thread", JSON.stringify({ not: "an array" }));
        expect(loadChatThread()).toEqual([]);
    });

    it("过滤掉字段缺失/角色非法的条目", () => {
        localStorage.setItem("nycatai:chat-thread", JSON.stringify([{ id: "a", role: "user", text: "ok" }, { id: "b", role: "system", text: "越权" }, { id: "c", text: "缺角色" }, null]));
        const loaded = loadChatThread();
        expect(loaded).toHaveLength(1);
        expect(loaded[0].id).toBe("a");
    });

    it("clear 后读回为空", () => {
        saveChatThread(thread(3));
        clearChatThread();
        expect(loadChatThread()).toEqual([]);
    });
});

describe("buildChatInput 上下文裁剪", () => {
    it("system 打头、本轮用户输入收尾", () => {
        const input = buildChatInput([createChatMessage("user", "上一句")], "这一句");
        expect(input[0]).toEqual({ role: "system", content: CHAT_SYSTEM_PROMPT });
        expect(input.at(-1)).toEqual({ role: "user", content: "这一句" });
        expect(input).toHaveLength(3);
    });

    it("历史超长时只带最近 N 条（按 token 计费，历史会重复付费）", () => {
        const input = buildChatInput(thread(60), "现在");
        expect(input).toHaveLength(CHAT_CONTEXT_MESSAGES + 2);
        expect(input[1]).toEqual({ role: "user", content: "m40" });
    });

    it("空历史也能组出合法 input", () => {
        expect(buildChatInput([], "你好")).toHaveLength(2);
    });
});

describe("resolveChatCredential", () => {
    it("未注入密钥时返回 null（UI 据此提示从主站进入）", () => {
        ensureNycataiChannels("");
        expect(resolveChatCredential()).toBeNull();
    });

    it("注入密钥后拿到对话渠道的 baseUrl 与真实 SKU 名", () => {
        ensureNycataiChannels("sk-test");
        useConfigStore.getState().updateConfig("textModel", encodeChannelModel("nycatai-codex", "gpt-5.5"));
        const credential = resolveChatCredential();
        expect(credential).not.toBeNull();
        expect(credential!.apiKey).toBe("sk-test");
        expect(credential!.model).toBe("gpt-5.5");
        expect(credential!.baseUrl).toContain("/codex");
    });
});
