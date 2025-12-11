/**
 * 计费服务通用接口
 * 定义统一的计费操作规范
 */
export interface IBillingService {
    /**
     * 检查用户是否有足够余额
     * @param userId 用户ID
     * @param requiredPower 需要的积分数
     */
    hasSufficientBalance(userId: string, requiredPower: number): Promise<boolean>;

    /**
     * 检查用户是否有免费次数
     */
    hasFreeUsage(userId: string): Promise<boolean>;

    /**
     * 消费一次（优先使用免费次数）
     */
    consume(
        userId: string,
        type: ConsumeType,
        pageType?: "cover" | "content" | "summary",
        associationNo?: string,
    ): Promise<ConsumeResult>;

    /**
     * 回退积分（生成失败时）
     */
    rollbackPower(
        userId: string,
        power: number,
        type: ConsumeType,
        pageType?: "cover" | "content" | "summary",
        associationNo?: string,
    ): Promise<void>;
}

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
 * 计费类型枚举
 */
export enum BillingType {
    OUTLINE = "outline",
    COVER_IMAGE = "cover_image",
    CONTENT_IMAGE = "content_image",
    SUMMARY_IMAGE = "summary_image",
}

/**
 * 页面类型到计费类型的映射
 */
export const PAGE_TYPE_TO_BILLING: Record<string, BillingType> = {
    cover: BillingType.COVER_IMAGE,
    content: BillingType.CONTENT_IMAGE,
    summary: BillingType.SUMMARY_IMAGE,
};

/**
 * 计费记录
 */
export interface BillingRecord {
    /** 账单记录号 */
    accountNo: string;
    /** 用户ID */
    userId: string;
    /** 计费类型 */
    type: BillingType;
    /** 积分数量 */
    power: number;
    /** 描述 */
    description: string;
    /** 创建时间 */
    createdAt: Date;
}

/**
 * 积分配置
 */
export interface PowerConfig {
    /** 大纲生成积分 */
    outlinePower: number;
    /** 封面图积分 */
    coverImagePower: number;
    /** 内容图积分 */
    contentImagePower: number;
    /** 免费使用次数 */
    freeUsageLimit: number;
}

