import { Body, Controller, Post, Request } from "@nestjs/common";
import { ExtensionWebController } from "@buildingai/core/decorators";
import { AppBillingService } from "@buildingai/core/modules";

import { XhsConfigService } from "../services/xhs-config.service";

/**
 * 余额检查控制器
 */
@ExtensionWebController("balance")
export class BalanceController {
    constructor(
        private readonly billingService: AppBillingService,
        private readonly configService: XhsConfigService,
    ) {}

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
        const hasSufficient = await this.billingService.hasSufficientPower(
            userId,
            requiredPower,
        );

        if (!hasSufficient) {
            // 获取用户当前余额
            const userBalance = await this.billingService.getUserPower(userId);
            
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
