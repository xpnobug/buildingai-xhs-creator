import { Injectable, PipeTransform, ArgumentMetadata, BadRequestException } from "@nestjs/common";

/**
 * XSS 过滤管道
 * 自动过滤请求参数中的潜在 XSS 攻击代码
 */
@Injectable()
export class XssFilterPipe implements PipeTransform {
    /** 危险标签正则 */
    private readonly dangerousTags = /<(script|iframe|object|embed|form|input|button|style|link|meta|base)[^>]*>/gi;

    /** 危险属性正则 */
    private readonly dangerousAttrs = /\s(on\w+|javascript:|data:text\/html)[^>]*/gi;

    /** HTML 实体编码映射 */
    private readonly htmlEntities: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#x27;",
    };

    transform(value: any, metadata: ArgumentMetadata): any {
        if (value === null || value === undefined) {
            return value;
        }

        // 处理字符串
        if (typeof value === "string") {
            return this.sanitize(value);
        }

        // 处理数组
        if (Array.isArray(value)) {
            return value.map((item) => this.transform(item, metadata));
        }

        // 处理对象
        if (typeof value === "object") {
            const sanitized: Record<string, any> = {};
            for (const key of Object.keys(value)) {
                sanitized[key] = this.transform(value[key], metadata);
            }
            return sanitized;
        }

        return value;
    }

    /**
     * 过滤危险内容
     */
    private sanitize(input: string): string {
        if (!input) return input;

        let result = input;

        // 移除危险标签
        result = result.replace(this.dangerousTags, "");

        // 移除危险属性
        result = result.replace(this.dangerousAttrs, "");

        // 编码特殊字符（可选，根据业务需求）
        // result = this.encodeHtmlEntities(result);

        return result;
    }

    /**
     * HTML 实体编码
     */
    private encodeHtmlEntities(input: string): string {
        return input.replace(/[&<>"']/g, (char) => this.htmlEntities[char] || char);
    }
}

/**
 * 输入验证装饰器
 * 用于手动标记需要严格验证的字段
 */
export function SanitizeInput(): PropertyDecorator {
    return (target: object, propertyKey: string | symbol) => {
        // 元数据标记，配合验证管道使用
        Reflect.defineMetadata("sanitize:input", true, target, propertyKey);
    };
}
