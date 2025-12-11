import { Injectable, Logger } from "@nestjs/common";

/**
 * 请求队列项
 */
interface QueueItem<T> {
    id: string;
    execute: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (error: Error) => void;
    priority: number;
    addedAt: number;
}

/**
 * 请求队列服务
 * 防止 AI 服务过载，实现请求排队
 */
@Injectable()
export class RequestQueueService {
    private readonly logger = new Logger(RequestQueueService.name);

    /** 队列存储 */
    private readonly queues = new Map<string, QueueItem<any>[]>();

    /** 正在处理的数量 */
    private readonly processing = new Map<string, number>();

    /** 默认最大并发数 */
    private readonly DEFAULT_MAX_CONCURRENT = 3;

    /**
     * 加入队列并执行
     * @param queueName 队列名称（如 'image-generation'）
     * @param execute 执行函数
     * @param priority 优先级（数字越大优先级越高）
     * @param maxConcurrent 最大并发数
     */
    async enqueue<T>(
        queueName: string,
        execute: () => Promise<T>,
        priority: number = 0,
        maxConcurrent: number = this.DEFAULT_MAX_CONCURRENT,
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const item: QueueItem<T> = {
                id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                execute,
                resolve,
                reject,
                priority,
                addedAt: Date.now(),
            };

            // 初始化队列
            if (!this.queues.has(queueName)) {
                this.queues.set(queueName, []);
                this.processing.set(queueName, 0);
            }

            // 按优先级插入队列
            const queue = this.queues.get(queueName)!;
            const insertIndex = queue.findIndex((q) => q.priority < priority);
            if (insertIndex === -1) {
                queue.push(item);
            } else {
                queue.splice(insertIndex, 0, item);
            }

            this.logger.debug(`[${queueName}] 任务入队: ${item.id}, 队列长度: ${queue.length}`);

            // 尝试处理
            this.processQueue(queueName, maxConcurrent);
        });
    }

    /**
     * 处理队列
     */
    private async processQueue(queueName: string, maxConcurrent: number): Promise<void> {
        const queue = this.queues.get(queueName);
        const currentProcessing = this.processing.get(queueName) || 0;

        if (!queue || queue.length === 0 || currentProcessing >= maxConcurrent) {
            return;
        }

        // 取出下一个任务
        const item = queue.shift();
        if (!item) return;

        this.processing.set(queueName, currentProcessing + 1);

        try {
            const result = await item.execute();
            item.resolve(result);
        } catch (error) {
            item.reject(error as Error);
        } finally {
            this.processing.set(queueName, (this.processing.get(queueName) || 1) - 1);
            // 继续处理下一个
            this.processQueue(queueName, maxConcurrent);
        }
    }

    /**
     * 获取队列状态
     */
    getQueueStatus(queueName: string): {
        queueLength: number;
        processing: number;
        oldestItemAge: number | null;
    } {
        const queue = this.queues.get(queueName) || [];
        const processing = this.processing.get(queueName) || 0;
        const oldestItem = queue[0];

        return {
            queueLength: queue.length,
            processing,
            oldestItemAge: oldestItem ? Date.now() - oldestItem.addedAt : null,
        };
    }

    /**
     * 清空队列（取消所有等待中的任务）
     */
    clearQueue(queueName: string): number {
        const queue = this.queues.get(queueName);
        if (!queue) return 0;

        const count = queue.length;
        for (const item of queue) {
            item.reject(new Error("队列已清空"));
        }
        queue.length = 0;

        this.logger.log(`[${queueName}] 队列已清空，取消了 ${count} 个任务`);
        return count;
    }
}
