import { Body, Controller, Get, Post, Request } from "@nestjs/common";
import { ExtensionWebController } from "@buildingai/core/decorators";
import { AppBillingService } from "@buildingai/core/modules";

import { XhsConfigService } from "../services/xhs-config.service";
import { BillingService } from "../services/billing.service";

/**
 * 余额检查控制器
 */
@ExtensionWebController("balance")
export class BalanceController {
    constructor(
        private readonly appBillingService: AppBillingService,
        private readonly configService: XhsConfigService,
        private readonly billingService: BillingService,
    ) {}

    /**
     * 获取用户使用统计（免费次数、余额等）
     */
    @Get("usage")
    async getUserUsage(@Request() req: any): Promise<{
        success: boolean;
        data?: {
            freeUsageCount: number;
            freeUsageLimit: number;
            remainingFreeCount: number;
            userPower: number;
        };
        message?: string;
    }> {
        const userId = req.user?.id;
        
        if (!userId) {
            return {
                success: false,
                message: "未登录",
            };
        }

        const usage = await this.billingService.getUserUsage(userId);
        const userPower = await this.appBillingService.getUserPower(userId);

        return {
            success: true,
            data: {
                ...usage,
                userPower,
            },
        };
    }

    /**
     * 检查用户余额是否充足
     */
    @Post("check")
    async checkBalance(
        @Request() req: any,
        @Body("requiredPower") requiredPower: number,
    ): Promise<{ success: boolean; message?: string }> {
        const userId = req.user?.id;
        
        if (!userId) {
            return {
                success: false,
                message: "未登录",
            };
        }

        if (!requiredPower || requiredPower <= 0) {
            return {
                success: false,
                message: "无效的积分需求",
            };
        }

        // 检查用户余额
        const hasSufficient = await this.appBillingService.hasSufficientPower(
            userId,
            requiredPower,
        );

        if (!hasSufficient) {
            // 获取用户当前余额
            const userBalance = await this.appBillingService.getUserPower(userId);
            
            return {
                success: false,
                message: `余额不足，需要 ${requiredPower} 积分，当前余额 ${userBalance} 积分，请充值后重试`,
            };
        }

        return {
            success: true,
        };
    }
}

