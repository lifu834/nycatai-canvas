import { useTranslation } from "react-i18next";
import { Coins } from "lucide-react";

import { estimateImageCost, estimateVideoCost, formatCost, type CostEstimate } from "@/lib/nycatai/pricing";

// 生成按钮上方的预估费用行（TapNow 积分不透明的反面）。无价格数据时渲染 null，不打扰。
export function NycataiCostHint({ capability, model, count, seconds }: { capability: "image" | "video"; model: string; count?: string | number; seconds?: string | number }) {
    const { t } = useTranslation();
    let estimate: CostEstimate | null = null;
    if (capability === "image") {
        estimate = estimateImageCost(model, Number(count) || 1);
    } else {
        const parsed = Math.floor(Number(seconds));
        estimate = estimateVideoCost(model, Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, 20) : 6);
    }
    if (!estimate) return null;
    return (
        <div className="mb-2 flex items-center justify-center gap-1 text-xs text-stone-400 dark:text-stone-500">
            <Coins className="size-3.5" />
            <span>
                {t("nycatai.estCost")} ≈ {formatCost(estimate.amount)}
                {estimate.provisional ? t("nycatai.estMark") : ""}
            </span>
        </div>
    );
}
