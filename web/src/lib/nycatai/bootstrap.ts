import { createModelChannel, encodeChannelModel, modelOptionsFromChannels, useConfigStore, type ModelChannel } from "@/stores/use-config-store";

import { DEFAULT_GATEWAY, NYCATAI_CHANNEL_PREFIX, NYCATAI_GROUPS } from "./catalog";

// NYCATAI 接入：**本站只接入 nycatai 自己的接口与模型**。
// - 启动时无条件把渠道表规整为 3 个受管渠道（image/video/codex；260826 overseas 已并入 video），并移除任何外部/自建渠道；
// - 主站一键拉起时用 hash fragment 带 key（hash 不进 CF/nginx 访问日志，沿用 studio2 教训），读完立即抹除；
// - 用户已配置的 per-model 脚本与已有 key 在重注入时保留。

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

/** 需要从 URL 抹掉的键：我方接入参数 + 上游遗留的外部接口参数（本站只接 nycatai） */
const SCRUB_KEYS = [...Object.values(PARAM_ALIASES).flat(), "baseUrl", "baseurl"];

function scrubParams(hashParams: URLSearchParams, searchParams: URLSearchParams) {
    SCRUB_KEYS.forEach((alias) => {
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
            // 未带新 key 时沿用已注入的 key（刷新页面不会掉线）
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

/**
 * 规整渠道表：只保留 nycatai 受管渠道（外部/自建渠道一律移除），并把默认模型指向受管模型。
 * 无条件在启动时调用；`apiKey` 为空表示本次没有新密钥（沿用旧的）。
 */
export function ensureNycataiChannels(apiKey = "", gatewayRaw = "") {
    const gateway = (gatewayRaw || DEFAULT_GATEWAY).replace(/\/+$/, "");
    useConfigStore.setState((state) => {
        const channels = buildNycataiChannels(gateway, apiKey, state.config.channels);
        const defaults = Object.fromEntries(
            NYCATAI_GROUPS.filter((def) => def.defaultModel).map((def) => {
                const capability = def.models.find((model) => model.name === def.defaultModel)?.capability || "text";
                return [capability, encodeChannelModel(`${NYCATAI_CHANNEL_PREFIX}${def.group}`, def.defaultModel!)];
            }),
        );
        const managedValues = new Set(modelOptionsFromChannels(channels));
        // 之前选中的模型若已不在受管目录内（模型下架/改名），回落到默认模型，避免"点了必失败"
        const keepOrDefault = (current: string, fallback?: string) => (current && managedValues.has(current) ? current : fallback || "");
        return {
            config: {
                ...state.config,
                channels,
                models: modelOptionsFromChannels(channels),
                model: keepOrDefault(state.config.model, defaults.image),
                imageModel: keepOrDefault(state.config.imageModel, defaults.image),
                videoModel: keepOrDefault(state.config.videoModel, defaults.video),
                textModel: keepOrDefault(state.config.textModel, defaults.text),
                audioModel: keepOrDefault(state.config.audioModel, defaults.audio),
            },
        };
    });
}

/** 读取 URL 上的接入参数并应用；返回 true 表示本次带了密钥（调用方据此提示用户）。 */
export function applyNycataiBootstrap(): boolean {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#\/?/, "").replace(/^\?/, ""));
    const searchParams = new URLSearchParams(window.location.search);
    const apiKey = pickParam([hashParams, searchParams], "apiKey");
    const gateway = pickParam([hashParams, searchParams], "gateway");
    // 外部接口参数一律忽略（本站只接 nycatai），但仍从 URL 抹掉，避免留在地址栏
    const hasScrubTarget = SCRUB_KEYS.some((key) => hashParams.has(key) || searchParams.has(key));
    if (hasScrubTarget) scrubParams(hashParams, searchParams);
    ensureNycataiChannels(apiKey, gateway);
    return Boolean(apiKey);
}
