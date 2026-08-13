import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

// NYCATAI 点缀式换肤：中性色保持上游原样，主站陶土橙只落在重点位置 = 主按钮/链接/选中态。
// 色值来自主站 --c-accent/--c-accent-hover/--c-accent-light（assets/css/main.css）。
const nycataiAccent = {
    light: { primary: "#c4704b", hover: "#b5613e", onPrimary: "#ffffff", selectedBg: "rgba(196, 112, 75, 0.10)", selectedHoverBg: "rgba(196, 112, 75, 0.16)" },
    dark: { primary: "#d4815c", hover: "#e09570", onPrimary: "#1a1915", selectedBg: "rgba(212, 129, 92, 0.16)", selectedHoverBg: "rgba(212, 129, 92, 0.22)" },
};

const neutral = {
    light: {
        primary: "#171717",
        primaryHover: "#000000",
        primaryText: "#ffffff",
        elevatedBg: "#ffffff",
        itemHoverBg: "rgba(23, 23, 23, 0.06)",
        itemSelectedBg: "rgba(23, 23, 23, 0.1)",
        itemSelectedHoverBg: "rgba(23, 23, 23, 0.14)",
        itemText: "#171717",
        tableSelectedBg: "rgba(17, 17, 17, 0.05)",
        tableSelectedHoverBg: "rgba(17, 17, 17, 0.08)",
    },
    dark: {
        primary: "#fafafa",
        primaryHover: "#ffffff",
        primaryText: "#171717",
        elevatedBg: "#1c1917",
        itemHoverBg: "rgba(250, 250, 249, 0.08)",
        itemSelectedBg: "rgba(250, 250, 249, 0.12)",
        itemSelectedHoverBg: "rgba(250, 250, 249, 0.16)",
        itemText: "#fafafa",
        tableSelectedBg: "rgba(255, 255, 255, 0.08)",
        tableSelectedHoverBg: "rgba(255, 255, 255, 0.12)",
    },
};

export function getAntThemeConfig(dark: boolean): ThemeConfig {
    const color = dark ? neutral.dark : neutral.light;
    const accent = dark ? nycataiAccent.dark : nycataiAccent.light;

    return {
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        cssVar: { key: dark ? "infinite-canvas-dark" : "infinite-canvas-light" },
        token: {
            colorPrimary: accent.primary,
            colorInfo: accent.primary,
            colorLink: accent.primary,
            colorLinkHover: accent.hover,
            colorLinkActive: accent.primary,
            colorTextLightSolid: accent.onPrimary,
            colorBgElevated: color.elevatedBg,
            controlItemBgHover: color.itemHoverBg,
            controlItemBgActive: accent.selectedBg,
            controlItemBgActiveHover: accent.selectedHoverBg,
        },
        components: {
            Button: {
                primaryShadow: "none",
            },
            Dropdown: {
                colorBgElevated: color.elevatedBg,
                colorText: color.itemText,
                controlItemBgHover: color.itemHoverBg,
                controlItemBgActive: accent.selectedBg,
                controlItemBgActiveHover: accent.selectedHoverBg,
            },
            Menu: {
                popupBg: color.elevatedBg,
                itemActiveBg: accent.selectedBg,
                itemHoverBg: color.itemHoverBg,
                itemSelectedBg: accent.selectedBg,
                itemSelectedColor: color.itemText,
                darkPopupBg: neutral.dark.elevatedBg,
                darkItemHoverBg: neutral.dark.itemHoverBg,
                darkItemSelectedBg: nycataiAccent.dark.selectedBg,
                darkItemSelectedColor: neutral.dark.itemText,
            },
            Select: {
                optionActiveBg: color.itemHoverBg,
                optionSelectedBg: accent.selectedBg,
                optionSelectedColor: color.itemText,
            },
            Table: {
                rowSelectedBg: color.tableSelectedBg,
                rowSelectedHoverBg: color.tableSelectedHoverBg,
            },
        },
    };
}
