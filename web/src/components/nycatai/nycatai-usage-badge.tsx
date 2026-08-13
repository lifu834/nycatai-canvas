import { useTranslation } from "react-i18next";
import { RefreshCw, Wallet } from "lucide-react";

import { useNycataiUsage } from "@/lib/nycatai/billing";
import { formatCost } from "@/lib/nycatai/pricing";

// 顶栏「该密钥已消耗」徽标：仅在存在带 key 的 nycatai 受管渠道时渲染，点击刷新。
// 注：创意工坊令牌为无限额度，new-api 对其不返回真实余额，故展示累计消耗（详见 lib/nycatai/billing.ts 注释）。
export function NycataiUsageBadge() {
    const { t } = useTranslation();
    const { usage, loading, error, refresh } = useNycataiUsage();
    if (usage === null && !loading && !error) return null;
    return (
        <button
            type="button"
            onClick={refresh}
            title={t("nycatai.usageTitle")}
            className="flex items-center gap-1.5 rounded-full border border-stone-200 px-2.5 py-1 text-xs text-stone-500 transition-colors hover:border-stone-300 hover:text-stone-700 dark:border-stone-700 dark:text-stone-400 dark:hover:border-stone-500 dark:hover:text-stone-200"
        >
            {loading ? <RefreshCw className="size-3 animate-spin" /> : <Wallet className="size-3" />}
            <span>{error ? t("nycatai.usageError") : `${t("nycatai.usage")} ${usage === null ? "…" : formatCost(usage)}`}</span>
        </button>
    );
}
