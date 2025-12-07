import type { XhsPluginConfig } from "~/models";

export const apiGetXhsPluginConfig = async (): Promise<XhsPluginConfig> => {
    return await usePluginWebGet("/xhs-creator/config");
};

