import { useUserStore } from "@buildingai/stores/user";

import type {
    OutlineResponse,
    ProviderListResponse,
    ProviderMutationResponse,
    OperationResult,
    RegenerateImageResponse,
    TaskDetailResponse,
    TaskImagesResponse,
    TaskListResponse,
} from "~/models";

/**
 * 获取插件标识
 */
const getPluginKey = () => {
    let pluginKey = "buildingai-xhs-creator";

    if (typeof window !== "undefined" && window.location) {
        const match = window.location.pathname.match(/\/extensions\/([^/]+)/);
        if (match?.[1]) {
            pluginKey = match[1];
        }
    }

    return pluginKey;
};

/**
 * 获取插件 Web API 基础路径
 */
const getPluginWebBaseUrl = () => {
    const prefix = import.meta.env?.VITE_APP_WEB_API_PREFIX || "/api/web";
    return `/${getPluginKey()}${prefix}`;
};

/**
 * 拼接 Web API 完整路径
 */
const buildWebApiUrl = (path: string) => `${getPluginWebBaseUrl()}${path}`;

/**
 * 用户余额与使用统计 API
 */
export const balanceApi = {
    /**
     * 获取用户使用统计（免费次数、余额等）
     */
    async getUserUsage() {
        return await usePluginWebGet<{
            success: boolean;
            data?: {
                freeUsageCount: number;
                freeUsageLimit: number;
                remainingFreeCount: number;
                userPower: number;
            };
            message?: string;
        }>("/balance/usage");
    },
};

/**
 * 小红书大纲生成API
 */
export const outlineApi = {
    /**
     * 生成大纲
     */
    async generate(topic: string, userImages?: string[]) {
        return await usePluginWebPost<OutlineResponse>("/outline", {
            topic,
            userImages,
        });
    },
};

/**
 * 小红书图片生成API
 */
export const imageApi = {
    /**
     * 批量生成图片（SSE，使用 POST 文本流，避免超长 URL）
     * @param isRegenerate 是否为批量重绘（全部重绘）
     */
    async generateImages(
        taskId: string,
        pages: any[],
        fullOutline: string,
        onEvent: (data: any) => void,
        isRegenerate?: boolean,
    ): Promise<void> {
        const url = buildWebApiUrl("/images/generate");

        // Get authentication token from user store
        const userStore = useUserStore();
        const token = userStore.token || userStore.temporaryToken;

        // Build headers with authentication
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        };

        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
                taskId,
                pages,
                fullOutline,
                isRegenerate,
            }),
        });

        if (!response.ok || !response.body) {
            throw new Error(`图片生成接口请求失败: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const events = buffer.split("\n\n");
            buffer = events.pop() || "";

            for (const rawEvent of events) {
                const trimmed = rawEvent.trim();
                if (!trimmed) continue;

                const lines = trimmed.split("\n");
                const dataLine = lines.find((line) => line.startsWith("data:"));
                if (!dataLine) continue;

                const jsonStr = dataLine.replace(/^data:\s*/, "");
                try {
                    const data = JSON.parse(jsonStr);
                    onEvent(data);
                } catch (error) {
                    console.error("解析图片生成 SSE 数据失败:", error, jsonStr);
                }
            }
        }
    },

    /**
     * 重新生成单张图片（流式SSE）
     */
    async regenerate(
        taskId: string,
        pageIndex: number,
        prompt: string,
        onEvent: (data: any) => void,
    ): Promise<void> {
        const url = buildWebApiUrl("/images/regenerate");

        // Get authentication token
        const userStore = useUserStore();
        const token = userStore.token || userStore.temporaryToken;

        // Build headers
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        };

        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
                taskId,
                pageIndex,
                prompt,
            }),
        });

        if (!response.ok || !response.body) {
            throw new Error(`重新生成接口请求失败: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const events = buffer.split("\n\n");
            buffer = events.pop() || "";

            for (const rawEvent of events) {
                const trimmed = rawEvent.trim();
                if (!trimmed) continue;

                const lines = trimmed.split("\n");
                const dataLine = lines.find((line) => line.startsWith("data:"));
                if (!dataLine) continue;

                const jsonStr = dataLine.replace(/^data:\s*/, "");
                try {
                    const data = JSON.parse(jsonStr);
                    onEvent(data);
                } catch (error) {
                    console.error("解析重新生成 SSE 数据失败:", error, jsonStr);
                }
            }
        }
    },

    /**
     * 获取图片的所有历史版本
     */
    async getImageVersions(taskId: string, pageIndex: number) {
        return await usePluginWebPost<{
            success: boolean;
            versions: Array<{
                version: number;
                imageUrl: string;
                prompt: string;
                generatedBy: string;
                powerAmount: number;
                isCurrent: boolean;
                createdAt: string;
            }>;
        }>("/images/versions/list", {
            taskId,
            pageIndex,
        });
    },

    /**
     * 恢复到指定版本
     */
    async restoreImageVersion(taskId: string, pageIndex: number, version: number) {
        return await usePluginWebPost<{
            success: boolean;
            imageUrl?: string;
            message?: string;
        }>("/images/versions/restore", {
            taskId,
            pageIndex,
            version,
        });
    },
};

/**
 * 任务管理API
 */
export const taskApi = {
    /**
     * 获取任务列表
     */
    async getTasks(page?: number, pageSize?: number) {
        const params = new URLSearchParams();
        if (page) params.append("page", page.toString());
        if (pageSize) params.append("pageSize", pageSize.toString());
        const query = params.toString();
        return await usePluginWebGet<TaskListResponse>(
            `/tasks${query ? `?${query}` : ""}`,
        );
    },

    /**
     * 获取任务详情
     */
    async getTask(id: string) {
        return await usePluginWebGet<TaskDetailResponse>(`/tasks/${id}`);
    },

    /**
     * 获取任务的所有图片
     */
    async getTaskImages(id: string) {
        return await usePluginWebGet<TaskImagesResponse>(`/tasks/${id}/images`);
    },

    /**
     * 打包下载任务所有图片（ZIP）
     */
    async downloadTaskZip(id: string): Promise<Blob> {
        // 加上时间戳避免浏览器/中间层缓存导致 304、下载到空 ZIP
        const url = buildWebApiUrl(`/tasks/${id}/download-zip?t=${Date.now()}`);

        // 复用用户鉴权逻辑
        const userStore = useUserStore();
        const token = userStore.token || userStore.temporaryToken;

        const headers: Record<string, string> = {};
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch(url, {
            method: "GET",
            headers,
        });

        if (!response.ok) {
            throw new Error(`打包下载失败: ${response.status}`);
        }

        return await response.blob();
    },

    /**
     * 获取任务生成进度（用于 SSE 断线重连）
     */
    async getTaskProgress(id: string) {
        return await usePluginWebGet<{
            success: boolean;
            progress: {
                taskId: string;
                status: string;
                totalPages: number;
                generatedPages: number;
                completedCount: number;
                failedCount: number;
                pendingCount: number;
                coverImageUrl?: string;
                errorMessage?: string;
            };
            images: Array<{
                pageIndex: number;
                pageType: string;
                status: string;
                imageUrl?: string;
                errorMessage?: string;
            }>;
        }>(`/tasks/${id}/progress`);
    },

    /**
     * 更新任务大纲（仅保存，不触发重新生成）
     */
    async updateOutline(
        taskId: string,
        pages: Array<{ index: number; type: "cover" | "content" | "summary"; content: string }>,
    ) {
        return await usePluginWebPut<{
            success: boolean;
            message: string;
            task: {
                id: string;
                pages: typeof pages;
                totalPages: number;
            };
        }>(`/tasks/${taskId}/outline`, { pages });
    },
};

/**
 * AI服务商配置API
 */
export const providerApi = {
    /**
     * 获取所有服务商
     */
    async getProviders() {
        return await usePluginConsoleGet<ProviderListResponse>("/providers");
    },

    /**
     * 创建服务商
     */
    async create(data: any) {
        return await usePluginConsolePost<ProviderMutationResponse>("/providers", data);
    },

    /**
     * 更新服务商
     */
    async update(id: string, data: any) {
        return await usePluginConsolePut<ProviderMutationResponse>(`/providers/${id}`, data);
    },

    /**
     * 激活服务商
     */
    async activate(id: string) {
        return await usePluginConsolePost<OperationResult>(`/providers/${id}/activate`);
    },

    /**
     * 删除服务商
     */
    async delete(id: string) {
        return await usePluginConsoleDelete<OperationResult>(`/providers/${id}`);
    },
};
