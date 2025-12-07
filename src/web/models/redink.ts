/**
 * RedInk 业务类型定义
 */

/**
 * 页面类型
 */
export interface Page {
    index: number;
    type: "cover" | "content" | "summary";
    content: string;
}

/**
 * 大纲状态
 */
export interface OutlineState {
    outline: string;
    pages: Page[];
}

/**
 * 生成状态
 */
export interface GenerateState {
    isGenerating: boolean;
    progress: number;
    currentStep: string; // 'cover', 'content', etc.
    taskId: string;
    images: Record<number, string>; // index -> imageUrl
    failed: Record<number, string>; // index -> errorMsg
}

/**
 * 历史记录
 */
export interface HistoryRecord {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    outline: OutlineState;
    images: {
        taskId: string;
        generated: string[];
    };
    status: "completed" | "processing" | "failed";
    thumbnail: string;
}

/**
 * 流式进度事件
 */
export interface StreamProgressEvent {
    type: "progress" | "complete" | "error" | "finish";
    data?: any;
    message?: string;
}

/**
 * 插件配置
 */
export interface RedInkConfig {
    pluginName: string;
}

export interface XhsConfig {
    id: string;
    pluginName: string;
    coverImagePower: number;
    contentImagePower: number;
    outlinePower: number;
    freeUsageLimit: number;
    textModel: string;
    textModelId: string | null;
    imageModel: string;
    imageModelId: string | null;
    imageEndpointType: "images" | "chat" | "custom";
    imageEndpointUrl: string | null;
    highConcurrency: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface XhsPluginConfig {
    pluginName: string;
    coverImagePower: number;
    contentImagePower: number;
}

export interface XhsProvider {
    id: string;
    name: string;
    type: "openai" | "gemini" | "custom";
    serviceType: "text" | "image";
    apiKey: string;
    baseUrl?: string | null;
    model?: string | null;
    config?: Record<string, any> | null;
    isActive: boolean;
    isEnabled: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface XhsImage {
    id: string;
    taskId: string;
    pageIndex: number;
    pageType: "cover" | "content" | "summary";
    prompt: string;
    imageUrl?: string;
    thumbnailUrl?: string;
    status: "pending" | "generating" | "completed" | "failed";
    errorMessage?: string;
    retryCount: number;
    currentVersion: number;
    createdAt: string;
}

export interface XhsTask {
    id: string;
    topic: string;
    outline: string;
    pages: Page[];
    status:
        | "pending"
        | "generating_outline"
        | "outline_ready"
        | "generating_images"
        | "completed"
        | "failed";
    userImages: string[];
    coverImageUrl?: string;
    totalPages: number;
    generatedPages: number;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
    images?: XhsImage[];
}

export interface OutlineResponse {
    success: boolean;
    taskId: string;
    outline: string;
    pages: Page[];
}

export interface RegenerateImageResponse {
    success: boolean;
    imageUrl?: string;
}

export interface TaskListResponse {
    success: boolean;
    tasks: XhsTask[];
    pagination?: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}

export interface TaskDetailResponse {
    success: boolean;
    task: XhsTask;
}

export interface TaskImagesResponse {
    success: boolean;
    images: XhsImage[];
}

export interface ProviderListResponse {
    success: boolean;
    providers: XhsProvider[];
}

export interface ProviderMutationResponse {
    success: boolean;
    provider: XhsProvider;
}

export interface OperationResult {
    success: boolean;
}
