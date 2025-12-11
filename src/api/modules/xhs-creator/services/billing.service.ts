import { Injectable, Logger } from "@nestjs/common";
import { Repository, EntityManager, DataSource } from "@buildingai/db/typeorm";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { AppBillingService } from "@buildingai/core/modules";
import {
    ACCOUNT_LOG_TYPE,
    ACCOUNT_LOG_SOURCE,
} from "@buildingai/constants/shared/account-log.constants";

import { XhsUserUsage } from "../../../db/entities/xhs-user-usage.entity";
import { XhsImage, ImageStatus } from "../../../db/entities/xhs-image.entity";
import { XhsConfigService } from "./xhs-config.service";
import { IBillingService, ConsumeType, ConsumeResult, PowerConfig } from "../interfaces/billing.interface";

/**
 * 积分扣减选项
 */
export interface DeductOptions {
    userId: string;
    imageId?: string;
    pageType?: "cover" | "content" | "summary";
    remark?: string;
}

/**
 * 统一计费服务
 * 合并 XhsBillingService 和 ImageBillingService
 * 管理大纲生成和图片生成的免费次数与积分扣减
 */
@Injectable()
export class BillingService implements IBillingService {
    private readonly logger = new Logger(BillingService.name);

    constructor(
        @InjectRepository(XhsUserUsage)
        private readonly usageRepository: Repository<XhsUserUsage>,
        @InjectRepository(XhsImage)
        private readonly imageRepository: Repository<XhsImage>,
        private readonly configService: XhsConfigService,
        private readonly appBillingService: AppBillingService,
        private readonly dataSource: DataSource,
    ) {}

    // ========== 用户使用记录管理 ==========

    /**
     * 获取或创建用户使用记录
     */
    private async getOrCreateUsage(userId: string): Promise<XhsUserUsage> {
        let usage = await this.usageRepository.findOne({
            where: { userId },
        });

        if (!usage) {
            usage = await this.usageRepository.save(
                this.usageRepository.create({
                    userId,
                    freeUsageCount: 0,
                }),
            );
            this.logger.debug(`创建用户使用记录: ${userId}`);
        }

        return usage;
    }

    // ========== 配置与余额查询 ==========

    /**
     * 获取积分配置
     */
    async getPowerConfig(): Promise<PowerConfig> {
        const config = await this.configService.getConfig();
        return {
            outlinePower: config.outlinePower,
            coverImagePower: config.coverImagePower,
            contentImagePower: config.contentImagePower,
            freeUsageLimit: config.freeUsageLimit,
        };
    }

    /**
     * 检查用户是否有免费次数
     */
    async hasFreeUsage(userId: string): Promise<boolean> {
        const [usage, config] = await Promise.all([
            this.getOrCreateUsage(userId),
            this.getPowerConfig(),
        ]);
        return usage.freeUsageCount < config.freeUsageLimit;
    }

    /**
     * 获取用户剩余免费次数
     */
    async getRemainingFreeCount(userId: string): Promise<number> {
        const [usage, config] = await Promise.all([
            this.getOrCreateUsage(userId),
            this.getPowerConfig(),
        ]);
        return Math.max(0, config.freeUsageLimit - usage.freeUsageCount);
    }

    /**
     * 获取用户使用统计
     */
    async getUserUsage(userId: string): Promise<{
        freeUsageCount: number;
        freeUsageLimit: number;
        remainingFreeCount: number;
    }> {
        const [usage, config] = await Promise.all([
            this.getOrCreateUsage(userId),
            this.getPowerConfig(),
        ]);
        return {
            freeUsageCount: usage.freeUsageCount,
            freeUsageLimit: config.freeUsageLimit,
            remainingFreeCount: Math.max(0, config.freeUsageLimit - usage.freeUsageCount),
        };
    }

    /**
     * 检查用户余额是否足够
     * 
     * 逻辑说明：
     * 1. 如果用户还有免费次数，允许进行操作（免费次数覆盖整套图文生成流程）
     * 2. 如果无免费次数，则检查用户积分余额是否足够
     * 
     * 注意：对于图片生成，如果有免费次数，整批图片都免费（不是每张单独扣免费次数）
     */
    async hasSufficientBalance(userId: string, requiredPower: number): Promise<boolean> {
        const hasFree = await this.hasFreeUsage(userId);
        if (hasFree) {
            // 有免费次数时，直接允许操作
            return true;
        }
        
        // 无免费次数，检查实际积分余额
        const userPower = await this.appBillingService.getUserPower(userId);
        return userPower >= requiredPower;
    }

    // ========== 积分计算 ==========

    /**
     * 获取单张图片所需积分
     */
    async getPowerForPage(pageType: "cover" | "content" | "summary"): Promise<number> {
        const config = await this.configService.getConfig();
        return pageType === "cover" ? config.coverImagePower : config.contentImagePower;
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

    // ========== 消费与回退 ==========

    /**
     * 消费一次（优先使用免费次数，否则扣积分）
     */
    async consume(
        userId: string,
        type: ConsumeType,
        pageType?: "cover" | "content" | "summary",
        associationNo?: string,
    ): Promise<ConsumeResult> {
        const [usage, config] = await Promise.all([
            this.getOrCreateUsage(userId),
            this.getPowerConfig(),
        ]);

        // 计算所需积分
        let powerAmount = 0;
        if (type === "outline") {
            powerAmount = config.outlinePower;
        } else if (type === "image") {
            powerAmount = pageType === "cover" ? config.coverImagePower : config.contentImagePower;
        }

        // 检查是否有免费次数
        if (usage.freeUsageCount < config.freeUsageLimit) {
            await this.usageRepository.increment(
                { id: usage.id },
                "freeUsageCount",
                1,
            );
            this.logger.log(
                `用户 ${userId} 使用免费次数 (${type})，已使用: ${usage.freeUsageCount + 1}/${config.freeUsageLimit}`,
            );
            return { isFree: true, powerDeducted: 0 };
        }

        // 无免费次数，扣积分
        if (powerAmount > 0) {
            await this.appBillingService.deductUserPower({
                userId,
                amount: powerAmount,
                accountType: ACCOUNT_LOG_TYPE.PLUGIN_DEC,
                source: {
                    type: ACCOUNT_LOG_SOURCE.PLUGIN,
                    source: "buildingai-xhs-creator",
                },
                remark: type === "outline"
                    ? "小红书大纲生成"
                    : `小红书图片生成 - ${pageType === "cover" ? "封面" : "内容"}页`,
                associationNo: associationNo || "",
            });
            this.logger.log(
                `用户 ${userId} 扣减积分 ${powerAmount} (${type})`,
            );
        }

        return { isFree: false, powerDeducted: powerAmount };
    }

    /**
     * 回退积分（生成失败时调用）
     */
    async rollbackPower(
        userId: string,
        powerAmount: number,
        type: ConsumeType,
        pageType?: "cover" | "content" | "summary",
        associationNo?: string,
    ): Promise<void> {
        if (powerAmount <= 0) {
            return;
        }

        await this.appBillingService.addUserPower({
            userId,
            amount: powerAmount,
            accountType: ACCOUNT_LOG_TYPE.PLUGIN_DEC,
            source: {
                type: ACCOUNT_LOG_SOURCE.PLUGIN,
                source: "buildingai-xhs-creator",
            },
            remark: type === "outline"
                ? "小红书大纲生成失败回退"
                : `小红书图片生成失败回退 - ${pageType === "cover" ? "封面" : "内容"}页`,
            associationNo: associationNo || "",
        });

        this.logger.log(`用户 ${userId} 回退积分 ${powerAmount} (${type})`);
    }

    // ========== 图片专用方法 ==========

    /**
     * 图片积分扣减（事务化）
     */
    async deductImagePower(options: DeductOptions, manager?: EntityManager): Promise<number> {
        const { userId, imageId, pageType, remark } = options;

        if (!imageId || !pageType) {
            throw new Error("图片扣减积分需要 imageId 和 pageType");
        }

        // 先检查是否有免费次数
        const hasFree = await this.hasFreeUsage(userId);
        if (hasFree) {
            await this.consume(userId, "image", pageType, imageId);
            
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
            await this.appBillingService.deductUserPower(
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
     * 图片积分回退（事务化）
     */
    async rollbackImagePower(
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
            await this.appBillingService.addUserPower(
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
     */
    async executeWithBilling<T>(
        options: DeductOptions,
        operation: () => Promise<T>,
    ): Promise<{ result: T; powerAmount: number }> {
        const { userId, imageId, pageType } = options;

        if (!imageId || !pageType) {
            throw new Error("executeWithBilling 需要 imageId 和 pageType");
        }

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
            powerAmount = await this.deductImagePower(options);
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
                await this.rollbackImagePower(
                    userId,
                    imageId,
                    powerAmount,
                    pageType,
                    (error as Error).message,
                );
            }
            throw error;
        }
    }
}
