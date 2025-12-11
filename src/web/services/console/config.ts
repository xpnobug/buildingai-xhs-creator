import type { XhsConfig } from "~/models";

/**
 * 获取小红书图文配置
 */
export const apiGetXhsConfig = async (): Promise<XhsConfig> => {
    const response = (await usePluginConsoleGet("/config")) as any;
    if (response?.data) return response.data as XhsConfig;
    if (response?.config) return response.config as XhsConfig;
    return response as XhsConfig;
};

/**
 * 更新小红书图文配置
 */
export const apiUpdateXhsConfig = async (
    id: string,
    data: Partial<
        Pick<
            XhsConfig,
            | "pluginName"
            | "coverImagePower"
            | "contentImagePower"
            | "outlinePower"
            | "freeUsageLimit"
            | "textModel"
            | "textModelId"
            | "imageModel"
            | "imageModelId"
            | "imageEndpointType"
            | "imageEndpointUrl"
            | "highConcurrency"
            | "homeTitle"
            | "quickStartTemplates"
            | "outlinePrompt"
            | "imagePrompt"
        >
    >,
) => {
    return await usePluginConsolePatch(`/config/${id}`, data);
};

