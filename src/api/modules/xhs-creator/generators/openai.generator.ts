import OpenAI from "openai";
import { BaseGenerator } from "./base.generator";

/**
 * OpenAI生成器
 * 支持GPT-4文本生成和DALL-E图片生成
 */
export class OpenAIGenerator extends BaseGenerator {
    private client: OpenAI;

    constructor(config: {
        apiKey: string;
        baseUrl?: string;
        model?: string;
        config?: Record<string, any>;
    }) {
        super(config);
        this.client = new OpenAI({
            apiKey: this.apiKey,
            baseURL: this.baseUrl,
        });
    }

    /**
     * 使用GPT模型生成文本
     */
    async generateText(prompt: string, options?: any): Promise<string> {
        const response = await this.client.chat.completions.create({
            model: this.model || "gpt-4",
            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
            temperature: options?.temperature || 0.7,
            max_tokens: options?.maxTokens || 4000,
        });

        return response.choices[0]?.message?.content || "";
    }

    /**
     * 使用DALL-E生成图片
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
            const response = await this.client.images.generate({
                model: this.model || "dall-e-3",
                prompt: prompt,
                size: (options?.size as any) || "1024x1024",
                quality: (options?.quality as any) || "standard",
                n: 1,
            });

            return response.data?.[0]?.url || "";
        } catch (error) {
            // 增强错误信息，提示用户可能选择了不支持的模型
            const errorMessage = error.message || String(error);
            
            if (errorMessage.includes("not supported") || errorMessage.includes("unsupported")) {
                throw new Error(
                    `图片生成失败: 模型 "${this.model}" 不支持图片生成。\n` +
                    `请在后台配置中选择支持图片生成的模型，例如:\n` +
                    `- OpenAI: dall-e-2, dall-e-3\n` +
                    `- Stability AI: stable-diffusion-xl-1024-v1-0\n` +
                    `当前错误: ${errorMessage}`
                );
            }
            
            throw new Error(`图片生成失败: ${errorMessage}`);
        }
    }
}
