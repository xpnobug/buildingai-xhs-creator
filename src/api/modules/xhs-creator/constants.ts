/**
 * XHS Creator 常量定义
 * 统一管理魔法字符串和枚举值
 */

/**
 * 页面类型
 */
export enum PageType {
    COVER = "cover",
    CONTENT = "content",
    SUMMARY = "summary",
}

/**
 * 页面类型标签（中文）
 */
export const PageTypeLabel: Record<PageType, string> = {
    [PageType.COVER]: "封面",
    [PageType.CONTENT]: "内容",
    [PageType.SUMMARY]: "总结",
};

/**
 * 图片生成来源
 */
export enum GeneratedBy {
    INITIAL = "initial",
    SINGLE_REGENERATE = "single-regenerate",
    BATCH_REGENERATE = "batch-regenerate",
}

/**
 * SSE 事件类型
 */
export enum SseEventType {
    PROGRESS = "progress",
    COMPLETE = "complete",
    ERROR = "error",
    FINISH = "finish",
    START = "start",
}

/**
 * 生成阶段
 */
export enum GenerationStage {
    COVER = "cover",
    CONTENT = "content",
}

/**
 * 图片端点类型
 */
export enum ImageEndpointType {
    IMAGES = "images",   // OpenAI Images API
    CHAT = "chat",       // Chat Completions API
    CUSTOM = "custom",   // 自定义端点
}

/**
 * 插件标识
 */
export const PLUGIN_IDENTIFIER = "buildingai-xhs-creator";

/**
 * 默认图片生成参数
 */
export const DEFAULT_IMAGE_OPTIONS = {
    SIZE: "1024x1024",
    QUALITY: "standard",
};

/**
 * 默认积分消耗
 */
export const DEFAULT_POWER = {
    COVER: 80,
    CONTENT: 40,
};
