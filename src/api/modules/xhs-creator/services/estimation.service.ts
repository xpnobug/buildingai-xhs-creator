import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { Repository } from "@buildingai/db/typeorm";

import { XhsImage, ImageStatus } from "../../../db/entities/xhs-image.entity";
import { XhsConfig } from "../../../db/entities/xhs-config.entity";

/**
 * 图片生成时间预估服务
 * 基于历史生成数据，提供精准的时间预估
 */
@Injectable()
export class EstimationService {
    private readonly logger = new Logger(EstimationService.name);

    // 默认预估值（毫秒），用于无历史数据时的回退
    private readonly DEFAULT_COVER_TIME_MS = 45000;    // 45 秒
    private readonly DEFAULT_CONTENT_TIME_MS = 25000;  // 25 秒
    private readonly MIN_SAMPLE_SIZE = 5;              // 最小样本数

    constructor(
        @InjectRepository(XhsImage)
        private readonly imageRepository: Repository<XhsImage>,
        @InjectRepository(XhsConfig)
        private readonly configRepository: Repository<XhsConfig>,
    ) {}

    /**
     * 获取历史平均生成时间（按页面类型分组）
     */
    async getAverageGenerationTime(): Promise<{
        cover: number;
        content: number;
        sampleSize: number;
        isDefaultValue: boolean;
    }> {
        try {
            // 查询最近 100 条成功生成的记录
            const recentImages = await this.imageRepository
                .createQueryBuilder("image")
                .where("image.status = :status", { status: ImageStatus.COMPLETED })
                .andWhere("image.generationDuration IS NOT NULL")
                .andWhere("image.generationDuration > 0")
                .orderBy("image.createdAt", "DESC")
                .limit(100)
                .getMany();

            if (recentImages.length < this.MIN_SAMPLE_SIZE) {
                this.logger.debug(`历史样本不足 (${recentImages.length}/${this.MIN_SAMPLE_SIZE})，使用默认预估值`);
                return {
                    cover: this.DEFAULT_COVER_TIME_MS,
                    content: this.DEFAULT_CONTENT_TIME_MS,
                    sampleSize: recentImages.length,
                    isDefaultValue: true,
                };
            }

            // 按类型分组计算平均值
            const coverImages = recentImages.filter(img => img.pageType === "cover");
            const contentImages = recentImages.filter(img => img.pageType === "content" || img.pageType === "summary");

            const avgCover = coverImages.length > 0
                ? Math.round(coverImages.reduce((sum, img) => sum + img.generationDuration, 0) / coverImages.length)
                : this.DEFAULT_COVER_TIME_MS;

            const avgContent = contentImages.length > 0
                ? Math.round(contentImages.reduce((sum, img) => sum + img.generationDuration, 0) / contentImages.length)
                : this.DEFAULT_CONTENT_TIME_MS;

            this.logger.debug(`历史平均耗时 - 封面: ${avgCover}ms, 内容: ${avgContent}ms (样本: ${recentImages.length})`);

            return {
                cover: avgCover,
                content: avgContent,
                sampleSize: recentImages.length,
                isDefaultValue: false,
            };
        } catch (error) {
            this.logger.error(`获取历史平均时间失败: ${error.message}`);
            return {
                cover: this.DEFAULT_COVER_TIME_MS,
                content: this.DEFAULT_CONTENT_TIME_MS,
                sampleSize: 0,
                isDefaultValue: true,
            };
        }
    }

    /**
     * 预估任务总时间
     * @param coverCount 封面数量
     * @param contentCount 内容页数量
     * @param highConcurrency 是否高并发模式
     */
    async estimateTaskTime(
        coverCount: number,
        contentCount: number,
        highConcurrency?: boolean,
    ): Promise<{
        totalEstimatedMs: number;
        formattedTime: string;
        breakdown: { type: string; count: number; avgMs: number; totalMs: number }[];
        isDefaultValue: boolean;
    }> {
        const avgTime = await this.getAverageGenerationTime();

        // 检查是否启用高并发
        let isHighConcurrency = highConcurrency;
        if (isHighConcurrency === undefined) {
            try {
                const config = await this.configRepository.findOne({ where: {} });
                isHighConcurrency = config?.highConcurrency ?? false;
            } catch {
                isHighConcurrency = false;
            }
        }

        // 并发系数：高并发模式下多张图片可以并行生成
        // 假设高并发模式下 3 张图片并行生成
        const concurrencyFactor = isHighConcurrency ? 0.4 : 1.0;

        const coverTotalMs = coverCount * avgTime.cover;
        const contentTotalMs = Math.round(contentCount * avgTime.content * concurrencyFactor);
        const totalEstimatedMs = coverTotalMs + contentTotalMs;

        const formattedTime = this.formatDuration(totalEstimatedMs);

        return {
            totalEstimatedMs,
            formattedTime,
            breakdown: [
                { type: "cover", count: coverCount, avgMs: avgTime.cover, totalMs: coverTotalMs },
                { type: "content", count: contentCount, avgMs: avgTime.content, totalMs: contentTotalMs },
            ],
            isDefaultValue: avgTime.isDefaultValue,
        };
    }

    /**
     * 格式化时长为友好字符串
     */
    formatDuration(ms: number): string {
        if (ms < 1000) {
            return "不到 1 秒";
        }

        const totalSeconds = Math.round(ms / 1000);
        
        if (totalSeconds < 60) {
            return `约 ${totalSeconds} 秒`;
        }

        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        if (seconds === 0) {
            return `约 ${minutes} 分钟`;
        }

        return `约 ${minutes} 分 ${seconds} 秒`;
    }

    /**
     * 获取生成统计信息
     */
    async getGenerationStats(): Promise<{
        totalGenerations: number;
        avgDurationMs: number;
        minDurationMs: number;
        maxDurationMs: number;
        byType: { [key: string]: { count: number; avgMs: number } };
    }> {
        try {
            const result = await this.imageRepository
                .createQueryBuilder("image")
                .select("image.pageType", "pageType")
                .addSelect("COUNT(*)", "count")
                .addSelect("AVG(image.generationDuration)", "avgDuration")
                .addSelect("MIN(image.generationDuration)", "minDuration")
                .addSelect("MAX(image.generationDuration)", "maxDuration")
                .where("image.status = :status", { status: ImageStatus.COMPLETED })
                .andWhere("image.generationDuration IS NOT NULL")
                .groupBy("image.pageType")
                .getRawMany();

            let totalGenerations = 0;
            let totalDuration = 0;
            let minDuration = Infinity;
            let maxDuration = 0;
            const byType: { [key: string]: { count: number; avgMs: number } } = {};

            for (const row of result) {
                const count = parseInt(row.count, 10);
                const avgMs = Math.round(parseFloat(row.avgDuration) || 0);
                const minMs = parseInt(row.minDuration, 10) || 0;
                const maxMs = parseInt(row.maxDuration, 10) || 0;

                totalGenerations += count;
                totalDuration += count * avgMs;
                minDuration = Math.min(minDuration, minMs);
                maxDuration = Math.max(maxDuration, maxMs);

                byType[row.pageType] = { count, avgMs };
            }

            return {
                totalGenerations,
                avgDurationMs: totalGenerations > 0 ? Math.round(totalDuration / totalGenerations) : 0,
                minDurationMs: minDuration === Infinity ? 0 : minDuration,
                maxDurationMs: maxDuration,
                byType,
            };
        } catch (error) {
            this.logger.error(`获取生成统计失败: ${error.message}`);
            return {
                totalGenerations: 0,
                avgDurationMs: 0,
                minDurationMs: 0,
                maxDurationMs: 0,
                byType: {},
            };
        }
    }
}
