import { Injectable, Logger } from "@nestjs/common";
import { Repository, EntityManager } from "@buildingai/db/typeorm";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { AppBillingService } from "@buildingai/core/modules";
import {
    ACCOUNT_LOG_TYPE,
    ACCOUNT_LOG_SOURCE,
} from "@buildingai/constants/shared/account-log.constants";

import { XhsImage, ImageStatus } from "../../../db/entities/xhs-image.entity";
import { XhsConfigService } from "./xhs-config.service";
import { XhsBillingService } from "./xhs-billing.service";

/**
 * 图片积分计费结果
 */
export interface BillingResult {
    success: boolean;
    powerAmount: number;
    error?: string;
}

/**
 * 积分扣减选项
 */
export interface DeductOptions {
    userId: string;
    imageId: string;
    pageType: "cover" | "content" | "summary";
    remark?: string;
}

/**
 * 图片积分计费服务
 * 负责图片生成的积分扣减与回退
 */
@Injectable()
export class ImageBillingService {
    private readonly logger = new Logger(ImageBillingService.name);

    constructor(
        @InjectRepository(XhsImage)
        private readonly imageRepository: Repository<XhsImage>,
        private readonly configService: XhsConfigService,
        private readonly billingService: AppBillingService,
        private readonly xhsBillingService: XhsBillingService,
    ) {}

    /**
     * 验证用户余额是否足够（考虑免费次数）
     */
    async hasSufficientBalance(userId: string, requiredPower: number): Promise<boolean> {
        return this.xhsBillingService.hasSufficientBalance(userId, requiredPower);
    }

    /**
     * 计算所需积分总数
     */
    async calculateTotalPower(
        pages: Array<{ type: "cover" | "content" | "summary" }>,
    ): Promise<number> {
        const config = await this.configService.getConfig();
        return pages.reduce((sum, page) => {
            const power =
                page.type === "cover" ? config.coverImagePower : config.contentImagePower;
            return sum + power;
        }, 0);
    }

    /**
     * 获取单张图片所需积分
     */
    async getPowerForPage(pageType: "cover" | "content" | "summary"): Promise<number> {
        const config = await this.configService.getConfig();
        return pageType === "cover" ? config.coverImagePower : config.contentImagePower;
    }

    /**
     * 扣减积分（事务化）- 优先使用免费次数
     * @returns 返回扣减的积分数量（免费时为0）
     */
    async deductPower(options: DeductOptions, manager?: EntityManager): Promise<number> {
        const { userId, imageId, pageType, remark } = options;

        // 先检查是否有免费次数
        const hasFree = await this.xhsBillingService.hasFreeUsage(userId);
        if (hasFree) {
            // 使用免费次数
            await this.xhsBillingService.consume(userId, "image", pageType, imageId);
            
            // 更新图片记录状态（免费，不扣积分）
            const execManager = manager || this.imageRepository.manager;
            await execManager.update(XhsImage, imageId, {
                status: ImageStatus.GENERATING,
                powerDeducted: false,
                powerAmount: 0,
            });
            
            this.logger.debug(`图片 ${imageId} 使用免费次数`);
            return 0;
        }

        // 无免费次数，扣积分
        const powerAmount = await this.getPowerForPage(pageType);
        const execManager = manager || this.imageRepository.manager;

        await execManager.transaction(async (txManager) => {
            // 扣减积分
            await this.billingService.deductUserPower(
                {
                    userId,
                    amount: powerAmount,
                    accountType: ACCOUNT_LOG_TYPE.PLUGIN_DEC,
                    source: {
                        type: ACCOUNT_LOG_SOURCE.PLUGIN,
                        source: "buildingai-xhs-creator",
                    },
                    remark: remark || `小红书图片生成 - ${pageType === "cover" ? "封面" : "内容"}页`,
                    associationNo: imageId,
                },
                txManager,
            );

            // 更新图片记录状态
            await txManager.update(XhsImage, imageId, {
                status: ImageStatus.GENERATING,
                powerDeducted: true,
                powerAmount,
            });
        });

        this.logger.debug(`图片 ${imageId} 扣减积分成功: ${powerAmount}`);
        return powerAmount;
    }

    /**
     * 回退积分（事务化）- 生成失败时调用
     */
    async rollbackPower(
        userId: string,
        imageId: string,
        powerAmount: number,
        pageType: "cover" | "content" | "summary",
        errorMessage: string,
        manager?: EntityManager,
    ): Promise<void> {
        if (powerAmount <= 0) {
            this.logger.warn(`图片 ${imageId} 无需回退积分（积分为0）`);
            return;
        }

        const execManager = manager || this.imageRepository.manager;

        await execManager.transaction(async (txManager) => {
            // 回退积分
            await this.billingService.addUserPower(
                {
                    userId,
                    amount: powerAmount,
                    accountType: ACCOUNT_LOG_TYPE.PLUGIN_DEC,
                    source: {
                        type: ACCOUNT_LOG_SOURCE.PLUGIN,
                        source: "buildingai-xhs-creator",
                    },
                    remark: `图片生成失败回退 - ${pageType === "cover" ? "封面" : "内容"}页`,
                    associationNo: imageId,
                },
                txManager,
            );

            // 更新图片记录状态
            await txManager.update(XhsImage, imageId, {
                status: ImageStatus.FAILED,
                errorMessage,
                retryCount: () => "retry_count + 1",
                powerDeducted: false,
                powerAmount: 0,
            });
        });

        this.logger.debug(`图片 ${imageId} 回退积分成功: ${powerAmount}`);
    }

    /**
     * 执行带积分扣减的操作，失败自动回退
     * @param options 扣减选项
     * @param operation 要执行的操作，返回生成的图片URL
     * @returns 操作结果
     */
    async executeWithBilling<T>(
        options: DeductOptions,
        operation: () => Promise<T>,
    ): Promise<{ result: T; powerAmount: number }> {
        const { userId, imageId, pageType } = options;

        // 检查是否已扣减（幂等性）
        const imageRecord = await this.imageRepository.findOne({
            where: { id: imageId },
        });

        if (!imageRecord) {
            throw new Error(`图片记录不存在: ${imageId}`);
        }

        let powerAmount = 0;

        // 如果尚未扣减，则进行扣减
        if (!imageRecord.powerDeducted) {
            powerAmount = await this.deductPower(options);
        } else {
            powerAmount = imageRecord.powerAmount;
            this.logger.warn(`图片 ${imageId} 已扣减积分，跳过重复扣减`);
        }

        try {
            const result = await operation();
            return { result, powerAmount };
        } catch (error) {
            // 操作失败，回退积分
            if (powerAmount > 0) {
                await this.rollbackPower(
                    userId,
                    imageId,
                    powerAmount,
                    pageType,
                    error.message,
                );
            }
            throw error;
        }
    }
}
