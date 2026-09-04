import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Modal } from "antd";
import { LayoutTemplate, Sparkles } from "lucide-react";

import { NYCATAI_TEMPLATES } from "@/lib/nycatai/templates";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";

// NYCATAI 模板画廊（P3）：画布列表页入口，一键克隆模板进本地并直接打开。
// autoOpen = 首页「从模板开始」带 ?templates=1 进来时直接展开（等 store hydrated，避免克隆时机竞态）。
export function NycataiTemplateGallery({ disabled, autoOpen }: { disabled?: boolean; autoOpen?: boolean }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const importProject = useCanvasStore((state) => state.importProject);
    const [open, setOpen] = useState(false);

    // 不用 ref 记"已自动打开过"：StrictMode 会重跑 effect，ref 一旦置位就把真正的 setOpen 吃掉
    // （本仓踩过同款，见 NYCATAI-FORK-NOTES「已知限制」）。依赖只在 hydrated 翻转或 URL 变化时动，
    // 所以用户手动关掉后不会被重新打开。
    useEffect(() => {
        if (autoOpen && !disabled) setOpen(true);
    }, [autoOpen, disabled]);

    const clone = (templateId: string) => {
        const template = NYCATAI_TEMPLATES.find((item) => item.id === templateId);
        if (!template) return;
        const projectId = importProject(template.build());
        setOpen(false);
        navigate(`/canvas/${projectId}`);
    };

    return (
        <>
            <Button disabled={disabled} icon={<LayoutTemplate className="size-4" />} onClick={() => setOpen(true)}>
                {t("nycatai.templates.entry")}
            </Button>
            <Modal title={t("nycatai.templates.title")} open={open} onCancel={() => setOpen(false)} footer={null} centered width={720}>
                <p className="mb-4 text-xs text-stone-500 dark:text-stone-400">{t("nycatai.templates.hint")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                    {NYCATAI_TEMPLATES.map((template) => (
                        <button
                            key={template.id}
                            type="button"
                            onClick={() => clone(template.id)}
                            className="group flex flex-col gap-2 rounded-xl border border-stone-200 p-4 text-left transition hover:border-stone-400 hover:shadow-md dark:border-stone-700 dark:hover:border-stone-500"
                        >
                            <div className="flex items-center gap-2 text-sm font-semibold text-stone-800 dark:text-stone-100">
                                <Sparkles className="size-4 text-[#c4704b]" />
                                {template.name}
                            </div>
                            <p className="text-xs leading-5 text-stone-500 dark:text-stone-400">{template.description}</p>
                            <span className="mt-1 text-xs font-medium text-[#c4704b] opacity-0 transition group-hover:opacity-100">{t("nycatai.templates.clone")} →</span>
                        </button>
                    ))}
                </div>
            </Modal>
        </>
    );
}
