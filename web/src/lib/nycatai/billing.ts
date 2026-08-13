import { useCallback, useEffect, useRef, useState } from "react";

import { buildApiUrl, useConfigStore } from "@/stores/use-config-store";

import { NYCATAI_CHANNEL_PREFIX } from "./catalog";

// 该密钥累计消耗（P3 成本透明的另一半）。
// 说明：主站拉起用的创意工坊令牌是 unlimited_quota，new-api 的 subscription 端点对无限令牌
// 返回占位大数（controller/billing.go:56），拿不到真实余额；GetUsage 返回令牌累计已用（display 单位×100），
// 所以这里展示「该密钥已消耗」而非余额。余额展示需 new-api 侧暴露用户级额度端点，列为后续项。

type UsageState = { usage: number | null; loading: boolean; error: boolean };

export function findNycataiCredential(): { baseUrl: string; apiKey: string } | null {
    const { config } = useConfigStore.getState();
    const channel = config.channels.find((item) => item.id.startsWith(NYCATAI_CHANNEL_PREFIX) && item.apiKey.trim());
    return channel ? { baseUrl: channel.baseUrl, apiKey: channel.apiKey } : null;
}

export async function fetchTokenUsage(): Promise<number | null> {
    const credential = findNycataiCredential();
    if (!credential) return null;
    const response = await fetch(buildApiUrl(credential.baseUrl, "/dashboard/billing/usage"), {
        headers: { Authorization: `Bearer ${credential.apiKey}` },
    });
    if (!response.ok) throw new Error(`usage http ${response.status}`);
    const data = (await response.json()) as { total_usage?: number };
    if (typeof data.total_usage !== "number") throw new Error("usage shape");
    return data.total_usage / 100;
}

export function useNycataiUsage(refreshKey?: unknown): UsageState & { refresh: () => void } {
    const [state, setState] = useState<UsageState>({ usage: null, loading: false, error: false });
    const alive = useRef(true);
    // StrictMode 下 mount→cleanup→mount 复用同一 ref，必须在 effect 体内复位
    useEffect(() => {
        alive.current = true;
        return () => void (alive.current = false);
    }, []);
    const refresh = useCallback(() => {
        if (!findNycataiCredential()) {
            setState({ usage: null, loading: false, error: false });
            return;
        }
        setState((current) => ({ ...current, loading: true }));
        fetchTokenUsage()
            .then((usage) => alive.current && setState({ usage, loading: false, error: false }))
            .catch(() => alive.current && setState({ usage: null, loading: false, error: true }));
    }, []);
    useEffect(() => {
        refresh();
    }, [refresh, refreshKey]);
    return { ...state, refresh };
}
