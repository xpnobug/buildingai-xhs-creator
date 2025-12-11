import { Injectable } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PublicAiModelService } from "@buildingai/extension-sdk";
import { getProvider, textGenerator } from "@buildingai/ai-sdk";
import { getProviderSecret } from "@buildingai/utils";
import { XhsConfigService } from "./xhs-config.service";

/**
 * 小红书大纲生成服务
 * 负责根据主题生成小红书图文大纲
 */
@Injectable()
export class OutlineService {
    constructor(
        private readonly configService: XhsConfigService,
        private readonly aiModelService: PublicAiModelService,
    ) {
        this.outlinePromptTemplate = this.loadOutlinePromptTemplate();
    }

    /**
     * 大纲 Prompt 模板（与 RedInk backend/prompts/outline_prompt.txt 保持一致）
     * 使用 {topic} 占位符，在运行时替换为用户主题
     */
    private outlinePromptTemplate: string;

    /**
     * 从 prompts/outline_prompt.txt 读取模板
     */
    private loadOutlinePromptTemplate(): string {
        try {
            const promptPath = join(
                __dirname,
                "..",
                "prompts",
                "outline_prompt.txt",
            );
            return readFileSync(promptPath, "utf-8");
        } catch (error) {
            // 严格模式：必须存在外部提示词文件
            console.error("[OutlineService] 读取 outline_prompt.txt 失败:", error);
            throw new Error(
                "[XHS Creator] 无法读取 outline_prompt.txt，请检查路径 src/api/modules/xhs-creator/prompts/outline_prompt.txt 是否存在且可读。",
            );
        }
    }

    /**
     * 生成大纲
     * @param topic 用户输入的主题
     * @param userImages 用户上传的参考图片URL（可选）
     */
    async generateOutline(
        topic: string,
        userImages?: string[],
    ): Promise<{
        outline: string;
        pages: Array<{
            index: number;
            type: "cover" | "content" | "summary";
            content: string;
        }>;
    }> {
        // 构建提示词（与 RedInk 逻辑一致）
        const prompt = await this.buildOutlinePrompt(topic, userImages);

        // 调用系统统一 AI 模型生成大纲（与主页对话相同调用链）
        const outlineText = await this.generateOutlineWithSystemModel(prompt);

        // 解析大纲为页面结构
        const pages = this.parseOutline(outlineText);

        return {
            outline: outlineText,
            pages,
        };
    }

    /**
     * 使用系统 AI 模型服务生成大纲
     * 调用链与主系统对话完全一致，避免密钥处理差异
     */
    private async generateOutlineWithSystemModel(prompt: string): Promise<string> {
        const config = await this.configService.getConfig();
        if (!config.textModelId) {
            throw new Error("尚未选择文本生成模型，请先在后台配置模型");
        }

        // 获取模型与供应商密钥配置（与主系统一致）
        const [model, providerSecret] = await Promise.all([
            this.aiModelService.getModelInfo(config.textModelId),
            this.aiModelService.getProviderConfig(config.textModelId),
        ]);

        const apiKey = getProviderSecret("apiKey", providerSecret);
        const baseURL = getProviderSecret("baseUrl", providerSecret);

        // 打印使用的文本模型信息
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("📝 [XHS Creator] 大纲生成 - 使用的文本模型信息:");
        console.log(`   供应商: ${model.provider.provider}`);
        console.log(`   模型名称: ${model.model || config.textModel || "gpt-4o-mini"}`);
        console.log(`   Base URL: ${baseURL || "默认"}`);
        console.log(`   模型ID: ${config.textModelId}`);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

        const adapter = getProvider(model.provider.provider, {
            apiKey,
            baseURL,
        });
        const generator = textGenerator(adapter);

        const completion = await generator.chat.create({
            model: model.model || config.textModel || "gpt-4o-mini",
            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
        });

        return completion.choices?.[0]?.message?.content || "";
    }

    /**
     * 构建大纲生成的提示词
     * 优先使用后台配置的自定义提示词，为空则使用默认模板文件
     */
    private async buildOutlinePrompt(topic: string, userImages?: string[]): Promise<string> {
        // 优先从配置读取自定义提示词
        const config = await this.configService.getConfig();
        const template = config.outlinePrompt || this.outlinePromptTemplate;
        
        let prompt = template.replace("{topic}", topic);

        if (userImages && userImages.length > 0) {
            prompt += `\n\n注意：用户提供了 ${userImages.length} 张参考图片，请在生成大纲时考虑这些图片的内容和风格。这些图片可能是产品图、个人照片或场景图，请根据图片内容来优化大纲，使生成的内容与图片相关联。`;
        }

        return prompt;
    }

    /**
     * 解析大纲文本为页面结构
     */
    private parseOutline(outlineText: string): Array<{
        index: number;
        type: "cover" | "content" | "summary";
        content: string;
    }> {
        const pages: Array<{
            index: number;
            type: "cover" | "content" | "summary";
            content: string;
        }> = [];

        const text = outlineText || "";

        // 1. 优先使用 RedInk 的 <page> 分隔逻辑
        let rawPages: string[] = [];
        if (text.includes("<page>")) {
            rawPages = text.split(/<page>/i);
        } else if (text.includes("---")) {
            // 2. 兼容旧版使用 --- 分隔的情况
            rawPages = text.split("---");
        } else {
            // 3. 兼容旧版【第X页 - 类型】格式
            const legacyPattern = /【第(\d+)页\s*-\s*(封面|内容|总结)】\s*([\s\S]*?)(?=【第\d+页|$)/g;
            let match: RegExpExecArray | null;

            while ((match = legacyPattern.exec(text)) !== null) {
            const pageNum = parseInt(match[1], 10);
            const pageTypeText = match[2];
            const content = match[3].trim();

            let type: "cover" | "content" | "summary" = "content";
            if (pageTypeText === "封面") type = "cover";
            else if (pageTypeText === "总结") type = "summary";

            pages.push({
                    index: pageNum - 1,
                type,
                content,
            });
        }

            return pages.sort((a, b) => a.index - b.index);
        }

        const typeMapping: Record<string, "cover" | "content" | "summary"> = {
            封面: "cover",
            内容: "content",
            总结: "summary",
        };

        rawPages.forEach((block, index) => {
            const trimmed = block.trim();
            if (!trimmed) return;

            // 查找第一行的 [类型] 标记
            const typeMatch = trimmed.match(/^\[(\S+)\]/m);
            let type: "cover" | "content" | "summary" = "content";
            if (typeMatch) {
                const cn = typeMatch[1];
                type = typeMapping[cn] || "content";
            }

            pages.push({
                index,
                type,
                content: trimmed,
            });
        });

        return pages.sort((a, b) => a.index - b.index);
    }

}
