import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Repository } from "@buildingai/db/typeorm";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";

import { XhsTask, TaskStatus } from "../../../db/entities/xhs-task.entity";

/**
 * 队列任务状态
 */
export enum QueueTaskStatus {
    PENDING = "pending",
    PROCESSING = "processing",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled",
}

/**
 * 队列任务项
 */
export interface QueuedTask {
    id: string;
    taskId: string;
    userId: string;
    priority: number;
    status: QueueTaskStatus;
    payload: Record<string, unknown>;
    retryCount: number;
    maxRetries: number;
    createdAt: Date;
    startedAt?: Date;
    completedAt?: Date;
    errorMessage?: string;
}

/**
 * 任务队列配置
 */
export interface TaskQueueConfig {
    /** 最大并发数 */
    maxConcurrency: number;
    /** 最大重试次数 */
    maxRetries: number;
    /** 重试延迟（毫秒） */
    retryDelay: number;
    /** 任务超时时间（毫秒） */
    taskTimeout: number;
    /** 队列轮询间隔（毫秒） */
    pollingInterval: number;
}

const DEFAULT_CONFIG: TaskQueueConfig = {
    maxConcurrency: 3,
    maxRetries: 3,
    retryDelay: 5000,
    taskTimeout: 300000, // 5分钟
    pollingInterval: 1000,
};

/**
 * 任务持久化队列服务
 * 
 * 使用数据库持久化任务队列，防止服务重启丢失：
 * - 任务入队时写入数据库
 * - 定期轮询处理待执行任务
 * - 服务重启时自动恢复未完成任务
 * - 支持优先级、重试、超时取消
 */
@Injectable()
export class TaskPersistenceQueueService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(TaskPersistenceQueueService.name);
    private readonly config: TaskQueueConfig;
    private readonly processingTasks = new Map<string, NodeJS.Timeout>();
    private pollingTimer: NodeJS.Timeout | null = null;
    private currentConcurrency = 0;
    private taskHandlers = new Map<string, (task: QueuedTask) => Promise<void>>();

    // 内存队列（同时持久化到数据库）
    private queue: QueuedTask[] = [];

    constructor(
        @InjectRepository(XhsTask)
        private readonly taskRepository: Repository<XhsTask>,
        config?: Partial<TaskQueueConfig>,
    ) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    async onModuleInit(): Promise<void> {
        // 服务启动时恢复未完成的任务
        await this.recoverPendingTasks();
        // 启动轮询
        this.startPolling();
        this.logger.log("任务持久化队列服务已启动");
    }

    onModuleDestroy(): void {
        this.stopPolling();
        // 取消所有正在处理的任务
        for (const [taskId, timer] of this.processingTasks.entries()) {
            clearTimeout(timer);
            this.logger.warn(`服务关闭，取消任务超时监控: ${taskId}`);
        }
        this.processingTasks.clear();
        this.logger.log("任务持久化队列服务已停止");
    }

    /**
     * 注册任务处理器
     */
    registerHandler(
        taskType: string,
        handler: (task: QueuedTask) => Promise<void>,
    ): void {
        this.taskHandlers.set(taskType, handler);
        this.logger.debug(`已注册任务处理器: ${taskType}`);
    }

    /**
     * 任务入队
     */
    async enqueue(
        taskId: string,
        userId: string,
        payload: Record<string, unknown>,
        priority: number = 0,
    ): Promise<string> {
        const queuedTask: QueuedTask = {
            id: `queue_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            taskId,
            userId,
            priority,
            status: QueueTaskStatus.PENDING,
            payload,
            retryCount: 0,
            maxRetries: this.config.maxRetries,
            createdAt: new Date(),
        };

        // 持久化到数据库（更新任务状态）
        await this.taskRepository.update(taskId, {
            status: TaskStatus.PENDING,
        });

        // 加入内存队列
        this.queue.push(queuedTask);
        this.queue.sort((a, b) => b.priority - a.priority);

        this.logger.log(`任务入队: ${queuedTask.id} (taskId: ${taskId})`);

        return queuedTask.id;
    }

    /**
     * 取消任务
     */
    async cancel(queueId: string): Promise<boolean> {
        const index = this.queue.findIndex((t) => t.id === queueId);
        
        if (index !== -1) {
            const task = this.queue[index];
            if (task.status === QueueTaskStatus.PENDING) {
                task.status = QueueTaskStatus.CANCELLED;
                this.queue.splice(index, 1);
                await this.taskRepository.update(task.taskId, {
                    status: TaskStatus.FAILED,
                });
                this.logger.log(`任务已取消: ${queueId}`);
                return true;
            }
        }

        // 尝试取消正在处理的任务
        const timer = this.processingTasks.get(queueId);
        if (timer) {
            clearTimeout(timer);
            this.processingTasks.delete(queueId);
            this.currentConcurrency--;
            this.logger.log(`处理中任务已取消: ${queueId}`);
            return true;
        }

        return false;
    }

    /**
     * 获取队列状态
     */
    getQueueStatus(): {
        pending: number;
        processing: number;
        maxConcurrency: number;
    } {
        return {
            pending: this.queue.filter((t) => t.status === QueueTaskStatus.PENDING).length,
            processing: this.currentConcurrency,
            maxConcurrency: this.config.maxConcurrency,
        };
    }

    /**
     * 恢复未完成的任务
     */
    private async recoverPendingTasks(): Promise<void> {
        try {
            // 查找所有处于 PENDING 或 GENERATING 状态的任务
            const pendingTasks = await this.taskRepository.find({
                where: [
                    { status: TaskStatus.PENDING },
                    { status: TaskStatus.GENERATING_OUTLINE },
                    { status: TaskStatus.GENERATING_IMAGES },
                ],
            });

            for (const task of pendingTasks) {
                const queuedTask: QueuedTask = {
                    id: `recovered_${task.id}`,
                    taskId: task.id,
                    userId: task.userId,
                    priority: 0,
                    status: QueueTaskStatus.PENDING,
                    payload: {},
                    retryCount: 0,
                    maxRetries: this.config.maxRetries,
                    createdAt: task.createdAt,
                };
                this.queue.push(queuedTask);
            }

            if (pendingTasks.length > 0) {
                this.logger.log(`已恢复 ${pendingTasks.length} 个未完成任务`);
            }
        } catch (error) {
            this.logger.error("恢复未完成任务失败:", error);
        }
    }

    /**
     * 启动轮询
     */
    private startPolling(): void {
        this.pollingTimer = setInterval(() => {
            this.processNextTask();
        }, this.config.pollingInterval);
    }

    /**
     * 停止轮询
     */
    private stopPolling(): void {
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = null;
        }
    }

    /**
     * 处理下一个任务
     */
    private async processNextTask(): Promise<void> {
        // 检查并发限制
        if (this.currentConcurrency >= this.config.maxConcurrency) {
            return;
        }

        // 获取下一个待处理任务
        const task = this.queue.find((t) => t.status === QueueTaskStatus.PENDING);
        if (!task) {
            return;
        }

        // 更新状态
        task.status = QueueTaskStatus.PROCESSING;
        task.startedAt = new Date();
        this.currentConcurrency++;

        // 设置超时
        const timeoutTimer = setTimeout(() => {
            this.handleTaskTimeout(task);
        }, this.config.taskTimeout);
        this.processingTasks.set(task.id, timeoutTimer);

        try {
            // 获取处理器
            const taskType = (task.payload.type as string) || "default";
            const handler = this.taskHandlers.get(taskType);

            if (handler) {
                await handler(task);
            } else {
                this.logger.warn(`未找到任务处理器: ${taskType}`);
            }

            // 任务完成
            task.status = QueueTaskStatus.COMPLETED;
            task.completedAt = new Date();
            this.removeFromQueue(task.id);

        } catch (error) {
            await this.handleTaskError(task, error as Error);
        } finally {
            // 清理
            clearTimeout(timeoutTimer);
            this.processingTasks.delete(task.id);
            this.currentConcurrency--;
        }
    }

    /**
     * 处理任务超时
     */
    private async handleTaskTimeout(task: QueuedTask): Promise<void> {
        this.logger.warn(`任务超时: ${task.id}`);
        task.status = QueueTaskStatus.FAILED;
        task.errorMessage = "任务执行超时";

        await this.taskRepository.update(task.taskId, {
            status: TaskStatus.FAILED,
        });

        this.removeFromQueue(task.id);
        this.currentConcurrency--;
    }

    /**
     * 处理任务错误
     */
    private async handleTaskError(task: QueuedTask, error: Error): Promise<void> {
        task.retryCount++;
        task.errorMessage = error.message;

        if (task.retryCount < task.maxRetries) {
            // 重试
            this.logger.warn(
                `任务失败，将重试 (${task.retryCount}/${task.maxRetries}): ${task.id}`,
            );
            task.status = QueueTaskStatus.PENDING;
            
            // 延迟重试
            setTimeout(() => {
                const index = this.queue.findIndex((t) => t.id === task.id);
                if (index !== -1) {
                    this.queue[index].status = QueueTaskStatus.PENDING;
                }
            }, this.config.retryDelay);
        } else {
            // 超过重试次数
            this.logger.error(`任务最终失败: ${task.id}`, error);
            task.status = QueueTaskStatus.FAILED;

            await this.taskRepository.update(task.taskId, {
                status: TaskStatus.FAILED,
            });

            this.removeFromQueue(task.id);
        }
    }

    /**
     * 从队列移除
     */
    private removeFromQueue(queueId: string): void {
        const index = this.queue.findIndex((t) => t.id === queueId);
        if (index !== -1) {
            this.queue.splice(index, 1);
        }
    }
}
