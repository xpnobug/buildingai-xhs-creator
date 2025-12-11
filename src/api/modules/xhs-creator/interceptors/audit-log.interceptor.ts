import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Logger,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap, catchError } from "rxjs/operators";

/**
 * 审计日志拦截器
 * 记录关键操作的请求和响应
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
    private readonly logger = new Logger("AuditLog");

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();
        const { method, url, body, user } = request;

        const userId = user?.id || "anonymous";
        const startTime = Date.now();

        // 记录请求
        this.logger.log(
            `[REQUEST] ${method} ${url} | User: ${userId} | Body: ${this.summarizeBody(body)}`,
        );

        return next.handle().pipe(
            tap((response) => {
                const duration = Date.now() - startTime;
                this.logger.log(
                    `[RESPONSE] ${method} ${url} | User: ${userId} | Duration: ${duration}ms | Success`,
                );
            }),
            catchError((error) => {
                const duration = Date.now() - startTime;
                this.logger.warn(
                    `[ERROR] ${method} ${url} | User: ${userId} | Duration: ${duration}ms | Error: ${error.message}`,
                );
                throw error;
            }),
        );
    }

    /**
     * 摘要请求体（避免日志过大）
     */
    private summarizeBody(body: any): string {
        if (!body) return "{}";

        const summary: Record<string, any> = {};
        for (const key of Object.keys(body).slice(0, 5)) {
            const value = body[key];
            if (typeof value === "string" && value.length > 100) {
                summary[key] = `${value.slice(0, 100)}...`;
            } else if (Array.isArray(value)) {
                summary[key] = `[Array(${value.length})]`;
            } else {
                summary[key] = value;
            }
        }

        return JSON.stringify(summary);
    }
}
