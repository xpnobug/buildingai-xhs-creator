import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * XHS Creator 错误码枚举
 */
export enum XhsErrorCode {
    // 通用错误 (1xxx)
    UNKNOWN_ERROR = "XHS_1000",
    INVALID_REQUEST = "XHS_1001",
    UNAUTHORIZED = "XHS_1002",
    FORBIDDEN = "XHS_1003",

    // 任务相关 (2xxx)
    TASK_NOT_FOUND = "XHS_2001",
    TASK_ALREADY_EXISTS = "XHS_2002",
    TASK_INVALID_STATUS = "XHS_2003",
    TASK_GENERATION_FAILED = "XHS_2004",

    // 图片相关 (3xxx)
    IMAGE_NOT_FOUND = "XHS_3001",
    IMAGE_GENERATION_FAILED = "XHS_3002",
    IMAGE_VERSION_NOT_FOUND = "XHS_3003",
    IMAGE_RESTORE_FAILED = "XHS_3004",

    // 计费相关 (4xxx)
    INSUFFICIENT_BALANCE = "XHS_4001",
    BILLING_DEDUCT_FAILED = "XHS_4002",
    BILLING_ROLLBACK_FAILED = "XHS_4003",
    FREE_USAGE_EXHAUSTED = "XHS_4004",

    // 配置相关 (5xxx)
    CONFIG_NOT_FOUND = "XHS_5001",
    CONFIG_INVALID = "XHS_5002",

    // AI 服务相关 (6xxx)
    AI_SERVICE_UNAVAILABLE = "XHS_6001",
    AI_GENERATION_TIMEOUT = "XHS_6002",
    AI_RATE_LIMITED = "XHS_6003",
}

/**
 * 错误码到 HTTP 状态码的映射
 */
const ERROR_CODE_TO_STATUS: Record<XhsErrorCode, HttpStatus> = {
    [XhsErrorCode.UNKNOWN_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
    [XhsErrorCode.INVALID_REQUEST]: HttpStatus.BAD_REQUEST,
    [XhsErrorCode.UNAUTHORIZED]: HttpStatus.UNAUTHORIZED,
    [XhsErrorCode.FORBIDDEN]: HttpStatus.FORBIDDEN,

    [XhsErrorCode.TASK_NOT_FOUND]: HttpStatus.NOT_FOUND,
    [XhsErrorCode.TASK_ALREADY_EXISTS]: HttpStatus.CONFLICT,
    [XhsErrorCode.TASK_INVALID_STATUS]: HttpStatus.BAD_REQUEST,
    [XhsErrorCode.TASK_GENERATION_FAILED]: HttpStatus.INTERNAL_SERVER_ERROR,

    [XhsErrorCode.IMAGE_NOT_FOUND]: HttpStatus.NOT_FOUND,
    [XhsErrorCode.IMAGE_GENERATION_FAILED]: HttpStatus.INTERNAL_SERVER_ERROR,
    [XhsErrorCode.IMAGE_VERSION_NOT_FOUND]: HttpStatus.NOT_FOUND,
    [XhsErrorCode.IMAGE_RESTORE_FAILED]: HttpStatus.INTERNAL_SERVER_ERROR,

    [XhsErrorCode.INSUFFICIENT_BALANCE]: HttpStatus.PAYMENT_REQUIRED,
    [XhsErrorCode.BILLING_DEDUCT_FAILED]: HttpStatus.INTERNAL_SERVER_ERROR,
    [XhsErrorCode.BILLING_ROLLBACK_FAILED]: HttpStatus.INTERNAL_SERVER_ERROR,
    [XhsErrorCode.FREE_USAGE_EXHAUSTED]: HttpStatus.PAYMENT_REQUIRED,

    [XhsErrorCode.CONFIG_NOT_FOUND]: HttpStatus.NOT_FOUND,
    [XhsErrorCode.CONFIG_INVALID]: HttpStatus.BAD_REQUEST,

    [XhsErrorCode.AI_SERVICE_UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
    [XhsErrorCode.AI_GENERATION_TIMEOUT]: HttpStatus.GATEWAY_TIMEOUT,
    [XhsErrorCode.AI_RATE_LIMITED]: HttpStatus.TOO_MANY_REQUESTS,
};

/**
 * XHS Creator 统一异常类
 * 提供结构化的错误信息，便于前端处理
 */
export class XhsException extends HttpException {
    public readonly errorCode: XhsErrorCode;
    public readonly details?: Record<string, any>;

    constructor(
        errorCode: XhsErrorCode,
        message: string,
        details?: Record<string, any>,
    ) {
        const status = ERROR_CODE_TO_STATUS[errorCode] || HttpStatus.INTERNAL_SERVER_ERROR;

        super(
            {
                success: false,
                errorCode,
                message,
                details,
                timestamp: new Date().toISOString(),
            },
            status,
        );

        this.errorCode = errorCode;
        this.details = details;
    }

    /**
     * 创建任务不存在异常
     */
    static taskNotFound(taskId: string): XhsException {
        return new XhsException(
            XhsErrorCode.TASK_NOT_FOUND,
            `任务不存在: ${taskId}`,
            { taskId },
        );
    }

    /**
     * 创建图片不存在异常
     */
    static imageNotFound(taskId: string, pageIndex: number): XhsException {
        return new XhsException(
            XhsErrorCode.IMAGE_NOT_FOUND,
            `图片记录不存在: 任务 ${taskId} 页面 ${pageIndex}`,
            { taskId, pageIndex },
        );
    }

    /**
     * 创建余额不足异常
     */
    static insufficientBalance(required: number, available: number): XhsException {
        return new XhsException(
            XhsErrorCode.INSUFFICIENT_BALANCE,
            `余额不足，需要 ${required} 积分，当前余额 ${available} 积分`,
            { required, available },
        );
    }

    /**
     * 创建图片生成失败异常
     */
    static imageGenerationFailed(reason: string, pageIndex?: number): XhsException {
        return new XhsException(
            XhsErrorCode.IMAGE_GENERATION_FAILED,
            `图片生成失败: ${reason}`,
            { reason, pageIndex },
        );
    }

    /**
     * 创建版本不存在异常
     */
    static versionNotFound(taskId: string, pageIndex: number, version: number): XhsException {
        return new XhsException(
            XhsErrorCode.IMAGE_VERSION_NOT_FOUND,
            `版本不存在: 任务 ${taskId} 页面 ${pageIndex} 版本 ${version}`,
            { taskId, pageIndex, version },
        );
    }

    /**
     * 创建 AI 服务不可用异常
     */
    static aiServiceUnavailable(service: string, reason?: string): XhsException {
        return new XhsException(
            XhsErrorCode.AI_SERVICE_UNAVAILABLE,
            `AI 服务不可用: ${service}${reason ? ` (${reason})` : ""}`,
            { service, reason },
        );
    }

    /**
     * 创建配置不存在异常
     */
    static configNotFound(configId?: string): XhsException {
        return new XhsException(
            XhsErrorCode.CONFIG_NOT_FOUND,
            configId ? `配置不存在: ${configId}` : "配置不存在",
            { configId },
        );
    }
}
