import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThan } from "typeorm";

import { XhsTask, TaskStatus } from "../../../db/entities/xhs-task.entity";

/**
 * 任务超时管理服务
 * 自动取消超时的生成任务
 */
@Injectable()
export class TaskTimeoutService implements OnModuleDestroy {
    private readonly logger = new Logger(TaskTimeoutService.name);

    /** 任务超时时间（毫秒） - 10分钟 */
    private readonly TASK_TIMEOUT_MS = 10 * 60 * 1000;

    /** 检查间隔（毫秒） - 1分钟 */
    private readonly CHECK_INTERVAL_MS = 60 * 1000;

    /** 定时器句柄 */
    private checkTimer: NodeJS.Timeout | null = null;

    constructor(
        @InjectRepository(XhsTask)
        private readonly taskRepository: Repository<XhsTask>,
    ) {
        // 启动定时检查
        this.startTimeoutCheck();
    }

    /**
     * 模块销毁时清理定时器
     */
    onModuleDestroy() {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
    }

    /**
     * 启动超时检查定时器
     */
    private startTimeoutCheck() {
        this.checkTimer = setInterval(async () => {
            await this.checkAndCancelTimeoutTasks();
        }, this.CHECK_INTERVAL_MS);

        this.logger.log(`任务超时检查已启动，间隔 ${this.CHECK_INTERVAL_MS / 1000} 秒`);
    }

    /**
     * 检查并取消超时任务
     */
    async checkAndCancelTimeoutTasks(): Promise<number> {
        const timeoutThreshold = new Date(Date.now() - this.TASK_TIMEOUT_MS);

        try {
            // 查找超时的生成中任务
            const timeoutTasks = await this.taskRepository.find({
                where: {
                    status: TaskStatus.GENERATING_IMAGES,
                    updatedAt: LessThan(timeoutThreshold),
                },
            });

            if (timeoutTasks.length === 0) {
                return 0;
            }

            this.logger.warn(`发现 ${timeoutTasks.length} 个超时任务，正在取消...`);

            // 批量更新为超时状态
            for (const task of timeoutTasks) {
                task.status = TaskStatus.FAILED;
                task.errorMessage = `任务超时（超过 ${this.TASK_TIMEOUT_MS / 60000} 分钟未完成）`;
            }

            await this.taskRepository.save(timeoutTasks);

            this.logger.log(`已取消 ${timeoutTasks.length} 个超时任务`);
            return timeoutTasks.length;
        } catch (error) {
            this.logger.error("检查超时任务失败:", error);
            return 0;
        }
    }

    /**
     * 手动取消指定任务
     */
    async cancelTask(taskId: string, reason?: string): Promise<boolean> {
        try {
            const task = await this.taskRepository.findOne({ where: { id: taskId } });
            if (!task) {
                return false;
            }

            if (task.status === "completed" || task.status === "failed") {
                return false;
            }

            task.status = TaskStatus.FAILED;
            task.errorMessage = reason || "用户手动取消";
            await this.taskRepository.save(task);

            this.logger.log(`任务 ${taskId} 已取消: ${reason || "用户手动取消"}`);
            return true;
        } catch (error) {
            this.logger.error(`取消任务 ${taskId} 失败:`, error);
            return false;
        }
    }

    /**
     * 服务启动时恢复中断的任务
     */
    async recoverInterruptedTasks(): Promise<number> {
        try {
            // 查找状态为 "generating_images" 的任务
            const interruptedTasks = await this.taskRepository.find({
                where: {
                    status: TaskStatus.GENERATING_IMAGES,
                },
            });

            if (interruptedTasks.length === 0) {
                return 0;
            }

            this.logger.warn(`发现 ${interruptedTasks.length} 个中断的任务`);

            // 将中断任务标记为失败
            for (const task of interruptedTasks) {
                task.status = "failed" as any;
                task.errorMessage = "服务重启导致任务中断，请重新生成";
            }

            await this.taskRepository.save(interruptedTasks);

            return interruptedTasks.length;
        } catch (error) {
            this.logger.error("恢复中断任务失败:", error);
            return 0;
        }
    }
}
