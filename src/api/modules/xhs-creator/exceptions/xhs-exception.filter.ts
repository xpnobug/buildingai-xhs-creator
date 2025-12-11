import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from "@nestjs/common";
import { Response } from "express";

import { XhsException, XhsErrorCode } from "./xhs.exception";

/**
 * XHS Creator 全局异常过滤器
 * 统一处理所有异常，返回结构化的错误响应
 */
@Catch()
export class XhsExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(XhsExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest();

        let status: number;
        let errorCode: string;
        let message: string;
        let details: Record<string, any> | undefined;

        if (exception instanceof XhsException) {
            // 自定义 XhsException
            status = exception.getStatus();
            errorCode = exception.errorCode;
            message = exception.message;
            details = exception.details;

            this.logger.warn(
                `[${errorCode}] ${message}`,
                details ? JSON.stringify(details) : "",
            );
        } else if (exception instanceof HttpException) {
            // 标准 NestJS HttpException
            status = exception.getStatus();
            errorCode = XhsErrorCode.UNKNOWN_ERROR;
            const responseBody = exception.getResponse();
            message =
                typeof responseBody === "string"
                    ? responseBody
                    : (responseBody as any).message || exception.message;

            this.logger.warn(`[HTTP ${status}] ${message}`);
        } else if (exception instanceof Error) {
            // 普通 Error
            status = HttpStatus.INTERNAL_SERVER_ERROR;
            errorCode = XhsErrorCode.UNKNOWN_ERROR;
            message = exception.message || "服务器内部错误";

            this.logger.error(
                `[ERROR] ${message}`,
                exception.stack,
            );
        } else {
            // 未知异常
            status = HttpStatus.INTERNAL_SERVER_ERROR;
            errorCode = XhsErrorCode.UNKNOWN_ERROR;
            message = "未知错误";

            this.logger.error(`[UNKNOWN] ${String(exception)}`);
        }

        const errorResponse = {
            success: false,
            errorCode,
            message,
            details,
            timestamp: new Date().toISOString(),
            path: request.url,
        };

        response.status(status).json(errorResponse);
    }
}
