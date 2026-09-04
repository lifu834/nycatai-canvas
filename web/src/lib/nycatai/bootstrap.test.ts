import { beforeEach, describe, expect, it } from "vitest";

import { defaultConfig, defaultWebdavSyncConfig, encodeChannelModel, useConfigStore, type ModelChannel } from "@/stores/use-config-store";

import { applyNycataiBootstrap } from "./bootstrap";
import { DEFAULT_GATEWAY, NYCATAI_GROUPS } from "./catalog";

function setUrl(pathAndParams: string) {
    window.history.replaceState(null, "", pathAndParams);
}

function resetStore() {
    useConfigStore.setState({
        config: structuredClone(defaultConfig),
        webdav: { ...defaultWebdavSyncConfig },
        isConfigOpen: false,
    });
}

function channels() {
    return useConfigStore.getState().config.channels;
}

function managedChannel(group: string): ModelChannel | undefined {
    return channels().find((channel) => channel.id === `nycatai-${group}`);
}

beforeEach(() => {
    localStorage.clear();
    resetStore();
    setUrl("/");
});

describe("applyNycataiBootstrap · 参数解析", () => {
    it("无参数时返回 false，但仍把渠道表规整为受管渠道（只接 nycatai）", () => {
        expect(applyNycataiBootstrap()).toBe(false);
        expect(channels()).toHaveLength(NYCATAI_GROUPS.length);
        expect(channels().every((channel) => channel.id.startsWith("nycatai-"))).toBe(true);
        expect(channels().find((channel) => channel.id === "default")).toBeUndefined();
    });

    it("hash 注入：建三个受管渠道并抹掉 hash", () => {
        setUrl("/#apiKey=sk-test-1&gateway=https://api.nycatai.com");
        expect(applyNycataiBootstrap()).toBe(true);
        expect(window.location.hash).toBe("");
        expect(window.location.search).toBe("");
        for (const def of NYCATAI_GROUPS) {
            const channel = managedChannel(def.group);
            expect(channel).toBeDefined();
            expect(channel!.baseUrl).toBe(`https://api.nycatai.com/${def.group}`);
            expect(channel!.apiKey).toBe("sk-test-1");
            expect(channel!.models.map((model) => model.name)).toEqual(def.models.map((model) => model.name));
        }
    });

    it("hash 大小写别名 apikey 可用", () => {
        setUrl("/#apikey=sk-alias");
        expect(applyNycataiBootstrap()).toBe(true);
        expect(managedChannel("image")!.apiKey).toBe("sk-alias");
    });

    it("省略 gateway 时用默认网关", () => {
        setUrl("/#apiKey=sk-x");
        applyNycataiBootstrap();
        expect(managedChannel("image")!.baseUrl).toBe(`${DEFAULT_GATEWAY}/image`);
    });

    it("gateway 尾斜杠被归一", () => {
        setUrl("/#apiKey=sk-x&gateway=https://vip.nycatai.com///");
        applyNycataiBootstrap();
        expect(managedChannel("video")!.baseUrl).toBe("https://vip.nycatai.com/video");
    });

    it("query 兜底可用，参数同样被抹除", () => {
        setUrl("/?apiKey=sk-query");
        expect(applyNycataiBootstrap()).toBe(true);
        expect(window.location.search).toBe("");
        expect(managedChannel("codex")!.apiKey).toBe("sk-query");
    });

    it("外部 baseUrl 一律忽略：只接 nycatai，且参数被抹掉", () => {
        setUrl("/?baseUrl=https://example.com/v1&apiKey=sk-external");
        expect(applyNycataiBootstrap()).toBe(true);
        // 密钥仍然接受（是 nycatai 的 key），但外部 baseUrl 绝不采用
        expect(managedChannel("image")!.baseUrl).toBe(`${DEFAULT_GATEWAY}/image`);
        expect(window.location.search).not.toContain("baseUrl=");
        expect(window.location.search).not.toContain("apiKey=");
    });

    it("hash 里我方参数之外的内容保留", () => {
        setUrl("/#apiKey=sk-x&foo=bar");
        applyNycataiBootstrap();
        expect(window.location.hash).toBe("#foo=bar");
    });
});

describe("applyNycataiBootstrap · 渠道合并", () => {
    it("默认模型指向受管渠道，audio 缺省不动", () => {
        setUrl("/#apiKey=sk-x");
        applyNycataiBootstrap();
        const { config } = useConfigStore.getState();
        expect(config.imageModel).toBe(encodeChannelModel("nycatai-image", "nano-banana-2-1k"));
        expect(config.videoModel).toBe(encodeChannelModel("nycatai-video", "kling-3.0-720p"));
        expect(config.textModel).toBe(encodeChannelModel("nycatai-codex", "gpt-5.5"));
        expect(config.audioModel).toBe(""); // audio 分组未接入，回落为空而非外部模型
        expect(config.model).toBe(config.imageModel);
    });

    it("二次注入只轮换受管渠道 key，不产生重复渠道", () => {
        setUrl("/#apiKey=sk-old");
        applyNycataiBootstrap();
        setUrl("/#apiKey=sk-new");
        applyNycataiBootstrap();
        expect(channels().filter((channel) => channel.id.startsWith("nycatai-"))).toHaveLength(NYCATAI_GROUPS.length);
        expect(managedChannel("image")!.apiKey).toBe("sk-new");
        expect(channels().find((channel) => channel.id === "default")).toBeUndefined();
    });

    it("用户自建/外部渠道会被移除（本站只接 nycatai）", () => {
        useConfigStore.setState((state) => ({
            config: {
                ...state.config,
                channels: [...state.config.channels, { id: "mine", name: "自建", baseUrl: "https://my.example.com", apiKey: "sk-mine", apiFormat: "openai" as const, models: [{ name: "my-model", capability: "text" as const }] }],
            },
        }));
        setUrl("/#apiKey=sk-x");
        applyNycataiBootstrap();
        expect(channels().find((channel) => channel.id === "mine")).toBeUndefined();
        expect(channels()).toHaveLength(NYCATAI_GROUPS.length);
    });

    it("受管渠道上用户配置的 per-model 脚本在重注入后保留", () => {
        setUrl("/#apiKey=sk-x");
        applyNycataiBootstrap();
        useConfigStore.setState((state) => ({
            config: {
                ...state.config,
                channels: state.config.channels.map((channel) => (channel.id === "nycatai-video" ? { ...channel, models: channel.models.map((model) => (model.name === "kling-3.0-720p" ? { ...model, script: "return {url: 'x'}" } : model)) } : channel)),
            },
        }));
        setUrl("/#apiKey=sk-rotated");
        applyNycataiBootstrap();
        const model = managedChannel("video")!.models.find((item) => item.name === "kling-3.0-720p");
        expect(model!.script).toBe("return {url: 'x'}");
        expect(managedChannel("video")!.apiKey).toBe("sk-rotated");
    });

    it("重复注入后模型选项列表无重复", () => {
        setUrl("/#apiKey=sk-a");
        applyNycataiBootstrap();
        setUrl("/#apiKey=sk-b");
        applyNycataiBootstrap();
        const options = useConfigStore.getState().config.models;
        expect(new Set(options).size).toBe(options.length);
    });
});

describe("只接 nycatai：外部参数清理", () => {
    it("hash 里的 baseUrl 也会被抹掉", () => {
        setUrl("/#apiKey=sk-x&baseUrl=https://evil.example.com");
        applyNycataiBootstrap();
        expect(window.location.hash).not.toContain("baseUrl");
        expect(window.location.hash).not.toContain("evil.example.com");
        expect(managedChannel("image")!.baseUrl).toBe(`${DEFAULT_GATEWAY}/image`);
    });
});
