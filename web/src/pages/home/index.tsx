import { ArrowRight, FileText, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { App, Button, Image, Tag } from "antd";
import { useNavigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";

import { fetchPrompts, type Prompt } from "@/services/api/prompts";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import i18n from "@/i18n";
import { cn } from "@/lib/utils";

/** 图墙展示条数，以及为了挑出「有封面」的候选而多取的池子大小 */
const SHOWCASE_SIZE = 12;
const SHOWCASE_POOL_SIZE = 36;

export default function IndexPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const canvasHydrated = useCanvasStore((state) => state.hydrated);
    const canvasProjects = useCanvasStore((state) => state.projects);
    const createProject = useCanvasStore((state) => state.createProject);
    const [promptShowcase, setPromptShowcase] = useState<Prompt[]>([]);
    const [brokenCovers, setBrokenCovers] = useState<string[]>([]);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [previewOpen, setPreviewOpen] = useState(false);

    useEffect(() => {
        // NYCATAI: 多取一些再按「有封面」优先排序 —— 提示词源可以没有封面图（我们自己的官方源就没有），
        // 直接把前 12 条塞进这个图墙会渲染出一片碎图。取 36 条挑出有图的顶到前面，不足再用文字卡补齐。
        void fetchPrompts({ pageSize: SHOWCASE_POOL_SIZE })
            .then((data) => {
                const withCover = data.items.filter((item) => item.coverUrl);
                const withoutCover = data.items.filter((item) => !item.coverUrl);
                setPromptShowcase([...withCover, ...withoutCover].slice(0, SHOWCASE_SIZE));
            })
            .catch((error) => message.error(error instanceof Error ? error.message : i18n.t("home.promptError")));
    }, [message]);

    // 建完直接进画布。不走上游的 /canvas?mode=new —— 那条是 Agent 入口，会顺带弹出 Agent 面板
    // （project.tsx: mode 为 new/recent/choose 时 openAgentPanel）。等 hydrated 再建，避免被持久化状态覆盖。
    const startNewCanvas = () => {
        if (!canvasHydrated) return;
        navigate(`/canvas/${createProject(t("canvas.defaultTitle", { count: canvasProjects.length + 1 }))}`);
    };

    // 封面可能是外链（GitHub raw 等），加载失败时退化成文字卡，不留碎图
    const usableCover = (item: Prompt) => Boolean(item.coverUrl) && !brokenCovers.includes(item.id);
    const previewItems = promptShowcase.filter(usableCover);

    return (
        <main className="relative h-full overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] text-stone-950 dark:bg-[radial-gradient(rgba(245,245,244,.18)_1px,transparent_1px)] dark:text-stone-100">
            <section className="relative mx-auto min-h-[calc(100vh-4rem)] max-w-7xl overflow-hidden px-6">
                <div className="pointer-events-none absolute left-[15%] top-24 size-20 rounded-full border border-dashed border-stone-200 dark:border-stone-800" />
                <div className="pointer-events-none absolute right-[23%] top-[48%] size-20 rounded-full border border-dashed border-stone-200 dark:border-stone-800" />

                {/* NYCATAI hero：左对齐主张 + 双 CTA，对齐主站欢迎页（标题是主张不是产品名，重点词用赤陶）。
                    原上游 hero 是居中 aurora 渐变大字 + 橙/天蓝高亮，两个高亮色都不是品牌色。 */}
                <div className="relative flex min-h-[420px] flex-col justify-center py-16 sm:py-20">
                    <h1 className="max-w-3xl text-balance text-4xl font-bold leading-[1.15] tracking-tight text-stone-950 sm:text-5xl lg:text-[52px] dark:text-stone-100">
                        <Trans i18nKey="home.heroTitle" components={{ accent: <span className="text-[#c4704b] dark:text-[#d4815c]" /> }} />
                    </h1>
                    <p className="mt-4 max-w-2xl text-[15px] leading-7 tracking-wide text-stone-500 dark:text-stone-400">{t("home.heroSub")}</p>
                    <div className="mt-7 flex flex-wrap items-center gap-3">
                        <Button type="primary" size="large" disabled={!canvasHydrated} onClick={startNewCanvas} icon={<Zap className="size-[18px]" />}>
                            {t("home.newCanvas")}
                        </Button>
                        <Button size="large" onClick={() => navigate("/canvas?templates=1")} icon={<ArrowRight className="size-4" />} iconPlacement="end">
                            {t("home.fromTemplate")}
                        </Button>
                    </div>
                </div>

                <section className="relative mx-auto mb-20 max-w-6xl border-t border-stone-200 pt-12 dark:border-stone-800">
                    <div className="mb-8 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-start">
                        <div />
                        <div className="max-w-2xl text-center">
                            <h2 className="text-3xl font-semibold text-stone-950 dark:text-stone-100">{t("home.showcaseTitle")}</h2>
                            <p className="mt-3 text-base leading-7 text-stone-500 dark:text-stone-400">{t("home.showcaseDescription")}</p>
                        </div>
                        <Button type="link" onClick={() => navigate("/prompts")} className="justify-self-center md:justify-self-end" icon={<ArrowRight className="size-4" />} iconPlacement="end">
                            {t("home.viewPrompts")}
                        </Button>
                    </div>
                    <div className="grid auto-rows-[210px] gap-4 md:grid-cols-4">
                        {promptShowcase.map((item, index) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                    const previewAt = previewItems.indexOf(item);
                                    if (previewAt < 0) return navigate("/prompts");
                                    setPreviewIndex(previewAt);
                                    setPreviewOpen(true);
                                }}
                                className={cn(
                                    "group relative cursor-pointer overflow-hidden border border-stone-200 bg-stone-100 text-left dark:border-stone-800 dark:bg-stone-900",
                                    index === 0 && "md:col-span-2 md:row-span-2",
                                    index === 3 && "md:col-span-2",
                                )}
                            >
                                {usableCover(item) ? (
                                    <img
                                        src={item.coverUrl}
                                        alt={item.title}
                                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                                        onError={() => setBrokenCovers((ids) => (ids.includes(item.id) ? ids : [...ids, item.id]))}
                                    />
                                ) : (
                                    <div className="grid h-full w-full place-items-center bg-gradient-to-br from-stone-200 to-stone-100 text-stone-400 transition duration-500 group-hover:scale-[1.03] dark:from-stone-800 dark:to-stone-900 dark:text-stone-600">
                                        <FileText className="size-8" />
                                    </div>
                                )}
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent p-4 text-white">
                                    <div className="mb-2 flex flex-wrap gap-1.5">
                                        {item.tags.slice(0, 2).map((tag) => (
                                            <Tag key={tag} variant="filled" className="m-0 bg-white/15 text-[11px] text-white backdrop-blur">
                                                {tag}
                                            </Tag>
                                        ))}
                                    </div>
                                    <h3 className="text-sm font-medium">{item.title}</h3>
                                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/75">{item.prompt}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>
            </section>
            <Image.PreviewGroup
                preview={{
                    open: previewOpen,
                    current: previewIndex,
                    onOpenChange: setPreviewOpen,
                    onChange: setPreviewIndex,
                }}
            >
                <div className="hidden">
                    {previewItems.map((item) => (
                        <Image key={item.id} src={item.coverUrl} alt={item.title} />
                    ))}
                </div>
            </Image.PreviewGroup>
        </main>
    );
}
