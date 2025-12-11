import { Injectable, Logger } from "@nestjs/common";
import { Repository, EntityManager } from "@buildingai/db/typeorm";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";

import { XhsImage, ImageStatus } from "../../../db/entities/xhs-image.entity";
import { XhsImageHistory } from "../../../db/entities/xhs-image-history.entity";

/**
 * 版本生成类型
 */
export type GeneratedBy = "initial" | "single-regenerate" | "batch-regenerate";

/**
 * 保存版本选项
 */
export interface SaveVersionOptions {
    imageRecord: XhsImage;
    taskId: string;
    imageUrl: string;
    prompt: string;
    generatedBy: GeneratedBy;
    powerAmount: number;
}

/**
 * 图片版本管理服务
 * 负责图片版本历史的保存、查询、恢复
 */
@Injectable()
export class ImageVersionService {
    private readonly logger = new Logger(ImageVersionService.name);

    constructor(
        @InjectRepository(XhsImage)
        private readonly imageRepository: Repository<XhsImage>,
        @InjectRepository(XhsImageHistory)
        private readonly imageHistoryRepository: Repository<XhsImageHistory>,
    ) {}

    /**
     * 保存图片版本记录
     */
    async saveVersion(options: SaveVersionOptions): Promise<void> {
        const { imageRecord, taskId, imageUrl, prompt, generatedBy, powerAmount } = options;

        try {
            // 将之前的版本设置为非当前版本
            await this.imageHistoryRepository.update(
                { imageId: imageRecord.id, isCurrent: true },
                { isCurrent: false },
            );

            // 创建新版本记录
            await this.imageHistoryRepository.save({
                imageId: imageRecord.id,
                taskId,
                pageIndex: imageRecord.pageIndex,
                version: imageRecord.currentVersion,
                imageUrl,
                prompt,
                generatedBy,
                powerAmount,
                isCurrent: true,
            });

            this.logger.debug(
                `保存图片版本: imageId=${imageRecord.id}, version=${imageRecord.currentVersion}, generatedBy=${generatedBy}`,
            );
        } catch (error) {
            this.logger.error(`保存图片版本失败: ${error.message}`);
            // 不抛出错误，避免影响主流程
        }
    }

    /**
     * 获取图片的所有历史版本
     */
    async getVersions(taskId: string, pageIndex: number): Promise<XhsImageHistory[]> {
        return await this.imageHistoryRepository.find({
            where: { taskId, pageIndex },
            order: { version: "DESC" },
        });
    }

    /**
     * 获取特定版本的图片
     */
    async getVersion(
        taskId: string,
        pageIndex: number,
        version: number,
    ): Promise<XhsImageHistory | null> {
        return await this.imageHistoryRepository.findOne({
            where: { taskId, pageIndex, version },
        });
    }

    /**
     * 恢复到指定版本
     * 注意：恢复操作不创建新版本，只是切换到已有版本
     */
    async restoreVersion(
        taskId: string,
        pageIndex: number,
        version: number,
    ): Promise<string> {
        // 获取要恢复的版本
        const versionRecord = await this.getVersion(taskId, pageIndex, version);
        if (!versionRecord) {
            throw new Error(`版本 v${version} 不存在`);
        }

        // 获取当前图片记录
        const imageRecord = await this.imageRepository.findOne({
            where: { taskId, pageIndex },
        });
        if (!imageRecord) {
            throw new Error("图片记录不存在");
        }

        // 在事务中执行版本切换
        await this.imageRepository.manager.transaction(async (manager) => {
            // 1. 将该图片的所有版本的 isCurrent 设为 false
            await this.imageHistoryRepository.update(
                { imageId: imageRecord.id },
                { isCurrent: false },
            );

            // 2. 将目标版本的 isCurrent 设为 true
            await this.imageHistoryRepository.update(
                { id: versionRecord.id },
                { isCurrent: true },
            );

            // 3. 更新主记录，指向恢复的版本
            await manager.update(this.imageRepository.target, imageRecord.id, {
                imageUrl: versionRecord.imageUrl,
                currentVersion: version,
                status: ImageStatus.COMPLETED,
            });
        });

        this.logger.log(
            `图片 ${imageRecord.id} 已切换到版本 v${version}（不创建新版本）`,
        );

        return versionRecord.imageUrl;
    }

    /**
     * 获取当前版本号
     */
    async getCurrentVersion(taskId: string, pageIndex: number): Promise<number> {
        const imageRecord = await this.imageRepository.findOne({
            where: { taskId, pageIndex },
        });
        return imageRecord?.currentVersion || 0;
    }

    /**
     * 递增版本号并返回新版本
     */
    async incrementVersion(imageId: string): Promise<number> {
        const imageRecord = await this.imageRepository.findOne({
            where: { id: imageId },
        });
        if (!imageRecord) {
            throw new Error("图片记录不存在");
        }

        const newVersion = imageRecord.currentVersion + 1;
        await this.imageRepository.update(imageId, { currentVersion: newVersion });
        return newVersion;
    }
}
