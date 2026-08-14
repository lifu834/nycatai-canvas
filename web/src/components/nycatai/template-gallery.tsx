import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Modal } from "antd";
import { LayoutTemplate, Sparkles } from "lucide-react";

import { NYCATAI_TEMPLATES } from "@/lib/nycatai/templates";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";

// NYCATAI 模板画廊（P3）：画布列表页入口，一键克隆模板进本地并直接打开。
export function NycataiTemplateGallery({ disabled }: { disabled?: boolean }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const importProject = useCanvasStore((state) => state.importProject);
    const [open, setOpen] = useState(false);

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
