/**
 * AI生成器基类
 * 定义文本和图片生成的统一接口
 */
export abstract class BaseGenerator {
    protected apiKey: string;
    protected baseUrl?: string;
    protected model?: string;
    protected config?: Record<string, any>;

    constructor(config: {
        apiKey: string;
        baseUrl?: string;
        model?: string;
        config?: Record<string, any>;
    }) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl;
        this.model = config.model;
        this.config = config.config;
    }

    /**
     * 生成文本内容
     * @param prompt 提示词
     * @param options 额外选项
     */
    abstract generateText(prompt: string, options?: any): Promise<string>;

    /**
     * 生成图片
     * @param prompt 提示词
     * @param options 额外选项（如参考图片、尺寸等）
     */
    abstract generateImage(
        prompt: string,
        options?: {
            referenceImages?: string[];
            size?: string;
            quality?: string;
        },
    ): Promise<string>;
}
