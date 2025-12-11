import { Injectable, Logger } from "@nestjs/common";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { XhsConfigService } from "./xhs-config.service";

/**
 * 图片提示词服务
 * 负责 Prompt 模板的加载、缓存与构建
 */
@Injectable()
export class ImagePromptService {
    private readonly logger = new Logger(ImagePromptService.name);

    /**
     * 图片生成 Prompt 模板（完整版），从 prompts/image_prompt.txt 加载
     */
    private imagePromptTemplate: string;

    /**
     * 图片生成 Prompt 模板（短版），从 prompts/image_prompt_short.txt 加载
     */
    private imagePromptTemplateShort?: string;

    /**
     * 模板是否已加载（用于缓存优化）
     */
    private templatesLoaded = false;

    constructor(private readonly configService: XhsConfigService) {
        // 延迟加载模板，避免启动时阻塞
        this.loadTemplatesIfNeeded();
    }

    /**
     * 按需加载模板（带缓存）
     */
    private loadTemplatesIfNeeded(): void {
        if (this.templatesLoaded) {
            return;
        }

        const baseDir = join(__dirname, "..", "prompts");
        const fullPath = join(baseDir, "image_prompt.txt");
        const shortPath = join(baseDir, "image_prompt_short.txt");

        try {
            this.imagePromptTemplate = readFileSync(fullPath, "utf-8");
            this.logger.debug("已加载 image_prompt.txt 模板");
        } catch (error) {
            this.logger.error("读取 image_prompt.txt 失败:", error);
            this.imagePromptTemplate = "生成小红书风格图片，页面类型：{page_type}，内容：{page_content}";
        }

        if (existsSync(shortPath)) {
            try {
                this.imagePromptTemplateShort = readFileSync(shortPath, "utf-8");
                this.logger.debug("已加载 image_prompt_short.txt 模板");
            } catch (error) {
                this.logger.error("读取 image_prompt_short.txt 失败:", error);
            }
        }

        this.templatesLoaded = true;
    }

    /**
     * 获取完整版 Prompt 模板
     */
    getFullTemplate(): string {
        this.loadTemplatesIfNeeded();
        return this.imagePromptTemplate;
    }

    /**
     * 获取短版 Prompt 模板
     */
    getShortTemplate(): string | undefined {
        this.loadTemplatesIfNeeded();
        return this.imagePromptTemplateShort;
    }

    /**
     * 构建图片生成的完整提示词
     * @param pageContent 页面内容
     * @param pageType 页面类型
     * @param fullOutline 完整大纲（可选）
     * @param userTopic 用户主题（可选）
     * @param customTemplate 自定义模板（可选，优先使用）
     */
    buildImagePrompt(
        pageContent: string,
        pageType: string,
        fullOutline?: string,
        userTopic?: string,
        customTemplate?: string | null,
    ): string {
        const typeLabel =
            pageType === "cover" ? "封面" : pageType === "summary" ? "总结" : "内容";

        const safeOutline = (fullOutline || "").slice(0, 1500);
        const safeTopic = userTopic || "未提供";

        // 优先使用自定义模板，否则使用文件模板
        const template = customTemplate || this.getFullTemplate();

        return template
            .replace("{page_content}", pageContent)
            .replace("{page_type}", typeLabel)
            .replace("{full_outline}", safeOutline)
            .replace("{user_topic}", safeTopic);
    }

    /**
     * 从页面内容中提取简短图片提示词（仅用于保存到数据库的 prompt 字段）
     */
    extractImagePrompt(content: string): string {
        const match = content.match(/图片描述[：:]\s*(.+?)(?:\n|$)/);
        return match ? match[1].trim() : content;
    }

    /**
     * 重新加载模板（用于热更新场景）
     */
    reloadTemplates(): void {
        this.templatesLoaded = false;
        this.loadTemplatesIfNeeded();
        this.logger.log("Prompt 模板已重新加载");
    }
}
