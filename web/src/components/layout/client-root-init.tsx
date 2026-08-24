import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { App } from "antd";
import { useTranslation } from "react-i18next";

import { applyNycataiBootstrap } from "@/lib/nycatai/bootstrap";
import { usePromptSourceScheduler } from "@/hooks/use-prompt-source-scheduler";

export function ClientRootInit({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const handledConfigParams = useRef(false);

    usePromptSourceScheduler();

    useEffect(() => {
        if (handledConfigParams.current) return;
        handledConfigParams.current = true;
        // NYCATAI: 本站只接入 nycatai 的接口与模型 —— 无条件把渠道表规整为受管渠道，
        // 并忽略上游原有的 ?baseUrl=/?apiKey= 外部接口导入路径。
        if (applyNycataiBootstrap()) message.success(t("config.importedDirectConfig"));
    }, [message, t]);

    return <>{children}</>;
}
