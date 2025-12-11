import { defineStore } from "pinia";

import { imageApi, taskApi } from "~/services/xhs/api";
import { useOutlineStore, extractImagePrompt } from "./outline";

/**
 * 图片生成状态管理 Store
 * 负责图片生成进度、SSE 通信、重试逻辑
 */
export const useImageGenerationStore = defineStore("xhsImageGeneration", {
    state: () => ({
        // 生成状态
        isGenerating: false,

        // 进度信息
        progress: {
            stage: "" as "" | "cover" | "content",
            current: 0,
            total: 0,
            message: "",
        },

        // 全局错误
        globalError: null as Error | null,
    }),

    getters: {
        /** 进度百分比 */
        progressPercent(): number {
            if (this.progress.total === 0) return 0;
            return Math.round((this.progress.current / this.progress.total) * 100);
        },
    },

    actions: {
        /**
         * 生成图片（SSE）
         * @param isRegenerate 是否为批量重绘
         * @param incrementalOnly 是否仅增量重绘
         */
        async generateImages(isRegenerate?: boolean, incrementalOnly?: boolean) {
            const outlineStore = useOutlineStore();

            if (!outlineStore.taskId) {
                throw new Error("任务ID不存在");
            }

            // 确定要生成的页面
            let pagesToGenerate = outlineStore.pages;
            if (incrementalOnly) {
                pagesToGenerate = outlineStore.dirtyPages;
                if (pagesToGenerate.length === 0) {
                    throw new Error("没有修改过的页面需要重绘");
                }
            }

            // 简化页面数据
            const simplifiedPages = pagesToGenerate.map((p) => ({
                index: p.index,
                type: p.type,
                content: extractImagePrompt(p.content).slice(0, 300),
            }));

            const trimmedOutline = (outlineStore.outline || "").slice(0, 500);

            this.isGenerating = true;
            this.globalError = null;

            try {
                await imageApi.generateImages(
                    outlineStore.taskId!,
                    simplifiedPages,
                    trimmedOutline,
                    (data: any) => {
                        this.handleSseEvent(data);
                    },
                    isRegenerate,
                );

                if (this.globalError) {
                    throw this.globalError;
                }
            } catch (error) {
                console.error("图片生成流式请求失败:", error);
                throw error;
            } finally {
                this.isGenerating = false;
            }
        },

        /**
         * 处理 SSE 事件
         */
        handleSseEvent(data: any) {
            const outlineStore = useOutlineStore();

            switch (data.type) {
                case "progress":
                    this.progress = {
                        stage: data.stage,
                        current: data.current,
                        total: data.total,
                        message: data.message,
                    };

                    if (data.pageIndex !== undefined) {
                        const page = outlineStore.pages.find(
                            (p) => p.index === data.pageIndex,
                        );
                        if (page) {
                            page.status = "generating";
                        }
                    }
                    break;

                case "complete":
                    const completedPage = outlineStore.pages.find(
                        (p) => p.index === data.pageIndex,
                    );
                    if (completedPage) {
                        completedPage.imageUrl = data.imageUrl;
                        completedPage.status = "completed";
                    }
                    break;

                case "error":
                    if (data.pageIndex === undefined || data.pageIndex === null) {
                        this.globalError = new Error(data.message || "图片生成失败");
                    } else {
                        const failedPage = outlineStore.pages.find(
                            (p) => p.index === data.pageIndex,
                        );
                        if (failedPage) {
                            failedPage.status = "failed";
                            failedPage.errorMessage = data.message;
                        }
                    }
                    break;

                case "finish":
                    this.isGenerating = false;
                    break;
            }
        },

        /**
         * 重新生成单张图片
         */
        async regenerateImage(pageIndex: number) {
            const outlineStore = useOutlineStore();

            if (!outlineStore.taskId) {
                throw new Error("任务ID不存在");
            }

            const page = outlineStore.pages.find((p) => p.index === pageIndex);
            if (!page) {
                throw new Error("页面不存在");
            }

            page.status = "generating";

            try {
                const prompt = extractImagePrompt(page.content);

                await imageApi.regenerate(
                    outlineStore.taskId,
                    pageIndex,
                    prompt,
                    (data: any) => {
                        switch (data.type) {
                            case "complete":
                                if (data.imageUrl) {
                                    page.imageUrl = data.imageUrl + `?t=${Date.now()}`;
                                    page.status = "completed";
                                }
                                break;

                            case "error":
                                page.status = "failed";
                                page.errorMessage = data.message;
                                throw new Error(data.message || "重新生成失败");

                            case "finish":
                                break;
                        }
                    },
                );
                page.errorMessage = undefined;
            } catch (error) {
                page.status = "failed";
                page.errorMessage = (error as Error).message;
                throw error;
            }
        },

        /**
         * 重新生成所有图片
         */
        async regenerateAllImages() {
            const outlineStore = useOutlineStore();

            outlineStore.pages.forEach((page) => {
                page.status = "pending";
                page.errorMessage = undefined;
            });

            await this.generateImages(true);
        },

        /**
         * 从服务器恢复进度
         */
        async recoverFromProgress(taskId: string) {
            const outlineStore = useOutlineStore();

            try {
                const result = await taskApi.getTaskProgress(taskId);
                if (!result.success) {
                    throw new Error("获取进度失败");
                }

                const { progress, images } = result;

                this.progress = {
                    stage: progress.completedCount > 0 ? "content" : "cover",
                    current: progress.completedCount,
                    total: progress.totalPages,
                    message:
                        progress.status === "completed"
                            ? "生成完成"
                            : `已完成 ${progress.completedCount}/${progress.totalPages}`,
                };

                for (const imgInfo of images) {
                    const page = outlineStore.pages.find(
                        (p) => p.index === imgInfo.pageIndex,
                    );
                    if (page) {
                        page.status = imgInfo.status as any;
                        page.imageUrl = imgInfo.imageUrl;
                        page.errorMessage = imgInfo.errorMessage;
                    }
                }

                if (progress.status === "completed" || progress.status === "failed") {
                    this.isGenerating = false;
                }

                return {
                    isCompleted: progress.status === "completed",
                    isFailed: progress.status === "failed",
                    progress,
                };
            } catch (error) {
                console.error("恢复进度失败:", error);
                throw error;
            }
        },

        /** 重置状态 */
        reset() {
            this.isGenerating = false;
            this.globalError = null;
            this.progress = {
                stage: "",
                current: 0,
                total: 0,
                message: "",
            };
        },
    },
});
