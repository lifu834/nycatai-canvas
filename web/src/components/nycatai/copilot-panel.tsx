import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Input, Tooltip } from "antd";
import { CircleStop, Pin, RotateCcw, Send, Sparkles, Trash2, Wand2, X } from "lucide-react";

import type { ResponsesInputItem } from "@/lib/nycatai/copilot/client";
import { resolveCopilotCredential, runCopilotTurn } from "@/lib/nycatai/copilot/loop";
import { getPinnedNodeIds, togglePinnedNodes } from "@/lib/nycatai/copilot/pins";
import type { CanvasAgentOp } from "@/lib/canvas/canvas-agent-ops";
import { summarizeCanvasAgentOps } from "@/lib/canvas/canvas-agent-ops";
import { useAgentStore } from "@/stores/use-agent-store";

// NYCATAI 云端编排助手面板：挂载在全局（app-top-nav），仅当画布页发布了 canvasContext 且凭据可用时显示。
// 会话不落盘（v1）；含删除的操作批次需用户在面板内确认。

type DisplayItem = { kind: "user" | "assistant" | "tool"; text: string };
type PendingConfirm = { ops: CanvasAgentOp[]; resolve: (approved: boolean) => void };

export function NycataiCopilot() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const canvasContext = useAgentStore((state) => state.canvasContext);
    const contextRef = useRef(canvasContext);
    contextRef.current = canvasContext;

    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<DisplayItem[]>([]);
    const [historyState, setHistoryState] = useState<ResponsesInputItem[]>([]);
    const [draft, setDraft] = useState("");
    const [running, setRunning] = useState(false);
    const [streaming, setStreaming] = useState("");
    const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
    const [pinnedCount, setPinnedCount] = useState(() => (canvasContext ? getPinnedNodeIds(canvasContext.snapshot.projectId).length : 0));
    const abortRef = useRef<AbortController | null>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const selectedIds = canvasContext?.snapshot.selectedNodeIds || [];
    const togglePin = () => {
        if (!canvasContext || !selectedIds.length) return;
        setPinnedCount(togglePinnedNodes(canvasContext.snapshot.projectId, selectedIds).length);
    };

    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }, [items, streaming, confirm]);

    const send = useCallback(async () => {
        const text = draft.trim();
        const context = contextRef.current;
        if (!text || running || !context) return;
        setDraft("");
        setItems((prev) => [...prev, { kind: "user", text }]);
        setRunning(true);
        setStreaming("");
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const result = await runCopilotTurn({
                userText: text,
                history: historyState,
                deps: {
                    get context() {
                        const current = contextRef.current;
                        if (!current) throw new Error(t("nycatai.copilot.contextLost"));
                        return current;
                    },
                    navigate,
                    confirmDestructive: (ops) => new Promise<boolean>((resolve) => setConfirm({ ops, resolve })),
                },
                callbacks: {
                    onDelta: (accumulated) => setStreaming(accumulated),
                    onToolStart: (name) => setItems((prev) => [...prev, { kind: "tool", text: t("nycatai.copilot.toolRunning", { name }) }]),
                },
                signal: controller.signal,
            });
            setHistoryState(result.history);
            if (result.finalText.trim()) setItems((prev) => [...prev, { kind: "assistant", text: result.finalText }]);
        } catch (error) {
            if (!controller.signal.aborted) {
                const message = error instanceof Error ? error.message : String(error);
                setItems((prev) => [...prev, { kind: "assistant", text: message === "copilot-credential-missing" ? t("nycatai.copilot.needKey") : `${t("nycatai.copilot.error")}: ${message}` }]);
            }
        } finally {
            setStreaming("");
            setRunning(false);
            abortRef.current = null;
        }
    }, [draft, historyState, navigate, running, t]);

    if (!canvasContext || !resolveCopilotCredential()) return null;

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                title={t("nycatai.copilot.open")}
                className="fixed bottom-5 left-5 z-40 flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 shadow-lg transition hover:border-stone-300 hover:shadow-xl dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
            >
                <Wand2 className="size-4 text-[#c4704b]" />
                {t("nycatai.copilot.title")}
            </button>
        );
    }

    return (
        <div className="fixed bottom-5 left-5 z-40 flex h-[540px] w-[400px] max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-900">
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2.5 dark:border-stone-800">
                <div className="flex items-center gap-2 text-sm font-semibold text-stone-800 dark:text-stone-100">
                    <Wand2 className="size-4 text-[#c4704b]" />
                    {t("nycatai.copilot.title")}
                </div>
                <div className="flex items-center gap-1">
                    <Tooltip title={selectedIds.length ? t("nycatai.copilot.pinSelected", { count: selectedIds.length }) : t("nycatai.copilot.pinHint")}>
                        <Button type="text" size="small" disabled={!selectedIds.length} onClick={togglePin} icon={<Pin className={`size-4 ${pinnedCount ? "text-[#c4704b]" : ""}`} />}>
                            {pinnedCount ? <span className="text-xs text-[#c4704b]">{pinnedCount}</span> : null}
                        </Button>
                    </Tooltip>
                    {canvasContext.canUndo ? (
                        <Tooltip title={t("nycatai.copilot.undo")}>
                            <Button type="text" size="small" icon={<RotateCcw className="size-4" />} onClick={() => canvasContext.undoOps()} />
                        </Tooltip>
                    ) : null}
                    <Tooltip title={t("nycatai.copilot.clear")}>
                        <Button type="text" size="small" icon={<Trash2 className="size-4" />} disabled={running} onClick={() => { setItems([]); setHistoryState([]); }} />
                    </Tooltip>
                    <Button type="text" size="small" icon={<X className="size-4" />} onClick={() => setOpen(false)} />
                </div>
            </div>

            <div ref={listRef} className="thin-scrollbar flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {items.length === 0 && !streaming ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-stone-400 dark:text-stone-500">
                        <Sparkles className="size-5" />
                        <p className="max-w-[260px] leading-5">{t("nycatai.copilot.empty")}</p>
                    </div>
                ) : null}
                {items.map((item, index) =>
                    item.kind === "tool" ? (
                        <div key={index} className="flex justify-center">
                            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] text-stone-500 dark:bg-stone-800 dark:text-stone-400">{item.text}</span>
                        </div>
                    ) : (
                        <div key={index} className={item.kind === "user" ? "flex justify-end" : "flex justify-start"}>
                            <div className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-6 ${item.kind === "user" ? "bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900" : "bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-100"}`}>{item.text}</div>
                        </div>
                    ),
                )}
                {streaming ? (
                    <div className="flex justify-start">
                        <div className="max-w-[85%] whitespace-pre-wrap rounded-xl bg-stone-100 px-3 py-2 text-sm leading-6 text-stone-800 dark:bg-stone-800 dark:text-stone-100">{streaming}</div>
                    </div>
                ) : null}
                {confirm ? (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-500/40 dark:bg-amber-500/10">
                        <p className="mb-2 font-medium text-amber-800 dark:text-amber-300">{t("nycatai.copilot.confirmTitle")}</p>
                        <p className="mb-2 text-stone-600 dark:text-stone-300">{summarizeCanvasAgentOps(confirm.ops)}</p>
                        <div className="flex gap-2">
                            <Button size="small" danger onClick={() => { confirm.resolve(true); setConfirm(null); }}>{t("nycatai.copilot.confirmApply")}</Button>
                            <Button size="small" onClick={() => { confirm.resolve(false); setConfirm(null); }}>{t("nycatai.copilot.confirmCancel")}</Button>
                        </div>
                    </div>
                ) : null}
            </div>

            <div className="border-t border-stone-200 p-3 dark:border-stone-800">
                <div className="flex items-end gap-2">
                    <Input.TextArea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onPressEnter={(event) => { if (!event.shiftKey) { event.preventDefault(); void send(); } }}
                        placeholder={t("nycatai.copilot.placeholder")}
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        disabled={running}
                    />
                    {running ? (
                        <Button type="default" icon={<CircleStop className="size-4" />} onClick={() => abortRef.current?.abort()} />
                    ) : (
                        <Button type="primary" icon={<Send className="size-4" />} disabled={!draft.trim()} onClick={() => void send()} />
                    )}
                </div>
            </div>
        </div>
    );
}
