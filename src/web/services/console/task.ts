/**
 * 任务状态
 */
export enum TaskStatus {
    PENDING = "pending",
    GENERATING_OUTLINE = "generating_outline",
    OUTLINE_READY = "outline_ready",
    GENERATING_IMAGES = "generating_images",
    COMPLETED = "completed",
    FAILED = "failed",
}

/**
 * 任务信息
 */
export interface Task {
    id: string;
    topic: string;
    status: TaskStatus;
    statusText: string;
    totalPages: number;
    generatedPages: number;
    coverImageUrl?: string;
    userId?: string;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
    imageCount: number;
}

/**
 * 任务详情
 */
export interface TaskDetail extends Task {
    outline?: string;
    pages?: Array<{
        index: number;
        type: "cover" | "content" | "summary";
        content: string;
    }>;
    userImages?: string[];
}

/**
 * 图片信息
 */
export interface TaskImage {
    id: string;
    taskId: string;
    pageIndex: number;
    pageType: "cover" | "content" | "summary";
    prompt: string;
    imageUrl?: string;
    thumbnailUrl?: string;
    status: string;
    errorMessage?: string;
    retryCount: number;
    currentVersion: number;
    createdAt: string;
}

/**
 * 查询参数
 */
export interface QueryTaskParams {
    page?: number;
    pageSize?: number;
    status?: TaskStatus;
    userId?: string;
    keyword?: string;
    startDate?: string;
    endDate?: string;
}

/**
 * 查询结果
 */
export interface QueryTaskResult {
    tasks: Task[];
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
    stats: {
        totalTasks: number;
        completedTasks: number;
        failedTasks: number;
        generatingTasks: number;
        totalImages: number;
        successRate: string;
    };
}

/**
 * 任务详情结果
 */
export interface TaskDetailResult {
    task: TaskDetail;
    images: TaskImage[];
}

/**
 * 查询任务列表
 */
export async function apiQueryTasks(params: QueryTaskParams = {}): Promise<QueryTaskResult> {
    const response = (await usePluginConsoleGet("/tasks", params)) as any;
    if (response?.data) return response.data as QueryTaskResult;
    return response as QueryTaskResult;
}

/**
 * 获取任务详情
 */
export async function apiGetTaskDetail(id: string): Promise<TaskDetailResult> {
    const response = (await usePluginConsoleGet(`/tasks/${id}`)) as any;
    if (response?.data) return response.data as TaskDetailResult;
    return response as TaskDetailResult;
}

/**
 * 删除任务
 */
export async function apiDeleteTask(id: string): Promise<void> {
    await usePluginConsoleDelete(`/tasks/${id}`);
}

/**
 * 批量删除任务
 */
export async function apiBatchDeleteTasks(ids: string[]): Promise<{ deletedCount: number }> {
    // 将 ids 作为 query 参数拼接到 URL 中
    const idsParam = encodeURIComponent(ids.join(","));
    const response = (await usePluginConsoleDelete(`/tasks/batch?ids=${idsParam}`)) as any;
    return { deletedCount: response?.deletedCount || 0 };
}

