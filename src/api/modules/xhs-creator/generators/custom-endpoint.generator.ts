import { BaseGenerator } from "./base.generator";

/**
 * 自定义端点生成器
 * 适用于其他非标准 API
 */
export class CustomEndpointGenerator extends BaseGenerator {
    private endpointUrl: string;

    constructor(config: {
        apiKey: string;
        baseUrl?: string;
        model?: string;
        endpointUrl: string;
        config?: Record<string, any>;
    }) {
        super(config);
        if (!config.endpointUrl) {
            throw new Error("自定义端点URL不能为空");
        }
        this.endpointUrl = config.endpointUrl;
    }

    /**
     * 使用自定义端点生成文本
     */
    async generateText(prompt: string, options?: any): Promise<string> {
        try {
            const response = await fetch(this.endpointUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    prompt,
                    model: this.model,
                    ...options,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data.text || data.content || data.response || JSON.stringify(data);
        } catch (error) {
            throw new Error(`自定义端点文本生成失败: ${error.message || String(error)}`);
        }
    }

    /**
     * 使用自定义端点生成图片
     */
    async generateImage(
        prompt: string,
        options?: {
            referenceImages?: string[];
            size?: string;
            quality?: string;
        },
    ): Promise<string> {
        try {
            const requestBody: any = {
                prompt,
                model: this.model,
            };

            if (options?.size) {
                requestBody.size = options.size;
            }

            if (options?.quality) {
                requestBody.quality = options.quality;
            }

            if (options?.referenceImages && options.referenceImages.length > 0) {
                requestBody.reference_images = options.referenceImages;
            }

            // 合并自定义配置
            if (this.config) {
                Object.assign(requestBody, this.config);
            }

            const response = await fetch(this.endpointUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
            }

            const data = await response.json();

            // 尝试从响应中提取图片URL
            // 支持多种常见的响应格式
            if (data.imageUrl) return data.imageUrl;
            if (data.url) return data.url;
            if (data.image_url) return data.image_url;
            if (data.data?.[0]?.url) return data.data[0].url;
            if (data.images?.[0]) return data.images[0];
            if (data.result?.imageUrl) return data.result.imageUrl;
            if (data.result?.url) return data.result.url;

            // 如果是base64格式
            if (data.imageBase64) {
                return `data:image/png;base64,${data.imageBase64}`;
            }
            if (data.data?.[0]?.b64_json) {
                return `data:image/png;base64,${data.data[0].b64_json}`;
            }

            throw new Error(
                `无法从自定义端点响应中提取图片URL。响应格式：${JSON.stringify(data).substring(0, 200)}`,
            );
        } catch (error) {
            throw new Error(
                `自定义端点图片生成失败: ${error.message || String(error)}\n端点URL: ${this.endpointUrl}`,
            );
        }
    }
}

