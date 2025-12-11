import { BaseController } from "@buildingai/base";
import { ExtensionConsoleController } from "@buildingai/core/decorators";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { Repository, Like, Between, In } from "@buildingai/db/typeorm";
import { Delete, Get, Param, Query } from "@nestjs/common";
import { UUIDValidationPipe } from "@buildingai/pipe/param-validate.pipe";
import { XhsTask, TaskStatus } from "../../../../db/entities/xhs-task.entity";
import { XhsImage } from "../../../../db/entities/xhs-image.entity";
import { QueryTaskDto } from "../../dto/query-task.dto";

/**
 * 任务管理控制器（后台）
 */
@ExtensionConsoleController("tasks", "小红书生成记录管理")
export class TaskConsoleController extends BaseController {
    constructor(
        @InjectRepository(XhsTask)
        private taskRepository: Repository<XhsTask>,
        @InjectRepository(XhsImage)
        private imageRepository: Repository<XhsImage>,
    ) {
        super();
    }

    /**
     * 查询任务列表（支持筛选和分页）
     */
    @Get()
    async findAll(@Query() queryDto: QueryTaskDto) {
        const {
            page = 1,
            pageSize = 20,
            status,
            userId,
            keyword,
            startDate,
            endDate,
        } = queryDto;

        const skip = (page - 1) * pageSize;
        const where: any = {};

        // 状态筛选
        if (status) {
            where.status = status;
        }

        // 用户ID筛选
        if (userId) {
            where.userId = userId;
        }

        // 关键词搜索（主题）
        if (keyword) {
            where.topic = Like(`%${keyword}%`);
        }

        // 时间范围筛选
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) {
                where.createdAt = Between(new Date(startDate), endDate ? new Date(endDate) : new Date());
            } else if (endDate) {
                where.createdAt = Between(new Date(0), new Date(endDate));
            }
        }

        const [tasks, total] = await this.taskRepository.findAndCount({
            where,
            order: { createdAt: "DESC" },
            skip,
            take: pageSize,
            relations: ["images"],
        });

        // 统计信息
        const stats = await this.getStats();

        return {
            success: true,
            data: {
                tasks: tasks.map((task) => ({
                    id: task.id,
                    topic: task.topic,
                    status: task.status,
                    statusText: this.getStatusText(task.status),
                    totalPages: task.totalPages,
                    generatedPages: task.generatedPages,
                    coverImageUrl: task.coverImageUrl,
                    userId: task.userId,
                    errorMessage: task.errorMessage,
                    createdAt: task.createdAt,
                    updatedAt: task.updatedAt,
                    imageCount: task.images?.length || 0,
                })),
                pagination: {
                    page,
                    pageSize,
                    total,
                    totalPages: Math.ceil(total / pageSize),
                },
                stats,
            },
        };
    }

    /**
     * 获取任务详情
     */
    @Get(":id")
    async findOne(@Param("id", UUIDValidationPipe) id: string) {
        const task = await this.taskRepository.findOne({
            where: { id },
            relations: ["images"],
        });

        if (!task) {
            throw new Error("任务不存在");
        }

        // 获取所有图片，按页面索引排序
        const images = await this.imageRepository.find({
            where: { taskId: id },
            order: { pageIndex: "ASC" },
        });

        return {
            success: true,
            data: {
                task: {
                    id: task.id,
                    topic: task.topic,
                    outline: task.outline,
                    pages: task.pages,
                    status: task.status,
                    statusText: this.getStatusText(task.status),
                    totalPages: task.totalPages,
                    generatedPages: task.generatedPages,
                    coverImageUrl: task.coverImageUrl,
                    userImages: task.userImages,
                    userId: task.userId,
                    errorMessage: task.errorMessage,
                    createdAt: task.createdAt,
                    updatedAt: task.updatedAt,
                },
                images: images.map((img) => ({
                    id: img.id,
                    taskId: img.taskId,
                    pageIndex: img.pageIndex,
                    pageType: img.pageType,
                    prompt: img.prompt,
                    imageUrl: img.imageUrl,
                    thumbnailUrl: img.thumbnailUrl,
                    status: img.status,
                    errorMessage: img.errorMessage,
                    retryCount: img.retryCount,
                    currentVersion: img.currentVersion || 1,
                    createdAt: img.createdAt,
                })),
            },
        };
    }

    /**
     * 批量删除任务（必须放在 :id 路由之前，避免路由冲突）
     */
    @Delete("batch")
    async removeBatch(@Query("ids") ids: string) {
        if (!ids) {
            throw new Error("请提供要删除的任务ID列表");
        }

        const idArray = ids.split(",").filter((id) => id.trim());
        if (idArray.length === 0) {
            throw new Error("任务ID列表不能为空");
        }

        // 删除关联的图片
        await this.imageRepository.delete({ taskId: In(idArray) });

        // 删除任务
        const result = await this.taskRepository.delete({ id: In(idArray) });

        return {
            success: true,
            message: `成功删除 ${result.affected || 0} 个任务`,
            deletedCount: result.affected || 0,
        };
    }

    /**
     * 删除任务
     */
    @Delete(":id")
    async remove(@Param("id", UUIDValidationPipe) id: string) {
        const task = await this.taskRepository.findOne({
            where: { id },
        });

        if (!task) {
            throw new Error("任务不存在");
        }

        // 删除关联的图片
        await this.imageRepository.delete({ taskId: id });

        // 删除任务
        await this.taskRepository.remove(task);

        return {
            success: true,
            message: "删除成功",
        };
    }

    /**
     * 获取统计信息
     */
    private async getStats() {
        const [
            totalTasks,
            completedTasks,
            failedTasks,
            generatingTasks,
            totalImages,
        ] = await Promise.all([
            this.taskRepository.count(),
            this.taskRepository.count({ where: { status: TaskStatus.COMPLETED } }),
            this.taskRepository.count({ where: { status: TaskStatus.FAILED } }),
            this.taskRepository.count({
                where: [
                    { status: TaskStatus.GENERATING_OUTLINE },
                    { status: TaskStatus.GENERATING_IMAGES },
                ],
            }),
            this.imageRepository.count({ where: { status: "completed" as any } }),
        ]);

        return {
            totalTasks,
            completedTasks,
            failedTasks,
            generatingTasks,
            totalImages,
            successRate: totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : "0.00",
        };
    }

    /**
     * 获取状态文本
     */
    private getStatusText(status: TaskStatus): string {
        const statusMap: Record<TaskStatus, string> = {
            [TaskStatus.PENDING]: "等待中",
            [TaskStatus.GENERATING_OUTLINE]: "生成大纲中",
            [TaskStatus.OUTLINE_READY]: "大纲就绪",
            [TaskStatus.GENERATING_IMAGES]: "生成图片中",
            [TaskStatus.COMPLETED]: "已完成",
            [TaskStatus.FAILED]: "失败",
        };
        return statusMap[status] || status;
    }
}

