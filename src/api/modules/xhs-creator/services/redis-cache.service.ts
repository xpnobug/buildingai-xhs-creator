import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";

/**
 * 缓存配置
 */
export interface CacheConfig {
    /** 默认 TTL（秒） */
    defaultTtl: number;
    /** 用户余额 TTL（秒） */
    balanceTtl: number;
    /** 配置 TTL（秒） */
    configTtl: number;
    /** 是否启用缓存 */
    enabled: boolean;
}

const DEFAULT_CONFIG: CacheConfig = {
    defaultTtl: 300,       // 5分钟
    balanceTtl: 60,        // 1分钟（余额需要更实时）
    configTtl: 300,        // 5分钟
    enabled: true,
};

/**
 * 缓存键前缀
 */
const CACHE_KEYS = {
    USER_BALANCE: "xhs:balance:",
    USER_USAGE: "xhs:usage:",
    POWER_CONFIG: "xhs:config:power",
    ACTIVE_TASKS: "xhs:tasks:active:",
};

/**
 * Redis 缓存服务
 * 
 * 提供应用级缓存，支持：
 * - 用户积分余额缓存
 * - 配置数据缓存
 * - 活跃任务状态缓存
 * 
 * 注意：当前为内存实现，生产环境应替换为 Redis
 */
@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RedisCacheService.name);
    private readonly config: CacheConfig;
    
    // 内存缓存（开发/测试环境使用）
    private readonly cache = new Map<string, { value: any; expiresAt: number }>();
    private cleanupTimer: NodeJS.Timeout | null = null;

    constructor(config?: Partial<CacheConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    onModuleInit(): void {
        // 启动定期清理过期缓存
        this.cleanupTimer = setInterval(() => {
            this.cleanupExpired();
        }, 60000); // 每分钟清理一次
        
        this.logger.log("Redis 缓存服务已启动（内存模式）");
    }

    onModuleDestroy(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        this.cache.clear();
        this.logger.log("Redis 缓存服务已停止");
    }

    // ========== 基础操作 ==========

    /**
     * 获取缓存值
     */
    async get<T>(key: string): Promise<T | null> {
        if (!this.config.enabled) return null;

        const entry = this.cache.get(key);
        if (!entry) return null;

        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        return entry.value as T;
    }

    /**
     * 设置缓存值
     */
    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
        if (!this.config.enabled) return;

        const ttl = ttlSeconds || this.config.defaultTtl;
        const expiresAt = Date.now() + ttl * 1000;

        this.cache.set(key, { value, expiresAt });
    }

    /**
     * 删除缓存
     */
    async del(key: string): Promise<void> {
        this.cache.delete(key);
    }

    /**
     * 按模式删除缓存
     */
    async delByPattern(pattern: string): Promise<number> {
        let count = 0;
        const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
        
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.cache.delete(key);
                count++;
            }
        }
        
        return count;
    }

    /**
     * 检查缓存是否存在
     */
    async exists(key: string): Promise<boolean> {
        const entry = this.cache.get(key);
        if (!entry) return false;
        
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return false;
        }
        
        return true;
    }

    // ========== 用户余额缓存 ==========

    /**
     * 获取用户余额缓存
     */
    async getUserBalance(userId: string): Promise<number | null> {
        const key = CACHE_KEYS.USER_BALANCE + userId;
        return this.get<number>(key);
    }

    /**
     * 设置用户余额缓存
     */
    async setUserBalance(userId: string, balance: number): Promise<void> {
        const key = CACHE_KEYS.USER_BALANCE + userId;
        await this.set(key, balance, this.config.balanceTtl);
    }

    /**
     * 清除用户余额缓存（余额变化时调用）
     */
    async invalidateUserBalance(userId: string): Promise<void> {
        const key = CACHE_KEYS.USER_BALANCE + userId;
        await this.del(key);
    }

    // ========== 用户使用次数缓存 ==========

    /**
     * 获取用户免费使用次数缓存
     */
    async getUserUsage(userId: string, type: "outline" | "image"): Promise<number | null> {
        const key = `${CACHE_KEYS.USER_USAGE}${userId}:${type}`;
        return this.get<number>(key);
    }

    /**
     * 设置用户免费使用次数缓存
     */
    async setUserUsage(userId: string, type: "outline" | "image", count: number): Promise<void> {
        const key = `${CACHE_KEYS.USER_USAGE}${userId}:${type}`;
        await this.set(key, count, this.config.balanceTtl);
    }

    /**
     * 清除用户使用次数缓存
     */
    async invalidateUserUsage(userId: string): Promise<void> {
        await this.delByPattern(`${CACHE_KEYS.USER_USAGE}${userId}:*`);
    }

    // ========== 配置缓存 ==========

    /**
     * 获取积分配置缓存
     */
    async getPowerConfig(): Promise<any | null> {
        return this.get<any>(CACHE_KEYS.POWER_CONFIG);
    }

    /**
     * 设置积分配置缓存
     */
    async setPowerConfig(config: any): Promise<void> {
        await this.set(CACHE_KEYS.POWER_CONFIG, config, this.config.configTtl);
    }

    /**
     * 清除配置缓存
     */
    async invalidatePowerConfig(): Promise<void> {
        await this.del(CACHE_KEYS.POWER_CONFIG);
    }

    // ========== 任务状态缓存 ==========

    /**
     * 缓存活跃任务状态
     */
    async setActiveTaskStatus(
        taskId: string,
        status: {
            progress: number;
            stage: string;
            completedPages: number[];
        },
    ): Promise<void> {
        const key = CACHE_KEYS.ACTIVE_TASKS + taskId;
        await this.set(key, status, 600); // 10分钟
    }

    /**
     * 获取活跃任务状态
     */
    async getActiveTaskStatus(taskId: string): Promise<{
        progress: number;
        stage: string;
        completedPages: number[];
    } | null> {
        const key = CACHE_KEYS.ACTIVE_TASKS + taskId;
        return this.get(key);
    }

    /**
     * 清除任务状态缓存
     */
    async invalidateTaskStatus(taskId: string): Promise<void> {
        const key = CACHE_KEYS.ACTIVE_TASKS + taskId;
        await this.del(key);
    }

    // ========== 工具方法 ==========

    /**
     * 清理过期缓存
     */
    private cleanupExpired(): void {
        const now = Date.now();
        let expired = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
                expired++;
            }
        }

        if (expired > 0) {
            this.logger.debug(`清理了 ${expired} 个过期缓存`);
        }
    }

    /**
     * 获取缓存统计
     */
    getCacheStats(): {
        size: number;
        enabled: boolean;
    } {
        return {
            size: this.cache.size,
            enabled: this.config.enabled,
        };
    }

    /**
     * 清空所有缓存
     */
    async flushAll(): Promise<void> {
        this.cache.clear();
        this.logger.log("已清空所有缓存");
    }
}
