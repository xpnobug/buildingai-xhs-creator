import { Injectable, Logger, MessageEvent } from "@nestjs/common";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { Repository } from "@buildingai/db/typeorm";
import { Observable, Subject } from "rxjs";

import { XhsTask, TaskStatus } from "../../../db/entities/xhs-task.entity";
import { XhsImage, ImageStatus } from "../../../db/entities/xhs-image.entity";
import { XhsImageHistory } from "../../../db/entities/xhs-image-history.entity";
import { BaseGenerator } from "../generators";
import { XhsConfigService } from "./xhs-config.service";
import { ImageBillingService } from "./image-billing.service";
import { ImageVersionService } from "./image-version.service";
import { GeneratorResolverService } from "./generator-resolver.service";

/**
 * 图片生成服务
 * 负责批量生成图片，使用SSE流式返回进度
 */
@Injectable()
export class ImageService {
    private readonly logger = new Logger(ImageService.name);

    /**
     * 图片生成 Prompt 模板（完整版），从 prompts/image_prompt.txt 加载
     */
    private imagePromptTemplate: string;

    /**
     * 图片生成 Prompt 模板（短版），从 prompts/image_prompt_short.txt 加载
     */
    private imagePromptTemplateShort?: string;

    constructor(
        @InjectRepository(XhsTask)
        private taskRepository: Repository<XhsTask>,
        @InjectRepository(XhsImage)
        private imageRepository: Repository<XhsImage>,
        @InjectRepository(XhsImageHistory)
        private imageHistoryRepository: Repository<XhsImageHistory>,
        private readonly configService: XhsConfigService,
        private readonly billingService: ImageBillingService,
        private readonly versionService: ImageVersionService,
        private readonly generatorResolver: GeneratorResolverService,
    ) {
        const { full, short } = this.loadImagePromptTemplates();
        this.imagePromptTemplate = full;
        this.imagePromptTemplateShort = short;
    }

    /**
     * 加载图片 Prompt 模板文件
     */
    private loadImagePromptTemplates(): { full: string; short?: string } {
        const baseDir = join(__dirname, "..", "prompts");

        const fullPath = join(baseDir, "image_prompt.txt");
        const shortPath = join(baseDir, "image_prompt_short.txt");

        let full = "";
        let short: string | undefined;

        try {
            full = readFileSync(fullPath, "utf-8");
        } catch (error) {
            console.error("[ImageService] 读取 image_prompt.txt 失败:", error);
            full = "生成小红书风格图片，页面类型：{page_type}，内容：{page_content}";
        }

        if (existsSync(shortPath)) {
            try {
                short = readFileSync(shortPath, "utf-8");
            } catch (error) {
                console.error("[ImageService] 读取 image_prompt_short.txt 失败:", error);
            }
        }

        return { full, short };
    }

    /**
     * 批量生成图片（SSE流式返回）
     * @param taskId 任务ID
     * @param pages 页面列表
     * @param fullOutline 完整大纲文本
     * @param isRegenerate 是否为批量重绘（全部重绘）
     */
    generateImages(
        taskId: string,
        pages: Array<{
            index: number;
            type: "cover" | "content" | "summary";
            content: string;
        }>,
        fullOutline: string,
        isRegenerate?: boolean,
    ): Observable<any> {
        const subject = new Subject<any>();

        // 异步执行生成流程
        this.executeGeneration(taskId, pages, fullOutline, subject, isRegenerate).catch((error) => {
            subject.next({
                data: JSON.stringify({
                    type: "error",
                    message: error.message,
                }),
            } as MessageEvent);
            subject.complete();
        });

        return subject.asObservable();
    }

    /**
     * 执行图片生成流程
     */
    private async executeGeneration(
        taskId: string,
        pages: Array<{
            index: number;
            type: "cover" | "content" | "summary";
            content: string;
        }>,
        fullOutline: string,
        subject: Subject<MessageEvent>,
        isRegenerate?: boolean,
    ) {
        // 获取任务
        const task = await this.taskRepository.findOne({ where: { id: taskId } });
        if (!task) {
            throw new Error("任务不存在");
        }

        // 获取配置
        const config = await this.configService.getConfig();

        // 计算总积分需求
        const totalPowerRequired = await this.billingService.calculateTotalPower(pages);

        this.logger.debug(
            `任务 ${taskId} 总积分需求: ${totalPowerRequired}，共 ${pages.length} 张图片`,
        );

        // 验证用户余额
        const hasSufficient = await this.billingService.hasSufficientBalance(
            task.userId,
            totalPowerRequired,
        );

        if (!hasSufficient) {
            const errorMsg = `余额不足，需要 ${totalPowerRequired} 积分，请充值后重试`;
            task.status = TaskStatus.FAILED;
            task.errorMessage = errorMsg;
            await this.taskRepository.save(task);

            subject.next({
                data: JSON.stringify({
                    type: "error",
                    message: errorMsg,
                }),
            } as MessageEvent);
            subject.complete();

            this.logger.warn(`任务 ${taskId} 余额不足: ${errorMsg}`);
            return;
        }

        // 更新任务状态
        task.status = TaskStatus.GENERATING_IMAGES;
        task.totalPages = pages.length;
        await this.taskRepository.save(task);

        // 获取图片生成服务商
        const generator: BaseGenerator = await this.generatorResolver.resolve();

        // 创建或更新图片记录
        for (const page of pages) {
            let imageRecord = await this.imageRepository.findOne({
                where: { taskId, pageIndex: page.index },
            });

            if (isRegenerate && imageRecord) {
                // 批量重绘：重置状态，保留版本号
                imageRecord.status = ImageStatus.PENDING;
                imageRecord.errorMessage = null as any;  // nullable column
                await this.imageRepository.save(imageRecord);
            } else if (!imageRecord) {
                // 首次生成：创建新记录
                imageRecord = this.imageRepository.create({
                    taskId,
                    pageIndex: page.index,
                    pageType: page.type,
                    prompt: this.extractImagePrompt(page.content),
                    status: ImageStatus.PENDING,
                });
                await this.imageRepository.save(imageRecord);
            }
        }

        // 第一阶段：生成封面
        const coverPage = pages.find((p) => p.type === "cover");
        let coverImageUrl: string | null = null;

        if (coverPage) {
            subject.next({
                data: JSON.stringify({
                    type: "progress",
                    stage: "cover",
                    current: 0,
                    total: pages.length,
                    message: "正在生成封面...",
                }),
            } as MessageEvent);

            try {
                coverImageUrl = await this.generateSingleImage(
                    task,
                    coverPage,
                    generator,
                    task.userImages,
                    task.outline,
                    undefined,
                    isRegenerate,
                );

                // 保存封面URL到任务
                task.coverImageUrl = coverImageUrl;
                task.generatedPages = 1;
                await this.taskRepository.save(task);

                subject.next({
                    data: JSON.stringify({
                        type: "complete",
                        pageIndex: coverPage.index,
                        imageUrl: coverImageUrl,
                    }),
                } as MessageEvent);
            } catch (error) {
                subject.next({
                    data: JSON.stringify({
                        type: "error",
                        pageIndex: coverPage.index,
                        message: error.message,
                    }),
                } as MessageEvent);
            }
        }

        // 第二阶段：生成内容页
        const contentPages = pages.filter((p) => p.type !== "cover");
        const referenceImages = coverImageUrl ? [coverImageUrl] : task.userImages;

        // 读取配置，决定是否启用高并发模式（参照 RedInk）
        const highConcurrency = !!config.highConcurrency;

        if (highConcurrency) {
            // 高并发模式：并行生成所有内容页
            await this.executeHighConcurrencyGeneration(
                taskId,
                contentPages,
                generator,
                referenceImages,
                fullOutline,
                task,
                subject,
                isRegenerate,
            );
        } else {
            // 顺序模式：逐页生成（当前默认行为）
            await this.executeSequentialGeneration(
                taskId,
                contentPages,
                generator,
                referenceImages,
                fullOutline,
                task,
                subject,
                isRegenerate,
            );
        }

        // 完成
        task.status = TaskStatus.COMPLETED;
        await this.taskRepository.save(task);

        subject.next({
            data: JSON.stringify({
                type: "finish",
                message: "所有图片生成完成",
            }),
        } as MessageEvent);

        subject.complete();
    }

    /**
     * 高并发模式生成内容页
     */
    private async executeHighConcurrencyGeneration(
        taskId: string,
        contentPages: Array<{ index: number; type: "cover" | "content" | "summary"; content: string }>,
        generator: BaseGenerator,
        referenceImages: string[],
        fullOutline: string,
        task: XhsTask,
        subject: Subject<MessageEvent>,
        isRegenerate?: boolean,
    ): Promise<void> {
        console.log(`[XHS Creator] 启用高并发模式，并行生成 ${contentPages.length} 页内容`);

        subject.next({
            data: JSON.stringify({
                type: "progress",
                stage: "content",
                current: 0,
                total: contentPages.length,
                message: `开始并发生成 ${contentPages.length} 页内容...`,
            }),
        } as MessageEvent);

        let completedCount = 0;

        const results = await Promise.allSettled(
            contentPages.map((page, idx) =>
                this.generateSingleImage(
                    task,
                    page,
                    generator,
                    referenceImages,
                    fullOutline,
                    undefined,
                    isRegenerate,
                )
                    .then((imageUrl) => {
                        completedCount++;
                        console.log(`[XHS Creator] 第${idx + 1}页生成成功: ${imageUrl}`);

                        // 实时发送进度
                        subject.next({
                            data: JSON.stringify({
                                type: "progress",
                                stage: "content",
                                current: completedCount,
                                total: contentPages.length,
                                message: `正在生成第${idx + 1}页...`,
                            }),
                        } as MessageEvent);

                        return { page, imageUrl };
                    })
                    .catch((error) => {
                        completedCount++;
                        console.error(`[XHS Creator] 第${idx + 1}页生成失败:`, error);

                        subject.next({
                            data: JSON.stringify({
                                type: "progress",
                                stage: "content",
                                current: completedCount,
                                total: contentPages.length,
                                message: `第${idx + 1}页生成失败`,
                            }),
                        } as MessageEvent);

                        // 包装错误，携带 page 信息
                        throw { page, error };
                    }),
            ),
        );

        console.log(`[XHS Creator] 高并发生成完成，处理结果...`);

        // 批量更新任务的生成页数
        let successCount = 0;
        for (const result of results) {
            if (result.status === "fulfilled") {
                successCount++;
                const { page, imageUrl } = result.value;

                subject.next({
                    data: JSON.stringify({
                        type: "complete",
                        pageIndex: page.index,
                        imageUrl,
                    }),
                } as MessageEvent);
            } else {
                const reasonObj = result.reason as { page?: { index: number }; error?: Error };
                const pageIndex = reasonObj?.page?.index ?? -1;
                const errorMessage = reasonObj?.error?.message || String(result.reason);

                console.error(`[XHS Creator] 页面 ${pageIndex} 生成失败，原因:`, errorMessage);
                subject.next({
                    data: JSON.stringify({
                        type: "error",
                        pageIndex,
                        message: errorMessage,
                    }),
                } as MessageEvent);
            }
        }

        // 批量更新任务生成页数（优化：减少数据库交互）
        task.generatedPages += successCount;
        await this.taskRepository.save(task);
    }

    /**
     * 顺序模式生成内容页
     */
    private async executeSequentialGeneration(
        taskId: string,
        contentPages: Array<{ index: number; type: "cover" | "content" | "summary"; content: string }>,
        generator: BaseGenerator,
        referenceImages: string[],
        fullOutline: string,
        task: XhsTask,
        subject: Subject<MessageEvent>,
        isRegenerate?: boolean,
    ): Promise<void> {
        for (let i = 0; i < contentPages.length; i++) {
            const page = contentPages[i];

            subject.next({
                data: JSON.stringify({
                    type: "progress",
                    stage: "content",
                    current: i + 1,
                    total: contentPages.length,
                    message: `正在生成第${i + 1}页...`,
                }),
            } as MessageEvent);

            try {
                const imageUrl = await this.generateSingleImage(
                    task,
                    page,
                    generator,
                    referenceImages,
                    fullOutline,
                    undefined,
                    isRegenerate,
                );

                task.generatedPages++;
                await this.taskRepository.save(task);

                subject.next({
                    data: JSON.stringify({
                        type: "complete",
                        pageIndex: page.index,
                        imageUrl,
                    }),
                } as MessageEvent);
            } catch (error) {
                subject.next({
                    data: JSON.stringify({
                        type: "error",
                        pageIndex: page.index,
                        message: error.message,
                    }),
                } as MessageEvent);
            }
        }
    }

    /**
     * 生成单张图片（使用积分计费服务）
     * @param task 任务对象（直接传入避免重复查询）
     * @param isRegenerate 是否为批量重绘
     */
    private async generateSingleImage(
        task: XhsTask,
        page: {
            index: number;
            type: string;
            content: string;
        },
        generator: BaseGenerator,
        referenceImages?: string[],
        fullOutline?: string,
        userTopic?: string,
        isRegenerate?: boolean,
    ): Promise<string> {
        const imageRecord = await this.imageRepository.findOne({
            where: { taskId: task.id, pageIndex: page.index },
        });

        if (!imageRecord) {
            throw new Error(`图片记录不存在: ${page.index}`);
        }

        // 使用计费服务执行带积分扣减的操作
        const pageType = page.type as "cover" | "content" | "summary";
        
        // 预先计算 prompt，避免重复调用
        const prompt = this.buildImagePrompt(page.content, page.type, fullOutline, userTopic);
        
        // 版本号逻辑：
        // - 如果是重绘(isRegenerate=true)，在当前版本基础上 +1
        // - 如果是首次生成且 currentVersion 为 0 或 1，使用版本 1
        // - 如果是首次生成但已有版本(currentVersion > 1)，也需要递增
        const currentVer = imageRecord.currentVersion || 0;
        const nextVersion = isRegenerate || currentVer > 1 ? currentVer + 1 : 1;
        const generatedBy = isRegenerate ? "batch-regenerate" : "initial";
        
        const { result: imageUrl, powerAmount } = await this.billingService.executeWithBilling(
            {
                userId: task.userId,
                imageId: imageRecord.id,
                pageType,
            },
            async () => {
                const url = await generator.generateImage(prompt, {
                    referenceImages,
                    size: "1024x1024",
                    quality: "standard",
                });

                // 生成成功：更新记录
                imageRecord.imageUrl = url;
                imageRecord.status = ImageStatus.COMPLETED;
                imageRecord.currentVersion = nextVersion;
                if (isRegenerate) {
                    imageRecord.retryCount++;
                }
                await this.imageRepository.save(imageRecord);

                return url;
            },
        );

        // 保存版本记录
        await this.versionService.saveVersion({
            imageRecord,
            taskId: task.id,
            imageUrl,
            prompt,
            generatedBy,
            powerAmount,
        });

        this.logger.debug(`图片 ${imageRecord.id} 生成成功，版本: v${nextVersion}，模式: ${generatedBy}`);

        return imageUrl;
    }

    /**
     * 构建图片生成的完整提示词
     */
    private buildImagePrompt(
        pageContent: string,
        pageType: string,
        fullOutline?: string,
        userTopic?: string,
    ): string {
        const typeLabel =
            pageType === "cover" ? "封面" : pageType === "summary" ? "总结" : "内容";

        const safeOutline = (fullOutline || "").slice(0, 1500);
        const safeTopic = userTopic || "未提供";

        const template = this.imagePromptTemplate || "生成小红书风格图片：{page_type} - {page_content}";

        return template
            .replace("{page_content}", pageContent)
            .replace("{page_type}", typeLabel)
            .replace("{full_outline}", safeOutline)
            .replace("{user_topic}", safeTopic);
    }

    /**
     * 从页面内容中提取简短图片提示词（仅用于保存到数据库的 prompt 字段）
     */
    private extractImagePrompt(content: string): string {
        const match = content.match(/图片描述[：:]\s*(.+?)(?:\n|$)/);
        return match ? match[1].trim() : content;
    }

    /**
     * 重新生成单张图片
     */
    async regenerateImage(
        taskId: string,
        pageIndex: number,
        prompt: string,
    ): Promise<string> {
        const task = await this.taskRepository.findOne({ where: { id: taskId } });
        if (!task) {
            throw new Error("任务不存在");
        }

        const generator: BaseGenerator = await this.generatorResolver.resolve();
        const referenceImages = task.coverImageUrl ? [task.coverImageUrl] : task.userImages;

        const imageRecord = await this.imageRepository.findOne({
            where: { taskId, pageIndex },
        });

        if (!imageRecord) {
            throw new Error("图片记录不存在");
        }

        const pageType = imageRecord.pageType;

        // 使用计费服务执行带积分扣减的操作
        const { result: imageUrl, powerAmount } = await this.billingService.executeWithBilling(
            {
                userId: task.userId,
                imageId: imageRecord.id,
                pageType,
                remark: `小红书图片重新生成 - ${pageType === "cover" ? "封面" : "内容"}页`,
            },
            async () => {
                const url = await generator.generateImage(prompt, {
                    referenceImages,
                    size: "1024x1024",
                    quality: "standard",
                });

                // 生成成功，更新记录并递增版本号
                const nextVersion = imageRecord.currentVersion + 1;
                imageRecord.imageUrl = url;
                imageRecord.status = ImageStatus.COMPLETED;
                imageRecord.retryCount++;
                imageRecord.currentVersion = nextVersion;
                await this.imageRepository.save(imageRecord);

                return url;
            },
        );

        // 保存版本记录
        await this.versionService.saveVersion({
            imageRecord,
            taskId,
            imageUrl,
            prompt,
            generatedBy: "single-regenerate",
            powerAmount,
        });

        this.logger.debug(
            `图片 ${imageRecord.id} 重新生成成功，积分消费确认，版本: v${imageRecord.currentVersion}`,
        );

        return imageUrl;
    }

    /**
     * 重新生成单张图片（流式SSE）
     */
    regenerateImageStream(
        taskId: string,
        pageIndex: number,
        prompt: string,
    ): Observable<MessageEvent> {
        return new Observable<MessageEvent>((subscriber) => {
            (async () => {
                try {
                    // 推送开始事件
                    subscriber.next({
                        data: JSON.stringify({
                            type: "start",
                            pageIndex,
                            message: "开始重新生成图片",
                        }),
                    } as MessageEvent);

                    // 执行生成
                    const imageUrl = await this.regenerateImage(taskId, pageIndex, prompt);

                    // 推送完成事件
                    subscriber.next({
                        data: JSON.stringify({
                            type: "complete",
                            pageIndex,
                            imageUrl,
                            message: "图片重新生成成功",
                        }),
                    } as MessageEvent);

                    // 推送结束事件
                    subscriber.next({
                        data: JSON.stringify({
                            type: "finish",
                            message: "重新生成完成",
                        }),
                    } as MessageEvent);

                    subscriber.complete();
                } catch (error) {
                    this.logger.error(`重新生成图片失败: ${error.message}`);

                    // 推送错误事件
                    subscriber.next({
                        data: JSON.stringify({
                            type: "error",
                            pageIndex,
                            message: error.message || "重新生成失败",
                        }),
                    } as MessageEvent);

                    subscriber.complete();
                }
            })();
        });
    }

    /**
     * 获取图片的所有历史版本
     * 委托给版本服务
     */
    async getImageVersions(taskId: string, pageIndex: number): Promise<XhsImageHistory[]> {
        return this.versionService.getVersions(taskId, pageIndex);
    }

    /**
     * 获取特定版本的图片
     * 委托给版本服务
     */
    async getImageVersion(
        taskId: string,
        pageIndex: number,
        version: number,
    ): Promise<XhsImageHistory | null> {
        return this.versionService.getVersion(taskId, pageIndex, version);
    }

    /**
     * 恢复到指定版本
     * 委托给版本服务
     */
    async restoreImageVersion(
        taskId: string,
        pageIndex: number,
        version: number,
    ): Promise<string> {
        return this.versionService.restoreVersion(taskId, pageIndex, version);
    }
}
