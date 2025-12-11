import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from "@nestjs/common";

/**
 * 简易请求频率限制守卫
 * 基于内存的令牌桶算法实现
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
    /** 请求记录：用户ID -> 时间戳数组 */
    private readonly requests = new Map<string, number[]>();

    /** 时间窗口（毫秒） */
    private readonly windowMs = 60 * 1000; // 1分钟

    /** 每个时间窗口最大请求数 */
    private readonly maxRequests = 30;

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const userId = this.extractUserId(request);

        if (!userId) {
            // 未登录用户使用 IP 限制
            return this.checkLimit(`ip:${request.ip || "unknown"}`);
        }

        return this.checkLimit(`user:${userId}`);
    }

    /**
     * 检查请求是否在限制内
     */
    private checkLimit(key: string): boolean {
        const now = Date.now();
        const windowStart = now - this.windowMs;

        // 获取或初始化请求记录
        let timestamps = this.requests.get(key) || [];

        // 过滤掉过期的请求记录
        timestamps = timestamps.filter((t) => t > windowStart);

        // 检查是否超过限制
        if (timestamps.length >= this.maxRequests) {
            throw new HttpException(
                {
                    success: false,
                    errorCode: "RATE_LIMITED",
                    message: `请求过于频繁，请在 ${Math.ceil((timestamps[0] - windowStart) / 1000)} 秒后重试`,
                },
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        // 记录当前请求
        timestamps.push(now);
        this.requests.set(key, timestamps);

        // 定期清理过期数据（每100次请求清理一次）
        if (Math.random() < 0.01) {
            this.cleanup();
        }

        return true;
    }

    /**
     * 从请求中提取用户ID
     */
    private extractUserId(request: any): string | null {
        return request.user?.id || request.headers["x-user-id"] || null;
    }

    /**
     * 清理过期的请求记录
     */
    private cleanup(): void {
        const now = Date.now();
        const windowStart = now - this.windowMs;

        for (const [key, timestamps] of this.requests.entries()) {
            const valid = timestamps.filter((t) => t > windowStart);
            if (valid.length === 0) {
                this.requests.delete(key);
            } else {
                this.requests.set(key, valid);
            }
        }
    }
}

/**
 * 生成接口专用限流守卫（更严格）
 * 每分钟最多 10 次生成请求
 */
@Injectable()
export class GenerationRateLimitGuard extends RateLimitGuard {
    private readonly genRequests = new Map<string, number[]>();
    private readonly genWindowMs = 60 * 1000;
    private readonly genMaxRequests = 10;

    canActivate(context: ExecutionContext): boolean {
        // 先通过基础限流
        const baseResult = super.canActivate(context);
        if (!baseResult) return false;

        const request = context.switchToHttp().getRequest();
        const userId = request.user?.id || request.ip || "unknown";

        return this.checkGenerationLimit(`gen:${userId}`);
    }

    private checkGenerationLimit(key: string): boolean {
        const now = Date.now();
        const windowStart = now - this.genWindowMs;

        let timestamps = this.genRequests.get(key) || [];
        timestamps = timestamps.filter((t) => t > windowStart);

        if (timestamps.length >= this.genMaxRequests) {
            throw new HttpException(
                {
                    success: false,
                    errorCode: "GENERATION_RATE_LIMITED",
                    message: "生成请求过于频繁，请稍后重试",
                },
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        timestamps.push(now);
        this.genRequests.set(key, timestamps);
        return true;
    }
}
