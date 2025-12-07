import { Injectable, Logger } from "@nestjs/common";
import { Repository, EntityManager } from "@buildingai/db/typeorm";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { AppBillingService } from "@buildingai/core/modules";
import {
    ACCOUNT_LOG_TYPE,
    ACCOUNT_LOG_SOURCE,
} from "@buildingai/constants/shared/account-log.constants";

import { XhsUserUsage } from "../../../db/entities/xhs-user-usage.entity";
import { XhsConfigService } from "./xhs-config.service";

/**
 * 消费类型
 */
export type ConsumeType = "outline" | "image";

/**
 * 消费结果
 */
export interface ConsumeResult {
    /** 是否使用免费次数 */
    isFree: boolean;
    /** 扣减的积分数量（免费时为0） */
    powerDeducted: number;
}

/**
 * 积分配置
 */
export interface PowerConfig {
    outlinePower: number;
    coverImagePower: number;
    contentImagePower: number;
    freeUsageLimit: number;
}

/**
 * 小红书统一计费服务
 * 管理大纲生成和图片生成的免费次数与积分扣减
 */
@Injectable()
export class XhsBillingService {
    private readonly logger = new Logger(XhsBillingService.name);

    constructor(
        @InjectRepository(XhsUserUsage)
        private readonly usageRepository: Repository<XhsUserUsage>,
        private readonly configService: XhsConfigService,
        private readonly billingService: AppBillingService,
    ) {}

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
     * 消费一次（优先使用免费次数，否则扣积分）
     * @param userId 用户ID
     * @param type 消费类型：outline 或 image
     * @param pageType 图片页面类型（仅 type=image 时需要）
     * @param associationNo 关联单号（可选）
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
            // 使用免费次数
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
            await this.billingService.deductUserPower({
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

        await this.billingService.addUserPower({
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

    /**
     * 检查用户余额是否足够
     */
    async hasSufficientBalance(userId: string, requiredPower: number): Promise<boolean> {
        // 先检查免费次数
        const hasFree = await this.hasFreeUsage(userId);
        if (hasFree) {
            return true;
        }
        // 无免费次数，检查积分
        return this.billingService.hasSufficientPower(userId, requiredPower);
    }
}
