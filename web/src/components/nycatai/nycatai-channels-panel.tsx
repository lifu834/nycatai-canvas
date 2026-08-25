import { useTranslation } from "react-i18next";
import { Tag, Tooltip } from "antd";
import { Layers, Lock, ShieldCheck } from "lucide-react";

import { NYCATAI_GROUPS, NYCATAI_CHANNEL_PREFIX, nycataiModelLabel } from "@/lib/nycatai/catalog";
import { unitPriceLabel } from "@/lib/nycatai/pricing";
import type { ModelChannel } from "@/stores/use-config-store";

// NYCATAI 渠道面板（只读）：本站只接入 nycatai 自己的接口与模型，
// 因此替换掉上游"自建渠道"的增删改 UI，改为展示受管渠道 + 模型清单 + 真实单价。
// 密钥由主站一键拉起注入（hash fragment），用户无需也不应手工填写。

export function NycataiChannelsPanel({ channels }: { channels: ModelChannel[] }) {
    const { t } = useTranslation();
    const managed = NYCATAI_GROUPS.map((def) => ({
        def,
        channel: channels.find((item) => item.id === `${NYCATAI_CHANNEL_PREFIX}${def.group}`),
    }));
    const ready = managed.some((item) => item.channel?.apiKey.trim());

    return (
        <div>
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-stone-200 px-3 py-2.5 text-xs leading-5 text-stone-500 dark:border-stone-800 dark:text-stone-400">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#c4704b]" />
                <span>{ready ? t("nycatai.channels.ready") : t("nycatai.channels.needKey")}</span>
            </div>

            <div className="space-y-3">
                {managed.map(({ def, channel }) => (
                    <div key={def.group} className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                                <Layers className="size-4 shrink-0 text-stone-400" />
                                <span className="truncate text-sm font-semibold">{def.channelName}</span>
                                <Tooltip title={t("nycatai.channels.locked")}>
                                    <Lock className="size-3 shrink-0 text-stone-400" />
                                </Tooltip>
                            </div>
                            <span className="shrink-0 font-mono text-[11px] text-stone-400">/{def.group}</span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {def.models.map((model) => {
                                const price = unitPriceLabel(model.name);
                                return (
                                    <Tooltip key={model.name} title={[model.note, `SKU: ${model.name}`, model.redundancy ? `${model.redundancy} 条线路` : ""].filter(Boolean).join(" · ")}>
                                        <Tag className="!mr-0 !border-stone-200 !bg-transparent !text-xs dark:!border-stone-700">
                                            <span className="font-medium">{nycataiModelLabel(model.name)}</span>
                                            {price ? <span className="ml-1.5 text-stone-400">{price}</span> : null}
                                            {model.fragile ? <span className="ml-1 text-amber-500" title="供给单点">⚠</span> : null}
                                        </Tag>
                                    </Tooltip>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
