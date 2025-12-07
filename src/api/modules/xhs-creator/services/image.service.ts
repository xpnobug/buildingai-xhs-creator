import { Injectable, Logger, MessageEvent } from "@nestjs/common";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { Repository } from "@buildingai/db/typeorm";
import { Observable, Subject } from "rxjs";

import { XhsTask, TaskStatus } from "../../../db/entities/xhs-task.entity";
import { XhsImage, ImageStatus } from "../../../db/entities/xhs-image.entity";
import { XhsImageHistory } from "../../../db/entities/xhs-image-history.entity";
import { BaseGenerator } from "../generators";
import { XhsConfigService } from "./xhs-config.service";
import { BillingService } from "./billing.service";
import { ImageVersionService } from "./image-version.service";
import { GeneratorResolverService } from "./generator-resolver.service";
import { ImagePromptService } from "./image-prompt.service";

/**
 * 图片生成服务
 * 负责批量生成图片，使用SSE流式返回进度
 * 优化：Prompt 逻辑已委托给 ImagePromptService
 */
@Injectable()
export class ImageService {
    private readonly logger = new Logger(ImageService.name);

    constructor(
        @InjectRepository(XhsTask)
        private taskRepository: Repository<XhsTask>,
        @InjectRepository(XhsImage)
        private imageRepository: Repository<XhsImage>,
        @InjectRepository(XhsImageHistory)
        private imageHistoryRepository: Repository<XhsImageHistory>,
        private readonly configService: XhsConfigService,
        private readonly billingService: BillingService,
        private readonly versionService: ImageVersionService,
        private readonly generatorResolver: GeneratorResolverService,
        private readonly promptService: ImagePromptService,
    ) {}



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
     * 优化：使用并发限制器，最多同时 3 个请求，防止 AI 服务过载
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
        // 并发限制：最多同时生成 3 张图片
        const MAX_CONCURRENCY = 3;
        
        this.logger.log(`[XHS Creator] 启用高并发模式，限制并发数: ${MAX_CONCURRENCY}`);

        subject.next({
            data: JSON.stringify({
                type: "progress",
                stage: "content",
                current: 0,
                total: contentPages.length,
                message: `开始并发生成 ${contentPages.length} 页内容（并发限制: ${MAX_CONCURRENCY}）...`,
            }),
        } as MessageEvent);

        let completedCount = 0;
        let successCount = 0;

        // 使用简单的并发限制器
        const results: Array<{ page: typeof contentPages[0]; imageUrl?: string; error?: Error }> = [];
        const queue = [...contentPages.entries()];
        const executing = new Set<Promise<void>>();

        const runTask = async (idx: number, page: typeof contentPages[0]) => {
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

                completedCount++;
                successCount++;
                results.push({ page, imageUrl });

                this.logger.debug(`第${idx + 1}页生成成功`);

                subject.next({
                    data: JSON.stringify({
                        type: "progress",
                        stage: "content",
                        current: completedCount,
                        total: contentPages.length,
                        message: `正在生成第${idx + 1}页...`,
                    }),
                } as MessageEvent);

                subject.next({
                    data: JSON.stringify({
                        type: "complete",
                        pageIndex: page.index,
                        imageUrl,
                    }),
                } as MessageEvent);
            } catch (error) {
                completedCount++;
                results.push({ page, error: error as Error });

                this.logger.error(`第${idx + 1}页生成失败:`, error);

                subject.next({
                    data: JSON.stringify({
                        type: "error",
                        pageIndex: page.index,
                        message: (error as Error).message,
                    }),
                } as MessageEvent);
            }
        };

        // 并发控制循环
        while (queue.length > 0 || executing.size > 0) {
            // 填充执行队列到最大并发数
            while (queue.length > 0 && executing.size < MAX_CONCURRENCY) {
                const [idx, page] = queue.shift()!;
                const promise = runTask(idx, page).finally(() => {
                    executing.delete(promise);
                });
                executing.add(promise);
            }

            // 等待任意一个任务完成
            if (executing.size > 0) {
                await Promise.race(executing);
            }
        }

        this.logger.log(`[XHS Creator] 高并发生成完成，成功: ${successCount}/${contentPages.length}`);

        // 批量更新任务生成页数
        if (successCount > 0) {
            task.generatedPages += successCount;
            await this.taskRepository.save(task);
        }
    }

    /**
     * 顺序模式生成内容页
     * 优化：循环结束后批量更新任务进度，减少数据库写入次数
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
        // 本地计数器，避免每次循环都写数据库
        let successCount = 0;

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

                // 本地累计成功数，不再每次保存
                successCount++;

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

        // 循环结束后一次性更新任务进度（减少 N-1 次数据库写入）
        if (successCount > 0) {
            task.generatedPages += successCount;
            await this.taskRepository.save(task);
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
     * 委托给 ImagePromptService
     */
    private buildImagePrompt(
        pageContent: string,
        pageType: string,
        fullOutline?: string,
        userTopic?: string,
    ): string {
        return this.promptService.buildImagePrompt(pageContent, pageType, fullOutline, userTopic);
    }

    /**
     * 从页面内容中提取简短图片提示词（仅用于保存到数据库的 prompt 字段）
     * 委托给 ImagePromptService
     */
    private extractImagePrompt(content: string): string {
        return this.promptService.extractImagePrompt(content);
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
