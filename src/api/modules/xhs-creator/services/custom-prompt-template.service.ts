import { Injectable, Logger } from "@nestjs/common";
import { Repository } from "@buildingai/db/typeorm";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import * as fs from "fs";
import * as path from "path";

import { XhsConfig } from "../../../db/entities/xhs-config.entity";

/**
 * Prompt 模板变量
 */
export interface PromptVariables {
    topic?: string;
    pageType?: "cover" | "content" | "summary";
    pageContent?: string;
    pageIndex?: number;
    totalPages?: number;
    style?: string;
    imageSize?: string;
    customInstructions?: string;
}

/**
 * 预设模板类型
 */
export enum TemplateType {
    OUTLINE = "outline",
    IMAGE_COVER = "image_cover",
    IMAGE_CONTENT = "image_content",
    IMAGE_SUMMARY = "image_summary",
}

/**
 * 用户自定义模板
 */
export interface CustomTemplate {
    id: string;
    userId: string;
    name: string;
    type: TemplateType;
    content: string;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * 自定义 Prompt 模板服务
 * 
 * 支持：
 * - 系统预设模板
 * - 用户自定义模板
 * - 模板变量替换
 * - 模板继承和扩展
 */
@Injectable()
export class CustomPromptTemplateService {
    private readonly logger = new Logger(CustomPromptTemplateService.name);
    private readonly systemTemplates = new Map<TemplateType, string>();
    private readonly userTemplates = new Map<string, CustomTemplate[]>();

    constructor() {
        this.loadSystemTemplates();
    }

    /**
     * 加载系统预设模板
     */
    private loadSystemTemplates(): void {
        const templatesDir = path.join(__dirname, "../prompts");

        const templateFiles: Record<TemplateType, string> = {
            [TemplateType.OUTLINE]: "outline_prompt.txt",
            [TemplateType.IMAGE_COVER]: "image_prompt.txt",
            [TemplateType.IMAGE_CONTENT]: "image_prompt.txt",
            [TemplateType.IMAGE_SUMMARY]: "image_prompt.txt",
        };

        for (const [type, filename] of Object.entries(templateFiles)) {
            try {
                const filePath = path.join(templatesDir, filename);
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, "utf-8");
                    this.systemTemplates.set(type as TemplateType, content);
                    this.logger.debug(`已加载系统模板: ${type}`);
                }
            } catch (error) {
                this.logger.warn(`加载系统模板失败: ${type}`, error);
            }
        }
    }

    /**
     * 获取模板（优先用户自定义，否则系统预设）
     */
    getTemplate(userId: string, type: TemplateType): string {
        // 查找用户默认模板
        const userTemplateList = this.userTemplates.get(userId) || [];
        const defaultTemplate = userTemplateList.find(
            (t) => t.type === type && t.isDefault,
        );

        if (defaultTemplate) {
            return defaultTemplate.content;
        }

        // 返回系统模板
        return this.systemTemplates.get(type) || "";
    }

    /**
     * 构建 Prompt（变量替换）
     */
    buildPrompt(template: string, variables: PromptVariables): string {
        let result = template;

        // 替换变量
        const replacements: Record<string, string> = {
            "{{topic}}": variables.topic || "",
            "{{pageType}}": variables.pageType || "",
            "{{pageContent}}": variables.pageContent || "",
            "{{pageIndex}}": String(variables.pageIndex || 0),
            "{{totalPages}}": String(variables.totalPages || 0),
            "{{style}}": variables.style || "现代简约",
            "{{imageSize}}": variables.imageSize || "1:1",
            "{{customInstructions}}": variables.customInstructions || "",
        };

        for (const [placeholder, value] of Object.entries(replacements)) {
            result = result.replace(new RegExp(placeholder, "g"), value);
        }

        return result;
    }

    /**
     * 保存用户自定义模板
     */
    saveUserTemplate(
        userId: string,
        name: string,
        type: TemplateType,
        content: string,
        isDefault: boolean = false,
    ): CustomTemplate {
        const template: CustomTemplate = {
            id: `template_${Date.now()}`,
            userId,
            name,
            type,
            content,
            isDefault,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        // 如果设为默认，取消其他同类型模板的默认状态
        if (isDefault) {
            const userList = this.userTemplates.get(userId) || [];
            for (const t of userList) {
                if (t.type === type) {
                    t.isDefault = false;
                }
            }
        }

        // 保存到内存（实际应持久化到数据库）
        const userList = this.userTemplates.get(userId) || [];
        userList.push(template);
        this.userTemplates.set(userId, userList);

        this.logger.log(`用户 ${userId} 保存自定义模板: ${name}`);
        return template;
    }

    /**
     * 获取用户所有模板
     */
    getUserTemplates(userId: string, type?: TemplateType): CustomTemplate[] {
        const userList = this.userTemplates.get(userId) || [];
        if (type) {
            return userList.filter((t) => t.type === type);
        }
        return userList;
    }

    /**
     * 删除用户模板
     */
    deleteUserTemplate(userId: string, templateId: string): boolean {
        const userList = this.userTemplates.get(userId) || [];
        const index = userList.findIndex((t) => t.id === templateId);
        
        if (index !== -1) {
            userList.splice(index, 1);
            this.userTemplates.set(userId, userList);
            this.logger.log(`用户 ${userId} 删除模板: ${templateId}`);
            return true;
        }
        return false;
    }

    /**
     * 获取预设提示词增强
     */
    getStyleEnhancement(style: string): string {
        const styleEnhancements: Record<string, string> = {
            "现代简约": "使用简洁的线条和留白，色彩以黑白灰为主，配以点缀色",
            "日系小清新": "柔和的色调，大量留白，细腻的手绘元素",
            "国潮风": "融入中国传统元素，使用红色金色为主色调",
            "ins风": "高对比度，明亮的色彩，时尚的构图",
            "复古怀旧": "暖黄色调，颗粒感，老照片效果",
            "科技未来": "深色背景，霓虹蓝紫色，几何图形",
        };

        return styleEnhancements[style] || "";
    }
}
