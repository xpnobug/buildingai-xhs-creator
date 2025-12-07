import { defineStore } from "pinia";

import type {
    OutlineResponse,
    RegenerateImageResponse,
    TaskDetailResponse,
    TaskImagesResponse,
    TaskListResponse,
} from "~/models";
import { outlineApi, imageApi, taskApi } from "~/services/xhs/api";

/**
 * 从页面内容中提取图片提示词（与后端逻辑保持一致）
 */
const extractImagePrompt = (content: string): string => {
    const match = content.match(/图片描述[：:]\s*(.+?)(?:\n|$)/);
    if (!match || typeof match[1] !== "string") {
        return content;
    }
    const prompt = match[1];
    return typeof prompt === "string" ? prompt.trim() : content;
};

/**
 * 页面类型
 */
export interface Page {
    index: number;
    type: "cover" | "content" | "summary";
    content: string;
    imageUrl?: string;
    status?: "pending" | "generating" | "completed" | "failed";
    errorMessage?: string;
    // 增量重绘相关字段
    isDirty?: boolean;           // 是否被修改（相对于原始内容）
    originalContent?: string;     // 原始内容快照（仅历史编辑时有值）
}

/**
 * 小红书图文生成状态管理
 */
export const useXhsCreatorStore = defineStore("xhsCreator", {
    state: () => ({
        // 当前任务ID
        taskId: null as string | null,

        // 用户输入
        topic: "",
        userImages: [] as string[],

        // 大纲
        outline: "",
        pages: [] as Page[],

        // 生成状态
        isGeneratingOutline: false,
        isGeneratingImages: false,
        generationProgress: {
            stage: "", // 'cover' | 'content'
            current: 0,
            total: 0,
            message: "",
        },

        // 编辑来源：'new' 新建 | 'history' 从历史记录编辑
        editSource: null as 'new' | 'history' | null,

        // 历史记录
        tasks: [] as any[],
    }),

    getters: {
        /**
         * 封面页
         */
        coverPage(): Page | undefined {
            return this.pages.find((p) => p.type === "cover");
        },

        /**
         * 内容页
         */
        contentPages(): Page[] {
            return this.pages.filter((p) => p.type === "content");
        },

        /**
         * 总结页
         */
        summaryPage(): Page | undefined {
            return this.pages.find((p) => p.type === "summary");
        },

        /**
         * 是否所有图片都已生成
         */
        allImagesGenerated(): boolean {
            return this.pages.every((p) => p.status === "completed");
        },

        /**
         * 失败的页面
         */
        failedPages(): Page[] {
            return this.pages.filter((p) => p.status === "failed");
        },

        /**
         * 增量重绘：已修改的页面
         */
        dirtyPages(): Page[] {
            return this.pages.filter((p) => p.isDirty === true);
        },

        /**
         * 增量重绘：已修改的页面数量
         */
        dirtyPagesCount(): number {
            return this.pages.filter((p) => p.isDirty === true).length;
        },

        /**
         * 增量重绘：仅重绘修改页面所需积分
         */
        dirtyPagesPower(): number {
            return this.pages
                .filter((p) => p.isDirty === true)
                .reduce((sum, p) => sum + (p.type === "cover" ? 80 : 40), 0);
        },

        /**
         * 全部重绘所需积分
         */
        totalPagesPower(): number {
            return this.pages.reduce((sum, p) => sum + (p.type === "cover" ? 80 : 40), 0);
        },
    },

    actions: {
        /**
         * 生成大纲
         */
        async generateOutline() {
            this.isGeneratingOutline = true;

            try {
                const result: OutlineResponse = await outlineApi.generate(
                    this.topic,
                    this.userImages,
                );

                this.taskId = result.taskId;
                this.outline = result.outline;
                this.pages = result.pages.map((p: any) => ({
                    ...p,
                    status: "pending",
                }));

                return result;
            } catch (error) {
                console.error("生成大纲失败:", error);
                throw error;
            } finally {
                this.isGeneratingOutline = false;
            }
        },

        /**
         * 更新页面内容
         */
        updatePage(index: number, content: string) {
            const page = this.pages.find((p) => p.index === index);
            if (page) {
                page.content = content;
                // 增量重绘：检测内容是否与原始内容不同
                if (page.originalContent !== undefined) {
                    page.isDirty = page.originalContent !== content;
                }
            }
        },

        /**
         * 生成图片（SSE）
         * @param isRegenerate 是否为批量重绘（全部重绘）
         * @param incrementalOnly 是否仅增量重绘（只重绘修改过的页面）
         */
        async generateImages(isRegenerate?: boolean, incrementalOnly?: boolean) {
            if (!this.taskId) {
                throw new Error("任务ID不存在");
            }

            // 确定要生成的页面
            let pagesToGenerate = this.pages;
            
            // 增量重绘模式：只选择修改过的页面
            if (incrementalOnly) {
                pagesToGenerate = this.pages.filter((p) => p.isDirty === true);
                if (pagesToGenerate.length === 0) {
                    throw new Error("没有修改过的页面需要重绘");
                }
            }

            // 为避免 URL 过长导致 431，仅传递图片生成所需的关键信息
            const simplifiedPages = pagesToGenerate.map((p) => ({
                index: p.index,
                type: p.type,
                // 只保留提取出的图片描述，并限制长度
                content: extractImagePrompt(p.content).slice(0, 300),
            }));

            // 后端只会取 fullOutline 的前一小段做风格参考，这里也做长度限制
            const trimmedOutline = (this.outline || "").slice(0, 500);

            this.isGeneratingImages = true;
            
            // 用于捕获全局错误
            let globalError: Error | null = null;

            try {
                await imageApi.generateImages(
                    this.taskId!,
                    simplifiedPages,
                    trimmedOutline,
                    (data: any) => {
                    switch (data.type) {
                        case "progress":
                            // 更新进度
                            this.generationProgress = {
                                stage: data.stage,
                                current: data.current,
                                total: data.total,
                                message: data.message,
                            };

                            // 更新页面状态
                            if (data.pageIndex !== undefined) {
                                const page = this.pages.find(
                                    (p) => p.index === data.pageIndex,
                                );
                                if (page) {
                                    page.status = "generating";
                                }
                            }
                            break;

                        case "complete":
                            // 图片生成完成
                            const completedPage = this.pages.find(
                                (p) => p.index === data.pageIndex,
                            );
                            if (completedPage) {
                                completedPage.imageUrl = data.imageUrl;
                                completedPage.status = "completed";
                            }
                            break;

                        case "error":
                            // 检查是否为全局错误（没有指定 pageIndex）
                            if (data.pageIndex === undefined || data.pageIndex === null) {
                                // 全局错误（如余额不足），记录错误
                                globalError = new Error(data.message || "图片生成失败");
                            } else {
                                // 单个图片生成失败
                                const failedPage = this.pages.find(
                                    (p) => p.index === data.pageIndex,
                                );
                                if (failedPage) {
                                    failedPage.status = "failed";
                                    failedPage.errorMessage = data.message;
                                }
                            }
                            break;

                        case "finish":
                            // 全部完成
                            this.isGeneratingImages = false;
                            break;
                    }
                    },
                    isRegenerate,  // 传递是否为批量重绘标记
                );
                
                // SSE 完成后检查是否有全局错误
                if (globalError) {
                    throw globalError;
                }
            } catch (error) {
                console.error("图片生成流式请求失败:", error);
                throw error;
            } finally {
                    this.isGeneratingImages = false;
            }
        },

        /**
         * 重新生成单张图片（流式）
         */
        async regenerateImage(pageIndex: number) {
            if (!this.taskId) {
                throw new Error("任务ID不存在");
            }

            const page = this.pages.find((p) => p.index === pageIndex);
            if (!page) {
                throw new Error("页面不存在");
            }

            page.status = "generating";

            try {
                // 提取图片提示词
                const promptMatch = page.content.match(/图片描述[：:]\s*(.+?)(?:\n|$)/);
                const prompt = promptMatch?.[1]?.trim() || page.content;

                await imageApi.regenerate(
                    this.taskId,
                    pageIndex,
                    prompt,
                    (data: any) => {
                        switch (data.type) {
                            case "start":
                                console.log(`页面 ${pageIndex} 开始重新生成`);
                                break;

                            case "complete":
                                if (data.imageUrl) {
                                    page.imageUrl = data.imageUrl + `?t=${Date.now()}`; // 添加时间戳避免缓存
                                    page.status = "completed";
                                }
                                break;

                            case "error":
                                page.status = "failed";
                                page.errorMessage = data.message;
                                throw new Error(data.message || "重新生成失败");

                            case "finish":
                                console.log("重新生成完成");
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
         * 重新生成当前任务的所有图片（作为新版本）
         */
        async regenerateAllImages() {
            if (!this.taskId) {
                throw new Error("任务ID不存在");
            }

            // 重置本地状态
            this.pages.forEach((page) => {
                page.status = "pending";
                page.errorMessage = undefined;
            });

            // 调用批量生成，传递 isRegenerate=true 表示批量重绘
            await this.generateImages(true);
        },

        /**
         * 加载任务历史
         */
        async loadTasks() {
            const result: TaskListResponse = await taskApi.getTasks();
            this.tasks = result.tasks;
        },

        /**
         * 加载任务详情（从历史记录编辑）
         */
        async loadTask(id: string) {
            const result: TaskDetailResponse = await taskApi.getTask(id);
            const task = result.task;

            this.taskId = task.id;
            this.topic = task.topic;
            this.outline = task.outline;
            this.userImages = task.userImages || [];
            
            // 标记来源为历史记录编辑
            this.editSource = 'history';

            // 加载图片
            const imagesResult: TaskImagesResponse = await taskApi.getTaskImages(id);
            const images = imagesResult.images;

            this.pages = (task.pages || []).map((p: any) => {
                const image = images.find((img: any) => img.pageIndex === p.index);
                return {
                    ...p,
                    imageUrl: image?.imageUrl,
                    status: image?.status || "pending",
                    errorMessage: image?.errorMessage,
                    // 增量重绘：保存原始内容快照，初始化为未修改
                    originalContent: p.content,
                    isDirty: false,
                };
            });
        },

        /**
         * 重置状态
         */
        reset() {
            this.taskId = null;
            this.topic = "";
            this.userImages = [];
            this.outline = "";
            this.pages = [];
            this.editSource = null;  // 清除来源标记
            this.generationProgress = {
                stage: "",
                current: 0,
                total: 0,
                message: "",
            };
        },

        /**
         * 从服务器恢复生成进度（SSE 断线重连场景）
         * 调用后端进度查询 API，恢复本地状态
         */
        async recoverFromProgress(taskId: string) {
            try {
                const result = await taskApi.getTaskProgress(taskId);
                if (!result.success) {
                    throw new Error("获取进度失败");
                }

                const { progress, images } = result;

                // 恢复进度状态
                this.generationProgress = {
                    stage: progress.completedCount > 0 ? "content" : "cover",
                    current: progress.completedCount,
                    total: progress.totalPages,
                    message: progress.status === "completed"
                        ? "生成完成"
                        : `已完成 ${progress.completedCount}/${progress.totalPages}`,
                };

                // 恢复页面状态
                for (const imgInfo of images) {
                    const page = this.pages.find((p) => p.index === imgInfo.pageIndex);
                    if (page) {
                        page.status = imgInfo.status as any;
                        page.imageUrl = imgInfo.imageUrl;
                        page.errorMessage = imgInfo.errorMessage;
                    }
                }

                // 如果任务已完成或失败，停止生成状态
                if (progress.status === "completed" || progress.status === "failed") {
                    this.isGeneratingImages = false;
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
    },
});
