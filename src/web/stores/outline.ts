import { defineStore } from "pinia";

import type { OutlineResponse } from "~/models";
import { outlineApi } from "~/services/xhs/api";

/**
 * 页面类型（用于大纲 Store）
 * 注意：使用 OutlinePage 避免与 xhs-creator.ts 的 Page 类型冲突
 */
export interface OutlinePage {
    index: number;
    type: "cover" | "content" | "summary";
    content: string;
    imageUrl?: string;
    status?: "pending" | "generating" | "completed" | "failed";
    errorMessage?: string;
    isDirty?: boolean;
    originalContent?: string;
}

/**
 * 从页面内容中提取图片提示词
 */
export const extractImagePrompt = (content: string): string => {
    const match = content.match(/图片描述[：:]\s*(.+?)(?:\n|$)/);
    if (!match || typeof match[1] !== "string") {
        return content;
    }
    return match[1].trim();
};

/**
 * 大纲状态管理 Store
 * 负责主题输入、大纲生成、页面内容管理
 */
export const useOutlineStore = defineStore("xhsOutline", {
    state: () => ({
        // 当前任务ID
        taskId: null as string | null,

        // 用户输入
        topic: "",
        userImages: [] as string[],

        // 大纲
        outline: "",
        pages: [] as OutlinePage[],

        // 生成状态
        isGeneratingOutline: false,

        // 编辑来源
        editSource: null as "new" | "history" | null,
    }),

    getters: {
        /** 封面页 */
        coverPage(): OutlinePage | undefined {
            return this.pages.find((p) => p.type === "cover");
        },

        /** 内容页 */
        contentPages(): OutlinePage[] {
            return this.pages.filter((p) => p.type === "content");
        },

        /** 总结页 */
        summaryPage(): OutlinePage | undefined {
            return this.pages.find((p) => p.type === "summary");
        },

        /** 已修改的页面 */
        dirtyPages(): OutlinePage[] {
            return this.pages.filter((p) => p.isDirty === true);
        },

        /** 已修改的页面数量 */
        dirtyPagesCount(): number {
            return this.dirtyPages.length;
        },

        /** 增量重绘所需积分 */
        dirtyPagesPower(): number {
            return this.dirtyPages.reduce(
                (sum, p) => sum + (p.type === "cover" ? 80 : 40),
                0,
            );
        },

        /** 全部重绘所需积分 */
        totalPagesPower(): number {
            return this.pages.reduce(
                (sum, p) => sum + (p.type === "cover" ? 80 : 40),
                0,
            );
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
                if (page.originalContent !== undefined) {
                    page.isDirty = page.originalContent !== content;
                }
            }
        },

        /**
         * 设置任务数据（从历史记录加载）
         */
        setTaskData(data: {
            taskId: string;
            topic: string;
            outline: string;
            userImages: string[];
            pages: OutlinePage[];
        }) {
            this.taskId = data.taskId;
            this.topic = data.topic;
            this.outline = data.outline;
            this.userImages = data.userImages;
            this.pages = data.pages.map((p) => ({
                ...p,
                originalContent: p.content,
                isDirty: false,
            }));
            this.editSource = "history";
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
            this.editSource = null;
        },
    },
});
