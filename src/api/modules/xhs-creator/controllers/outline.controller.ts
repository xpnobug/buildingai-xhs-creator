import { Body, Post, Req, BadRequestException } from "@nestjs/common";
import { OutlineService, XhsBillingService } from "../services";
import { CreateOutlineDto } from "../dto";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { Repository } from "@buildingai/db/typeorm";
import { XhsTask, TaskStatus } from "../../../db/entities/xhs-task.entity";
import { ExtensionWebController } from "@buildingai/core/decorators";
import type { Request } from "express";

/**
 * 大纲生成控制器
 */
@ExtensionWebController("outline")
export class OutlineController {
    constructor(
        private readonly outlineService: OutlineService,
        @InjectRepository(XhsTask)
        private taskRepository: Repository<XhsTask>,
        private readonly xhsBillingService: XhsBillingService,
    ) {}

    /**
     * 生成大纲
     */
    @Post()
    async generateOutline(@Body() dto: CreateOutlineDto, @Req() req: Request) {
        // 当前登录用户（由主系统注入）
        const user: any = (req as any).user;
        const userId = user?.id;

        if (!userId) {
            throw new BadRequestException("用户未登录");
        }

        // 获取积分配置，检查是否有免费次数或足够积分
        const config = await this.xhsBillingService.getPowerConfig();
        const hasSufficientBalance = await this.xhsBillingService.hasSufficientBalance(
            userId,
            config.outlinePower,
        );
        if (!hasSufficientBalance) {
            throw new BadRequestException("积分不足，请充值后再试");
        }

        // 消费（优先使用免费次数，否则扣积分）
        const billing = await this.xhsBillingService.consume(userId, "outline");

        // 创建任务记录
        const task = this.taskRepository.create({
            topic: dto.topic,
            userImages: dto.userImages || [],
            status: TaskStatus.GENERATING_OUTLINE,
            totalPages: 0,
            generatedPages: 0,
            userId,
        });
        await this.taskRepository.save(task);

        try {
            // 调用服务生成大纲
            const result = await this.outlineService.generateOutline(
                dto.topic,
                dto.userImages,
            );

            // 更新任务
            task.outline = result.outline;
            task.pages = result.pages;
            task.status = TaskStatus.OUTLINE_READY;
            task.totalPages = result.pages.length;
            await this.taskRepository.save(task);

            return {
                success: true,
                taskId: task.id,
                outline: result.outline,
                pages: result.pages,
                billing: {
                    isFree: billing.isFree,
                    powerDeducted: billing.powerDeducted,
                },
            };
        } catch (error) {
            // 生成失败，回退积分（如果已扣）
            if (!billing.isFree && billing.powerDeducted > 0) {
                await this.xhsBillingService.rollbackPower(
                    userId,
                    billing.powerDeducted,
                    "outline",
                );
            }

            // 记录错误
            task.status = TaskStatus.FAILED;
            task.errorMessage = error.message;
            await this.taskRepository.save(task);

            throw error;
        }
    }
}
