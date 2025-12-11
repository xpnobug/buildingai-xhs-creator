import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { Repository, SelectQueryBuilder, Brackets } from "@buildingai/db/typeorm";

import { XhsTask, TaskStatus } from "../../../db/entities/xhs-task.entity";
import { XhsImage, ImageStatus } from "../../../db/entities/xhs-image.entity";

/**
 * 任务查询参数
 */
export interface TaskQueryParams {
    userId?: string;
    status?: TaskStatus | TaskStatus[];
    keyword?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    pageSize?: number;
    orderBy?: "createdAt" | "updatedAt";
    orderDir?: "ASC" | "DESC";
}

/**
 * 图片查询参数
 */
export interface ImageQueryParams {
    taskId?: string;
    status?: ImageStatus | ImageStatus[];
    pageType?: "cover" | "content" | "summary";
    pageIndex?: number;
    hasImage?: boolean;
    page?: number;
    pageSize?: number;
}

/**
 * 分页结果
 */
export interface PaginatedResult<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

/**
 * 任务统计结果
 */
export interface TaskStatistics {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
}

/**
 * TypeORM QueryBuilder 查询服务
 * 
 * 封装复杂查询逻辑，优化数据库访问性能
 * 支持分页、过滤、排序、关联加载等高级查询功能
 */
@Injectable()
export class QueryBuilderService {
    constructor(
        @InjectRepository(XhsTask)
        private readonly taskRepository: Repository<XhsTask>,
        @InjectRepository(XhsImage)
        private readonly imageRepository: Repository<XhsImage>,
    ) {}

    // ========== 任务查询 ==========

    /**
     * 创建任务基础查询构建器
     */
    private createTaskQueryBuilder(): SelectQueryBuilder<XhsTask> {
        return this.taskRepository
            .createQueryBuilder("task")
            .leftJoinAndSelect("task.images", "images");
    }

    /**
     * 查询任务列表（带分页和过滤）
     */
    async findTasks(params: TaskQueryParams): Promise<PaginatedResult<XhsTask>> {
        const {
            userId,
            status,
            keyword,
            startDate,
            endDate,
            page = 1,
            pageSize = 20,
            orderBy = "createdAt",
            orderDir = "DESC",
        } = params;

        const qb = this.createTaskQueryBuilder();

        // 用户过滤
        if (userId) {
            qb.andWhere("task.userId = :userId", { userId });
        }

        // 状态过滤（支持单个或多个）
        if (status) {
            if (Array.isArray(status)) {
                qb.andWhere("task.status IN (:...statuses)", { statuses: status });
            } else {
                qb.andWhere("task.status = :status", { status });
            }
        }

        // 关键词搜索（标题或大纲内容）
        if (keyword) {
            qb.andWhere(
                new Brackets((qb2) => {
                    qb2.where("task.topic LIKE :keyword", { keyword: `%${keyword}%` })
                       .orWhere("task.outline LIKE :keyword", { keyword: `%${keyword}%` });
                }),
            );
        }

        // 时间范围过滤
        if (startDate) {
            qb.andWhere("task.createdAt >= :startDate", { startDate });
        }
        if (endDate) {
            qb.andWhere("task.createdAt <= :endDate", { endDate });
        }

        // 排序
        qb.orderBy(`task.${orderBy}`, orderDir);

        // 分页
        const offset = (page - 1) * pageSize;
        qb.skip(offset).take(pageSize);

        // 执行查询
        const [items, total] = await qb.getManyAndCount();

        return {
            items,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }

    /**
     * 获取用户最近任务
     */
    async findRecentTasks(userId: string, limit = 5): Promise<XhsTask[]> {
        return this.createTaskQueryBuilder()
            .where("task.userId = :userId", { userId })
            .orderBy("task.updatedAt", "DESC")
            .take(limit)
            .getMany();
    }

    /**
     * 获取任务统计
     */
    async getTaskStatistics(userId?: string): Promise<TaskStatistics> {
        const qb = this.taskRepository.createQueryBuilder("task");

        if (userId) {
            qb.where("task.userId = :userId", { userId });
        }

        // 使用单次查询获取所有状态统计
        const result = await qb
            .select("task.status", "status")
            .addSelect("COUNT(*)", "count")
            .groupBy("task.status")
            .getRawMany<{ status: TaskStatus; count: string }>();

        const stats: TaskStatistics = {
            total: 0,
            pending: 0,
            processing: 0,
            completed: 0,
            failed: 0,
        };

        for (const row of result) {
            const count = parseInt(row.count, 10);
            stats.total += count;

            switch (row.status) {
                case TaskStatus.PENDING:
                    stats.pending = count;
                    break;
                case TaskStatus.GENERATING_OUTLINE:
                case TaskStatus.GENERATING_IMAGES:
                    stats.processing += count;
                    break;
                case TaskStatus.COMPLETED:
                    stats.completed = count;
                    break;
                case TaskStatus.FAILED:
                    stats.failed = count;
                    break;
            }
        }

        return stats;
    }

    /**
     * 批量更新任务状态
     */
    async bulkUpdateTaskStatus(
        taskIds: string[],
        status: TaskStatus,
    ): Promise<number> {
        if (taskIds.length === 0) return 0;

        const result = await this.taskRepository
            .createQueryBuilder()
            .update(XhsTask)
            .set({ status, updatedAt: new Date() })
            .whereInIds(taskIds)
            .execute();

        return result.affected || 0;
    }

    // ========== 图片查询 ==========

    /**
     * 创建图片基础查询构建器
     */
    private createImageQueryBuilder(): SelectQueryBuilder<XhsImage> {
        return this.imageRepository.createQueryBuilder("image");
    }

    /**
     * 查询图片列表（带分页和过滤）
     */
    async findImages(params: ImageQueryParams): Promise<PaginatedResult<XhsImage>> {
        const {
            taskId,
            status,
            pageType,
            pageIndex,
            hasImage,
            page = 1,
            pageSize = 20,
        } = params;

        const qb = this.createImageQueryBuilder();

        // 任务过滤
        if (taskId) {
            qb.andWhere("image.taskId = :taskId", { taskId });
        }

        // 状态过滤
        if (status) {
            if (Array.isArray(status)) {
                qb.andWhere("image.status IN (:...statuses)", { statuses: status });
            } else {
                qb.andWhere("image.status = :status", { status });
            }
        }

        // 页面类型过滤
        if (pageType) {
            qb.andWhere("image.pageType = :pageType", { pageType });
        }

        // 页面索引过滤
        if (pageIndex !== undefined) {
            qb.andWhere("image.pageIndex = :pageIndex", { pageIndex });
        }

        // 是否有图片过滤
        if (hasImage !== undefined) {
            if (hasImage) {
                qb.andWhere("image.imageUrl IS NOT NULL");
            } else {
                qb.andWhere("image.imageUrl IS NULL");
            }
        }

        // 排序（按页面索引）
        qb.orderBy("image.pageIndex", "ASC");

        // 分页
        const offset = (page - 1) * pageSize;
        qb.skip(offset).take(pageSize);

        const [items, total] = await qb.getManyAndCount();

        return {
            items,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }

    /**
     * 获取任务的所有图片（优化版）
     */
    async findTaskImages(taskId: string): Promise<XhsImage[]> {
        return this.createImageQueryBuilder()
            .where("image.taskId = :taskId", { taskId })
            .orderBy("image.pageIndex", "ASC")
            .getMany();
    }

    /**
     * 获取失败的图片（用于重试）
     */
    async findFailedImages(taskId: string): Promise<XhsImage[]> {
        return this.createImageQueryBuilder()
            .where("image.taskId = :taskId", { taskId })
            .andWhere("image.status = :status", { status: ImageStatus.FAILED })
            .orderBy("image.pageIndex", "ASC")
            .getMany();
    }

    /**
     * 批量更新图片状态
     */
    async bulkUpdateImageStatus(
        imageIds: string[],
        status: ImageStatus,
        additionalFields?: Partial<XhsImage>,
    ): Promise<number> {
        if (imageIds.length === 0) return 0;

        const updateData: Partial<Pick<XhsImage, 'status'>> & Record<string, unknown> = {
            status,
            ...additionalFields,
        };

        const result = await this.imageRepository
            .createQueryBuilder()
            .update(XhsImage)
            .set(updateData)
            .whereInIds(imageIds)
            .execute();

        return result.affected || 0;
    }

    /**
     * 获取任务图片完成进度
     */
    async getTaskImageProgress(taskId: string): Promise<{
        total: number;
        completed: number;
        failed: number;
        pending: number;
    }> {
        const result = await this.imageRepository
            .createQueryBuilder("image")
            .where("image.taskId = :taskId", { taskId })
            .select("image.status", "status")
            .addSelect("COUNT(*)", "count")
            .groupBy("image.status")
            .getRawMany<{ status: ImageStatus; count: string }>();

        const progress = {
            total: 0,
            completed: 0,
            failed: 0,
            pending: 0,
        };

        for (const row of result) {
            const count = parseInt(row.count, 10);
            progress.total += count;

            switch (row.status) {
                case ImageStatus.COMPLETED:
                    progress.completed = count;
                    break;
                case ImageStatus.FAILED:
                    progress.failed = count;
                    break;
                case ImageStatus.PENDING:
                case ImageStatus.GENERATING:
                    progress.pending += count;
                    break;
            }
        }

        return progress;
    }

    // ========== 清理查询 ==========

    /**
     * 查找过期任务（用于清理）
     */
    async findExpiredTasks(olderThan: Date): Promise<XhsTask[]> {
        return this.createTaskQueryBuilder()
            .where("task.createdAt < :olderThan", { olderThan })
            .andWhere("task.status IN (:...statuses)", {
                statuses: [TaskStatus.COMPLETED, TaskStatus.FAILED],
            })
            .getMany();
    }

    /**
     * 删除过期任务（级联删除图片）
     */
    async deleteExpiredTasks(olderThan: Date): Promise<number> {
        // 先获取要删除的任务ID
        const tasks = await this.taskRepository
            .createQueryBuilder("task")
            .select("task.id")
            .where("task.createdAt < :olderThan", { olderThan })
            .andWhere("task.status IN (:...statuses)", {
                statuses: [TaskStatus.COMPLETED, TaskStatus.FAILED],
            })
            .getMany();

        if (tasks.length === 0) return 0;

        const taskIds = tasks.map((t) => t.id);

        // 删除关联图片
        await this.imageRepository
            .createQueryBuilder()
            .delete()
            .where("taskId IN (:...taskIds)", { taskIds })
            .execute();

        // 删除任务
        const result = await this.taskRepository
            .createQueryBuilder()
            .delete()
            .whereInIds(taskIds)
            .execute();

        return result.affected || 0;
    }
}
