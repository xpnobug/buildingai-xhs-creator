/**
 * SSE 事件类型定义
 * 统一所有 SSE 流式响应的数据结构
 */

/**
 * SSE 事件类型枚举
 */
export enum SseEventType {
    /** 进度更新 */
    PROGRESS = "progress",
    /** 单个项目完成 */
    COMPLETE = "complete",
    /** 错误发生 */
    ERROR = "error",
    /** 任务开始 */
    START = "start",
    /** 全部完成 */
    FINISH = "finish",
}

/**
 * SSE 基础事件接口
 */
export interface SseBaseEvent {
    type: SseEventType;
}

/**
 * 进度事件
 */
export interface SseProgressEvent extends SseBaseEvent {
    type: SseEventType.PROGRESS;
    /** 当前阶段：cover, content 等 */
    stage: "cover" | "content";
    /** 当前完成数 */
    current: number;
    /** 总数 */
    total: number;
    /** 进度消息 */
    message: string;
}

/**
 * 完成事件
 */
export interface SseCompleteEvent extends SseBaseEvent {
    type: SseEventType.COMPLETE;
    /** 页面索引 */
    pageIndex: number;
    /** 生成的图片URL */
    imageUrl: string;
    /** 可选消息 */
    message?: string;
}

/**
 * 错误事件
 */
export interface SseErrorEvent extends SseBaseEvent {
    type: SseEventType.ERROR;
    /** 页面索引（可选，全局错误时不存在） */
    pageIndex?: number;
    /** 错误消息 */
    message: string;
}

/**
 * 开始事件
 */
export interface SseStartEvent extends SseBaseEvent {
    type: SseEventType.START;
    /** 页面索引 */
    pageIndex?: number;
    /** 消息 */
    message: string;
}

/**
 * 完成事件
 */
export interface SseFinishEvent extends SseBaseEvent {
    type: SseEventType.FINISH;
    /** 完成消息 */
    message: string;
}

/**
 * SSE 事件联合类型
 */
export type SseEvent =
    | SseProgressEvent
    | SseCompleteEvent
    | SseErrorEvent
    | SseStartEvent
    | SseFinishEvent;

/**
 * SSE 消息事件数据（用于 MessageEvent.data）
 */
export interface SseMessageData {
    data: string; // JSON.stringify(SseEvent)
}

/**
 * 创建 SSE 消息事件的辅助函数类型
 */
export type CreateSseMessage<T extends SseEvent> = (event: T) => SseMessageData;

/**
 * 工具函数：创建 SSE 消息事件
 */
export function createSseMessage<T extends SseEvent>(event: T): SseMessageData {
    return {
        data: JSON.stringify(event),
    };
}

/**
 * 工具函数：创建进度消息
 */
export function createProgressMessage(
    stage: "cover" | "content",
    current: number,
    total: number,
    message: string,
): SseMessageData {
    return createSseMessage({
        type: SseEventType.PROGRESS,
        stage,
        current,
        total,
        message,
    });
}

/**
 * 工具函数：创建完成消息
 */
export function createCompleteMessage(pageIndex: number, imageUrl: string): SseMessageData {
    return createSseMessage({
        type: SseEventType.COMPLETE,
        pageIndex,
        imageUrl,
    });
}

/**
 * 工具函数：创建错误消息
 */
export function createErrorMessage(message: string, pageIndex?: number): SseMessageData {
    return createSseMessage({
        type: SseEventType.ERROR,
        message,
        pageIndex,
    });
}

/**
 * 工具函数：创建完成消息
 */
export function createFinishMessage(message: string): SseMessageData {
    return createSseMessage({
        type: SseEventType.FINISH,
        message,
    });
}
