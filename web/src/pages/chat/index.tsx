import { useCallback, useEffect, useRef, useState } from "react";
import { App, Button, Input, Tooltip } from "antd";
import { CircleStop, Copy, FolderPlus, MessageSquare, Send, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@/components/model-picker";
import { useCopyText } from "@/hooks/use-copy-text";
import { billingRuleLabel, unitPriceLabel } from "@/lib/nycatai/pricing";
import { clearChatThread, createChatMessage, loadChatThread, resolveChatCredential, runChatTurn, saveChatThread, type ChatMessage } from "@/lib/nycatai/chat";
import { useAssetStore } from "@/stores/use-asset-store";
import { modelOptionName, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";

// NYCATAI 简易对话页：纯文本一问一答（无工具、不碰画布）。
// 画布编排请用左下角「编排助手」；这里只做提示词/文案的快速打磨。

const SUGGESTION_KEYS = ["poster", "storyboard", "video", "polish"] as const;

export default function ChatPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const config = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    const addAsset = useAssetStore((state) => state.addAsset);
    const copyText = useCopyText();

    const [messages, setMessages] = useState<ChatMessage[]>(() => loadChatThread());
    const [draft, setDraft] = useState("");
    const [running, setRunning] = useState(false);
    const [streaming, setStreaming] = useState("");
    const [elapsed, setElapsed] = useState(0);
    const abortRef = useRef<AbortController | null>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const model = config.textModel || config.model;
    const sku = modelOptionName(model);
    const price = unitPriceLabel(sku);
    const rule = billingRuleLabel(sku);

    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }, [messages, streaming]);

    // 卸载时中断在途请求，避免离开页面后仍在烧 token
    useEffect(() => () => abortRef.current?.abort(), []);

    // 号池排队 + 推理耗时波动极大（同一个问题实测 4s ~ 110s 都出现过），
    // 只显示"思考中…"会让人以为卡死，所以把已等待秒数摆出来。
    useEffect(() => {
        if (!running) return;
        const startedAt = Date.now();
        setElapsed(0);
        const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
        return () => window.clearInterval(timer);
    }, [running]);

    const commit = useCallback((next: ChatMessage[]) => {
        setMessages(saveChatThread(next));
    }, []);

    const send = useCallback(
        async (text: string) => {
            const userText = text.trim();
            if (!userText || running) return;
            if (!resolveChatCredential()) {
                message.warning(t("chat.needKey"));
                return;
            }
            setDraft("");
            const history = messages;
            const withUser = [...history, createChatMessage("user", userText)];
            commit(withUser);
            setRunning(true);
            setStreaming("");
            const controller = new AbortController();
            abortRef.current = controller;
            try {
                const result = await runChatTurn({ history, userText, onDelta: setStreaming, signal: controller.signal });
                if (result.text.trim()) commit([...withUser, createChatMessage("assistant", result.text, result.model)]);
            } catch (error) {
                if (!controller.signal.aborted) {
                    const detail = error instanceof Error ? error.message : String(error);
                    message.error(detail === "chat-credential-missing" ? t("chat.needKey") : `${t("chat.error")}: ${detail}`);
                }
            } finally {
                setStreaming("");
                setRunning(false);
                abortRef.current = null;
            }
        },
        [commit, message, messages, running, t],
    );

    const saveAsset = (item: ChatMessage) => {
        addAsset({ kind: "text", title: item.text.slice(0, 24) || t("chat.title"), coverUrl: "", tags: [], source: t("chat.title"), data: { content: item.text }, metadata: { source: "chat", model: item.model || "" } });
        message.success(t("common.addedToAssets"));
    };

    const clearAll = () => {
        abortRef.current?.abort();
        clearChatThread();
        setMessages([]);
        setStreaming("");
    };

    return (
        <div className="flex h-full min-h-0 flex-col bg-background text-stone-800 dark:text-stone-100">
            <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 py-4 dark:border-stone-800">
                    <div className="min-w-0">
                        <h1 className="flex items-center gap-2 text-lg font-semibold text-stone-950 dark:text-stone-100">
                            <MessageSquare className="size-4 text-[#c4704b]" />
                            {t("chat.title")}
                        </h1>
                        <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">{t("chat.subtitle")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <ModelPicker config={config} value={model} onChange={(value) => updateConfig("textModel", value)} capability="text" onMissingConfig={() => setConfigDialogOpen(true)} />
                        <Tooltip title={t("chat.clear")}>
                            <Button type="text" icon={<Trash2 className="size-4" />} disabled={!messages.length && !running} onClick={clearAll} />
                        </Tooltip>
                    </div>
                </div>

                {price ? (
                    <div className="pt-2 text-right text-[11px] leading-5 text-stone-400 dark:text-stone-500">
                        {price}
                        {rule ? ` · ${rule}` : ""}
                    </div>
                ) : null}

                <div ref={listRef} className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
                    {!messages.length && !streaming ? (
                        <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                            <p className="max-w-md text-sm leading-6 text-stone-500 dark:text-stone-400">{t("chat.empty")}</p>
                            <div className="flex flex-wrap justify-center gap-2">
                                {SUGGESTION_KEYS.map((key) => {
                                    const suggestion = t(`chat.suggestions.${key}`);
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => void send(suggestion)}
                                            className="rounded-full border border-stone-200 px-3 py-1.5 text-xs text-stone-600 transition hover:border-[#c4704b] hover:text-[#c4704b] dark:border-stone-700 dark:text-stone-300"
                                        >
                                            {suggestion}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ) : null}

                    {messages.map((item) =>
                        item.role === "user" ? (
                            <div key={item.id} className="flex justify-end">
                                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-stone-800 px-4 py-2.5 text-sm leading-6 text-white dark:bg-stone-100 dark:text-stone-900">{item.text}</div>
                            </div>
                        ) : (
                            <div key={item.id} className="group flex flex-col items-start gap-1">
                                <div className="max-w-[92%] whitespace-pre-wrap rounded-2xl bg-stone-100 px-4 py-2.5 text-sm leading-6 text-stone-800 dark:bg-stone-800 dark:text-stone-100">{item.text}</div>
                                <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                                    <Button type="text" size="small" icon={<Copy className="size-3.5" />} onClick={() => copyText(item.text)} />
                                    <Button type="text" size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => saveAsset(item)}>
                                        <span className="text-xs">{t("common.addToAssets")}</span>
                                    </Button>
                                </div>
                            </div>
                        ),
                    )}

                    {streaming ? (
                        <div className="flex justify-start">
                            <div className="max-w-[92%] whitespace-pre-wrap rounded-2xl bg-stone-100 px-4 py-2.5 text-sm leading-6 text-stone-800 dark:bg-stone-800 dark:text-stone-100">{streaming}</div>
                        </div>
                    ) : null}
                    {running && !streaming ? <div className="text-xs text-stone-400 dark:text-stone-500">{t("chat.thinking", { seconds: elapsed })}</div> : null}
                </div>

                <div className="border-t border-stone-200 py-3 dark:border-stone-800">
                    <div className="flex items-end gap-2">
                        <Input.TextArea
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            onPressEnter={(event) => {
                                // 中文输入法用 Enter 上屏候选词，此时不能当成"发送"
                                if (event.shiftKey || event.nativeEvent.isComposing) return;
                                event.preventDefault();
                                void send(draft);
                            }}
                            placeholder={t("chat.placeholder")}
                            autoSize={{ minRows: 1, maxRows: 6 }}
                            disabled={running}
                        />
                        {running ? (
                            <Button icon={<CircleStop className="size-4" />} onClick={() => abortRef.current?.abort()} />
                        ) : (
                            <Button type="primary" icon={<Send className="size-4" />} disabled={!draft.trim()} onClick={() => void send(draft)} />
                        )}
                    </div>
                    <p className="mt-2 text-[11px] text-stone-400 dark:text-stone-500">{t("chat.footerHint")}</p>
                </div>
            </div>
        </div>
    );
}
