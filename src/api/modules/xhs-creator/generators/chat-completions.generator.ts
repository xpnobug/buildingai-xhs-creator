import OpenAI from "openai";
import axios from "axios";
import { BaseGenerator } from "./base.generator";

/**
 * Chat Completions API 生成器
 * 使用 /v1/chat/completions 端点生成图片
 * 适用于 Gemini, Claude 等支持图片生成的多模态模型
 */
export class ChatCompletionsGenerator extends BaseGenerator {
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
     * 从文本内容中提取图片 URL
     * 优先级：Markdown格式 > 纯URL > base64 > JSON
     */
    private extractImageUrl(content: string): string | null {
        if (!content) return null;

        // 1. 优先匹配 Markdown 格式的图片链接: ![alt](url)
        const markdownMatch = content.match(/!\[.*?\]\((https?:\/\/[^\)]+)\)/);
        if (markdownMatch && markdownMatch[1]) {
            return markdownMatch[1].trim();
        }

        // 2. 匹配纯 URL（排除常见的标点符号）
        const urlMatch = content.match(/https?:\/\/[^\s\)\]\}\"\'\,]+/);
        if (urlMatch) {
            let url = urlMatch[0];
            // 移除末尾可能存在的标点符号
            url = url.replace(/[\)\]\}\"\'\,\.\;]+$/, "");
            // 验证URL格式
            if (url.match(/^https?:\/\/.+\..+/)) {
                return url;
            }
        }

        // 3. 匹配 base64 格式
        const base64Match = content.match(/data:image\/[^;]+;base64,([^\s]+)/);
        if (base64Match) {
            return base64Match[0];
        }

        // 4. 尝试解析 JSON 格式
        try {
            const jsonData = JSON.parse(content);
            if (jsonData.imageUrl || jsonData.url || jsonData.image_url) {
                return jsonData.imageUrl || jsonData.url || jsonData.image_url;
            }
        } catch {
            // 不是JSON格式，继续
        }

        return null;
    }

    /**
     * 使用 Chat Completions API 生成图片
     * 通过多模态消息请求，模型返回图片URL或base64数据
     * 支持流式和非流式响应
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
            // 构建消息内容
            const content: any[] = [
                {
                    type: "text",
                    text: `请根据以下描述生成一张图片：${prompt}`,
                },
            ];

            // 如果有参考图片，添加到消息中
            if (options?.referenceImages && options.referenceImages.length > 0) {
                for (const imageUrl of options.referenceImages) {
                    // 清理URL，移除可能的查询参数和片段
                    const cleanUrl = imageUrl.split("?")[0].split("#")[0];
                    content.push({
                        type: "image_url",
                        image_url: {
                            url: cleanUrl,
                        },
                    });
                }
            }

            // 尝试SSE流式请求（某些API需要流式模式，返回自定义SSE格式）
            try {
                // 构建API URL，自动检测baseUrl是否已包含路径
                let apiUrl: string;
                if (this.baseUrl) {
                    const baseUrl = this.baseUrl.replace(/\/$/, "");
                    
                    // 检查baseUrl是否已经是完整的chat/completions端点
                    if (baseUrl.endsWith("/chat/completions") || baseUrl.endsWith("/v1/chat/completions")) {
                        apiUrl = baseUrl;
                    } 
                    // 检查baseUrl是否以/v1结尾
                    else if (baseUrl.endsWith("/v1")) {
                        apiUrl = `${baseUrl}/chat/completions`;
                    }
                    // 检查baseUrl是否包含/v1/（但不以/v1结尾）
                    else if (baseUrl.includes("/v1/")) {
                        // 如果已经包含/v1/，尝试直接拼接chat/completions（去掉/v1/后面的部分）
                        const v1Index = baseUrl.indexOf("/v1/");
                        apiUrl = `${baseUrl.substring(0, v1Index)}/v1/chat/completions`;
                    }
                    // 尝试不带/v1的路径（某些API可能不需要/v1前缀）
                    else {
                        // 先尝试 /chat/completions（不带/v1）
                        apiUrl = `${baseUrl}/chat/completions`;
                    }
                } else {
                    apiUrl = "https://api.openai.com/v1/chat/completions";
                }

                console.log("[ChatCompletionsGenerator] 流式请求配置:");
                console.log("  baseUrl:", this.baseUrl);
                console.log("  model:", this.model);
                console.log("  最终URL:", apiUrl);
                const response = await axios.post(
                    apiUrl,
                    {
                        model: this.model || "gpt-4-vision-preview",
                        messages: [
                            {
                                role: "user",
                                content: content,
                            },
                        ],
                        max_tokens: 1000,
                        stream: true,
                    },
                    {
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${this.apiKey}`,
                        },
                        responseType: "stream",
                        timeout: 180000, // 3分钟超时
                    },
                );

                // 处理SSE流式响应
                const imageUrl = await new Promise<string>((resolve, reject) => {
                    const stream = response.data;
                    let buffer = "";
                    let fullChunkData = "";
                    let foundImageUrl: string | null = null;

                    stream.on("data", (chunk: Buffer) => {
                        buffer += chunk.toString();
                        const lines = buffer.split("\n");
                        buffer = lines.pop() || ""; // 保留最后一个不完整的行

                        for (const line of lines) {
                            if (line.trim() === "" || line.trim() === "[DONE]") {
                                continue;
                            }

                            if (line.startsWith("data: ")) {
                                const dataStr = line.slice(6).trim();
                                if (dataStr === "[DONE]") {
                                    continue;
                                }

                                try {
                                    const data = JSON.parse(dataStr);
                                    
                                    // 处理自定义SSE格式: {"type":"chunk","data":"..."}
                                    if (data.type === "chunk" && data.data) {
                                        fullChunkData += data.data;
                                        
                                        // 尝试从增量数据中提取图片URL
                                        const extractedUrl = this.extractImageUrl(data.data);
                                        if (extractedUrl) {
                                            foundImageUrl = extractedUrl;
                                            stream.destroy();
                                            resolve(foundImageUrl!);
                                            return;
                                        }
                                    }
                                    
                                    // 处理标准OpenAI流式格式
                                    if (data.choices?.[0]?.delta?.content) {
                                        const delta = data.choices[0].delta.content;
                                        fullChunkData += delta;
                                        
                                        // 尝试从增量内容中提取图片URL
                                        const extractedUrl = this.extractImageUrl(delta);
                                        if (extractedUrl) {
                                            foundImageUrl = extractedUrl;
                                            stream.destroy();
                                            resolve(foundImageUrl!);
                                            return;
                                        }

                                        // 同时尝试从累积的完整内容中提取（处理URL被分割的情况）
                                        const urlFromFull = this.extractImageUrl(fullChunkData);
                                        if (urlFromFull) {
                                            foundImageUrl = urlFromFull;
                                            stream.destroy();
                                            resolve(foundImageUrl!);
                                            return;
                                        }
                                    }
                                } catch (parseError) {
                                    // 忽略解析错误，继续处理下一行
                                    continue;
                                }
                            }
                        }
                    });

                    stream.on("end", () => {
                        // 流结束后，从完整内容中提取图片URL
                        if (!foundImageUrl && fullChunkData) {
                            const extractedUrl = this.extractImageUrl(fullChunkData);
                            if (extractedUrl) {
                                resolve(extractedUrl);
                                return;
                            }
                        }

                        // 如果流式响应中没有找到图片URL，尝试非流式请求
                        console.log("[ChatCompletionsGenerator] 流式响应未找到图片URL");
                        console.log("完整响应内容:", fullChunkData.substring(0, 500));
                        reject(new Error("STREAM_NO_IMAGE_URL"));
                    });

                    stream.on("error", (error: Error) => {
                        console.error("[ChatCompletionsGenerator] 流式请求错误:", error.message);
                        reject(new Error(`STREAM_ERROR: ${error.message}`));
                    });
                });

                // 如果流式请求成功返回图片URL，直接返回
                if (imageUrl) {
                    return imageUrl;
                }
            } catch (streamError: any) {
                // 流式请求失败处理
                const errorMessage = streamError.message || String(streamError);
                
                // 如果是404错误，说明API路径不正确，直接抛出错误
                if (streamError.response?.status === 404) {
                    throw new Error(
                        `图片生成失败: API路径不存在 (404)。\n` +
                        `请检查配置的baseUrl是否正确。\n` +
                        `当前baseUrl: ${this.baseUrl || "未设置"}\n` +
                        `尝试的URL: ${streamError.config?.url || "未知"}\n` +
                        `提示: 某些API需要流式模式，请确保API端点支持流式响应。`
                    );
                }
                
                // 如果是其他HTTP错误，也直接抛出
                if (streamError.response?.status) {
                    throw new Error(
                        `图片生成失败: 流式请求失败 (HTTP ${streamError.response.status})。\n` +
                        `错误信息: ${streamError.response.data || errorMessage}\n` +
                        `提示: 此API可能需要流式模式，请检查API配置。`
                    );
                }
                
                // 如果是STREAM_NO_IMAGE_URL，尝试非流式请求
                if (errorMessage === "STREAM_NO_IMAGE_URL" || errorMessage.startsWith("STREAM_ERROR")) {
                    console.log("[ChatCompletionsGenerator] 流式响应未找到图片URL，尝试非流式请求");
                } else {
                    // 其他错误直接抛出，不尝试非流式
                    throw new Error(
                        `图片生成失败: 流式请求失败。\n` +
                        `错误信息: ${errorMessage}\n` +
                        `提示: 某些API必须使用流式模式，请检查API配置和网络连接。`
                    );
                }
            }

            // 非流式请求（回退方案，仅在流式响应未找到图片URL时使用）
            try {
                const response = await this.client.chat.completions.create({
                    model: this.model || "gpt-4-vision-preview",
                    messages: [
                        {
                            role: "user",
                            content: content,
                        },
                    ],
                    max_tokens: 1000,
                    stream: false,
                });

                const messageContent = response.choices[0]?.message?.content;

                if (!messageContent) {
                    throw new Error("模型未返回图片信息");
                }

                // 检查是否提示需要流式模式
                if (messageContent.includes("流式模式") || messageContent.includes("stream")) {
                    throw new Error(
                        `图片生成失败: API要求使用流式模式。\n` +
                        `响应内容: ${messageContent.substring(0, 200)}\n` +
                        `提示: 请确保流式请求配置正确，或联系管理员检查API配置。`
                    );
                }

                // 使用统一的 URL 提取方法
                const extractedUrl = this.extractImageUrl(messageContent);
                if (extractedUrl) {
                    return extractedUrl;
                }

                // 如果无法解析，抛出错误并显示详细信息
                throw new Error(
                    `无法从模型响应中提取图片URL。\n` +
                    `响应内容：${messageContent.substring(0, 300)}\n` +
                    `提示：请确保模型返回的是图片URL或Markdown格式的图片链接`
                );
            } catch (nonStreamError: any) {
                // 如果非流式请求也失败，且错误信息提示需要流式模式，抛出更明确的错误
                const errorMsg = nonStreamError.message || String(nonStreamError);
                if (errorMsg.includes("流式模式") || errorMsg.includes("stream")) {
                    throw new Error(
                        `图片生成失败: API要求使用流式模式，但流式请求失败。\n` +
                        `请检查:\n` +
                        `1. API baseUrl配置是否正确\n` +
                        `2. API是否支持流式响应\n` +
                        `3. 网络连接是否正常\n` +
                        `原始错误: ${errorMsg}`
                    );
                }
                throw nonStreamError;
            }
        } catch (error) {
            const errorMessage = error.message || String(error);

            if (errorMessage.includes("not supported") || errorMessage.includes("unsupported")) {
                throw new Error(
                    `图片生成失败: 模型 "${this.model}" 不支持图片生成。\n` +
                        `请确保使用支持多模态图片生成的模型，例如:\n` +
                        `- OpenAI: gpt-4-vision-preview, gpt-4o\n` +
                        `- Anthropic: claude-3-opus, claude-3-sonnet\n` +
                        `- Google: gemini-pro-vision\n` +
                        `当前错误: ${errorMessage}`,
                );
            }

            throw new Error(`图片生成失败: ${errorMessage}`);
        }
    }
}

