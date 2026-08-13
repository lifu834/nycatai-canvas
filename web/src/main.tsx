import React from "react";
import { createRoot } from "react-dom/client";
import "antd/dist/reset.css";
import "streamdown/styles.css";
import "./styles/globals.css";
// NYCATAI: 品牌换肤，必须在 globals.css 之后加载以覆盖变量
import "./styles/nycatai-theme.css";
import { RouterProvider } from "react-router-dom";

import { AppProviders } from "@/components/layout/app-providers";
import "@/i18n";
import { initAnalytics } from "@/lib/analytics";
import { router } from "@/router";

initAnalytics();

// NYCATAI: 与主站一致的字体栈（tailwind.config.ts fontFamily.sans）
document.body.style.fontFamily = '"Inter",system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';

createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <AppProviders>
            <RouterProvider router={router} />
        </AppProviders>
    </React.StrictMode>,
);
