import { ref, computed } from "vue";

import { imageApi, taskApi } from "~/services/xhs/api";

/**
 * SSE 连接配置
 */
export interface SseConfig {
    /** 最大重试次数 */
    maxRetries: number;
    /** 初始重试延迟（毫秒） */
    initialRetryDelay: number;
    /** 最大重试延迟（毫秒） */
    maxRetryDelay: number;
    /** 心跳超时时间（毫秒） */
    heartbeatTimeout: number;
}

/**
 * SSE 连接状态
 */
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting" | "failed";

/**
 * 进度快照（用于恢复）
 */
export interface ProgressSnapshot {
    taskId: string;
    completedPages: number[];
    failedPages: number[];
    lastEventTime: number;
}

const DEFAULT_CONFIG: SseConfig = {
    maxRetries: 5,
    initialRetryDelay: 1000,
    maxRetryDelay: 30000,
    heartbeatTimeout: 60000,
};

/**
 * SSE 重连 Composable
 * 
 * 提供 SSE 连接的自动重连和进度恢复功能
 */
export function useSseReconnection(config: Partial<SseConfig> = {}) {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    /** 连接状态 */
    const connectionStatus = ref<ConnectionStatus>("disconnected");
    
    /** 重试次数 */
    const retryCount = ref(0);
    
    /** 进度快照 */
    const progressSnapshot = ref<ProgressSnapshot | null>(null);
    
    /** 最后心跳时间 */
    const lastHeartbeat = ref<number>(0);
    
    /** 心跳检测定时器 */
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    
    /** 重试定时器 */
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    
    /** 当前事件源 */
    let currentEventSource: EventSource | null = null;

    /** 计算当前重试延迟（指数退避） */
    const currentRetryDelay = computed(() => {
        const delay = mergedConfig.initialRetryDelay * Math.pow(2, retryCount.value);
        return Math.min(delay, mergedConfig.maxRetryDelay);
    });

    /** 是否可以重连 */
    const canReconnect = computed(() => 
        retryCount.value < mergedConfig.maxRetries
    );

    /**
     * 保存进度快照
     */
    function saveProgressSnapshot(
        taskId: string,
        completedPages: number[],
        failedPages: number[],
    ): void {
        progressSnapshot.value = {
            taskId,
            completedPages: [...completedPages],
            failedPages: [...failedPages],
            lastEventTime: Date.now(),
        };
        
        // 持久化到 localStorage
        try {
            localStorage.setItem(
                `xhs_sse_progress_${taskId}`,
                JSON.stringify(progressSnapshot.value),
            );
        } catch (e) {
            console.warn("保存进度快照失败:", e);
        }
    }

    /**
     * 恢复进度快照
     */
    function restoreProgressSnapshot(taskId: string): ProgressSnapshot | null {
        try {
            const saved = localStorage.getItem(`xhs_sse_progress_${taskId}`);
            if (saved) {
                const snapshot = JSON.parse(saved) as ProgressSnapshot;
                // 检查快照是否过期（5分钟）
                if (Date.now() - snapshot.lastEventTime < 5 * 60 * 1000) {
                    progressSnapshot.value = snapshot;
                    return snapshot;
                } else {
                    clearProgressSnapshot(taskId);
                }
            }
        } catch (e) {
            console.warn("恢复进度快照失败:", e);
        }
        return null;
    }

    /**
     * 清除进度快照
     */
    function clearProgressSnapshot(taskId: string): void {
        progressSnapshot.value = null;
        try {
            localStorage.removeItem(`xhs_sse_progress_${taskId}`);
        } catch (e) {
            // 忽略错误
        }
    }

    /**
     * 从服务器恢复进度
     */
    async function recoverFromServer(taskId: string): Promise<{
        completedPages: Array<{ index: number; imageUrl: string }>;
        failedPages: number[];
        pendingPages: number[];
    } | null> {
        try {
            // 从服务器获取当前任务图片状态
            const images = await taskApi.getTaskImages(taskId);
            
            const completedPages: Array<{ index: number; imageUrl: string }> = [];
            const failedPages: number[] = [];
            const pendingPages: number[] = [];

            for (const image of images.images || []) {
                if (image.status === "completed" && image.imageUrl) {
                    completedPages.push({
                        index: image.pageIndex,
                        imageUrl: image.imageUrl,
                    });
                } else if (image.status === "failed") {
                    failedPages.push(image.pageIndex);
                } else {
                    pendingPages.push(image.pageIndex);
                }
            }

            return { completedPages, failedPages, pendingPages };
        } catch (e) {
            console.error("从服务器恢复进度失败:", e);
            return null;
        }
    }

    /**
     * 启动心跳检测
     */
    function startHeartbeatCheck(onTimeout: () => void): void {
        stopHeartbeatCheck();
        lastHeartbeat.value = Date.now();
        
        heartbeatTimer = setInterval(() => {
            const elapsed = Date.now() - lastHeartbeat.value;
            if (elapsed > mergedConfig.heartbeatTimeout) {
                console.warn("SSE 心跳超时，触发重连");
                onTimeout();
            }
        }, 10000); // 每10秒检查一次
    }

    /**
     * 停止心跳检测
     */
    function stopHeartbeatCheck(): void {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
    }

    /**
     * 更新心跳时间
     */
    function updateHeartbeat(): void {
        lastHeartbeat.value = Date.now();
    }

    /**
     * 调度重连
     */
    function scheduleReconnect(reconnectFn: () => Promise<void>): void {
        if (!canReconnect.value) {
            connectionStatus.value = "failed";
            console.error("SSE 重连次数已用尽");
            return;
        }

        connectionStatus.value = "reconnecting";
        
        if (retryTimer) {
            clearTimeout(retryTimer);
        }

        const delay = currentRetryDelay.value;
        console.log(`SSE 将在 ${delay}ms 后重连（第 ${retryCount.value + 1} 次）`);

        retryTimer = setTimeout(async () => {
            retryCount.value++;
            try {
                await reconnectFn();
                // 重连成功，重置重试计数
                retryCount.value = 0;
                connectionStatus.value = "connected";
            } catch (e) {
                // 重连失败，继续重试
                scheduleReconnect(reconnectFn);
            }
        }, delay);
    }

    /**
     * 取消重连
     */
    function cancelReconnect(): void {
        if (retryTimer) {
            clearTimeout(retryTimer);
            retryTimer = null;
        }
        retryCount.value = 0;
    }

    /**
     * 关闭连接
     */
    function closeConnection(): void {
        if (currentEventSource) {
            currentEventSource.close();
            currentEventSource = null;
        }
        stopHeartbeatCheck();
        cancelReconnect();
        connectionStatus.value = "disconnected";
    }

    /**
     * 设置当前事件源
     */
    function setEventSource(es: EventSource | null): void {
        currentEventSource = es;
    }

    /**
     * 重置状态
     */
    function reset(): void {
        closeConnection();
        progressSnapshot.value = null;
        retryCount.value = 0;
    }

    return {
        // 状态
        connectionStatus,
        retryCount,
        progressSnapshot,
        currentRetryDelay,
        canReconnect,

        // 进度管理
        saveProgressSnapshot,
        restoreProgressSnapshot,
        clearProgressSnapshot,
        recoverFromServer,

        // 心跳管理
        startHeartbeatCheck,
        stopHeartbeatCheck,
        updateHeartbeat,

        // 重连管理
        scheduleReconnect,
        cancelReconnect,

        // 连接管理
        closeConnection,
        setEventSource,
        reset,
    };
}
