import { createModelChannel, encodeChannelModel, modelOptionsFromChannels, useConfigStore, type ModelChannel } from "@/stores/use-config-store";

import { DEFAULT_GATEWAY, NYCATAI_CHANNEL_PREFIX, NYCATAI_GROUPS } from "./catalog";

// NYCATAI 一键接入：主站 launchCanvas() 以 hash fragment 携带 key 打开本站。
// 优先读 hash（不进 CF 日志/分析，沿用 studio2 的教训），query 仅作兜底；两处参数读完立即抹除。
// 只增/改 `nycatai-` 前缀的受管渠道，用户自建渠道与受管渠道上已配置的 per-model 脚本一律保留。

const PARAM_ALIASES: Record<"apiKey" | "gateway", string[]> = {
    apiKey: ["apiKey", "apikey"],
    gateway: ["gateway"],
};

function pickParam(sources: URLSearchParams[], key: "apiKey" | "gateway") {
    for (const source of sources) {
        for (const alias of PARAM_ALIASES[key]) {
            const value = source.get(alias);
            if (value?.trim()) return value.trim();
        }
    }
    return "";
}

function scrubParams(hashParams: URLSearchParams, searchParams: URLSearchParams) {
    Object.values(PARAM_ALIASES)
        .flat()
        .forEach((alias) => {
            hashParams.delete(alias);
            searchParams.delete(alias);
        });
    const search = searchParams.size ? `?${searchParams}` : "";
    const hash = hashParams.size ? `#${hashParams}` : "";
    window.history.replaceState(null, "", `${window.location.pathname}${search}${hash}`);
}

export function buildNycataiChannels(gateway: string, apiKey: string, existing: ModelChannel[]): ModelChannel[] {
    return NYCATAI_GROUPS.map((def) => {
        const id = `${NYCATAI_CHANNEL_PREFIX}${def.group}`;
        const previous = existing.find((channel) => channel.id === id);
        return createModelChannel({
            id,
            name: def.channelName,
            baseUrl: `${gateway}/${def.group}`,
            apiKey: apiKey || previous?.apiKey || "",
            apiFormat: "openai",
            models: def.models.map((model) => ({
                name: model.name,
                capability: model.capability,
                script: previous?.models.find((item) => item.name === model.name)?.script,
            })),
        });
    });
}

/** Returns true when nycatai params were found and applied; the caller should skip the upstream param handler. */
export function applyNycataiBootstrap(): boolean {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#\/?/, "").replace(/^\?/, ""));
    const searchParams = new URLSearchParams(window.location.search);
    let apiKey = pickParam([hashParams], "apiKey");
    let gatewayRaw = pickParam([hashParams], "gateway");
    if (!apiKey && !gatewayRaw) {
        // query 兜底：`?baseUrl=` 组合是上游单渠道导入语义，必须让给上游处理，不能被我们劫持。
        if (searchParams.has("baseUrl") || searchParams.has("baseurl")) return false;
        apiKey = pickParam([searchParams], "apiKey");
        gatewayRaw = pickParam([searchParams], "gateway");
    }
    if (!apiKey && !gatewayRaw) return false;
    scrubParams(hashParams, searchParams);

    const gateway = (gatewayRaw || DEFAULT_GATEWAY).replace(/\/+$/, "");
    useConfigStore.setState((state) => {
        const managed = buildNycataiChannels(gateway, apiKey, state.config.channels);
        const others = state.config.channels.filter((channel) => !channel.id.startsWith(NYCATAI_CHANNEL_PREFIX));
        const channels = [...managed, ...others];
        const defaults = Object.fromEntries(
            NYCATAI_GROUPS.filter((def) => def.defaultModel).map((def) => {
                const capability = def.models.find((model) => model.name === def.defaultModel)?.capability || "text";
                return [capability, encodeChannelModel(`${NYCATAI_CHANNEL_PREFIX}${def.group}`, def.defaultModel!)];
            }),
        );
        return {
            config: {
                ...state.config,
                channels,
                models: modelOptionsFromChannels(channels),
                ...(defaults.image ? { model: defaults.image, imageModel: defaults.image } : {}),
                ...(defaults.video ? { videoModel: defaults.video } : {}),
                ...(defaults.text ? { textModel: defaults.text } : {}),
                ...(defaults.audio ? { audioModel: defaults.audio } : {}),
            },
        };
    });
    return true;
}
