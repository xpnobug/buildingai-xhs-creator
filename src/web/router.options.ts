/**
 * Router Options
 * @description Custom router configuration for plugin
 * @see https://nuxt.com/docs/4.x/guide/recipes/custom-routing#using-routeroptions
 */

import type { PluginMenuItem } from "@buildingai/layouts/console/menu";
import { defineRoutesConfig } from "@buildingai/nuxt/router";

/**
 * Console menu configuration
 * @description Define menu structure - supports nested items
 */
export const consoleMenu: PluginMenuItem[] = [
    {
        name: "生成记录",
        path: "",
        icon: "i-lucide-video",
        component: () => import("~/pages/console/index.vue"),
        sort: 1,
    },
    {
        name: "应用配置",
        path: "config",
        icon: "i-lucide-settings",
        component: () => import("~/pages/console/config.vue"),
        sort: 2,
    },
];

export default defineRoutesConfig(consoleMenu);
