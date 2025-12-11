import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { XhsConfig } from "../../../db/entities/xhs-config.entity";
import { UpdateXhsConfigDto } from "../dto";

/**
 * 缓存 TTL（毫秒）
 */
const CONFIG_CACHE_TTL = 60 * 1000; // 60 秒

@Injectable()
export class XhsConfigService {
    protected readonly logger = new Logger(XhsConfigService.name);

    /** 配置缓存 */
    private configCache: XhsConfig | null = null;
    /** 缓存时间戳 */
    private cacheTimestamp = 0;

    constructor(
        @InjectRepository(XhsConfig)
        private readonly configRepository: Repository<XhsConfig>,
    ) {}

    /**
     * 获取配置（带缓存）
     * 缓存 60 秒自动失效，或通过 invalidateCache() 手动失效
     */
    async getConfig(): Promise<XhsConfig> {
        const now = Date.now();

        // 检查缓存是否有效
        if (this.configCache && now - this.cacheTimestamp < CONFIG_CACHE_TTL) {
            return this.configCache;
        }

        // 查询数据库
        let config = await this.configRepository.findOne({
            where: {},
            order: { createdAt: "DESC" },
        });

        if (!config) {
            config = await this.configRepository.save(
                this.configRepository.create({
                    pluginName: "小红书图文生成",
                    bindKeyConfigId: "",
                    textKeyConfigId: "",
                    imageKeyConfigId: "",
                    coverImagePower: 80,
                    contentImagePower: 40,
                    textModel: "gpt-4o-mini",
                    textModelId: null,
                    imageModel: "gpt-image-1",
                    imageModelId: null,
                    imageEndpointType: "images",
                    imageEndpointUrl: null,
                    outlinePower: 10,
                    freeUsageLimit: 5,
                    homeTitle: "今天想在无限画布创作什么？",
                    quickStartTemplates: null,
                }),
            );
            this.logger.log("创建默认图文配置");
        }

        // 更新缓存
        this.configCache = config;
        this.cacheTimestamp = now;
        this.logger.debug("配置已缓存");

        return config;
    }

    /**
     * 手动失效缓存（配置更新后调用）
     */
    invalidateCache(): void {
        this.configCache = null;
        this.cacheTimestamp = 0;
        this.logger.debug("配置缓存已失效");
    }

    async updateConfig(id: string, dto: UpdateXhsConfigDto): Promise<XhsConfig> {
        const config = await this.configRepository.findOne({ where: { id } });
        if (!config) {
            throw new Error(`配置不存在，ID: ${id}`);
        }

        if (dto.bindKeyConfigId !== undefined) config.bindKeyConfigId = dto.bindKeyConfigId;
        if (dto.pluginName !== undefined) config.pluginName = dto.pluginName;
        if (dto.coverImagePower !== undefined) config.coverImagePower = dto.coverImagePower;
        if (dto.contentImagePower !== undefined) config.contentImagePower = dto.contentImagePower;
        if (dto.textModel !== undefined) config.textModel = dto.textModel;
        if (dto.textModelId !== undefined) config.textModelId = dto.textModelId || null;
        if (dto.imageModel !== undefined) config.imageModel = dto.imageModel;
        if (dto.imageModelId !== undefined) config.imageModelId = dto.imageModelId || null;
        if (dto.textKeyConfigId !== undefined) config.textKeyConfigId = dto.textKeyConfigId;
        if (dto.imageKeyConfigId !== undefined) config.imageKeyConfigId = dto.imageKeyConfigId;
        if (dto.imageEndpointType !== undefined) config.imageEndpointType = dto.imageEndpointType;
        if (dto.imageEndpointUrl !== undefined) config.imageEndpointUrl = dto.imageEndpointUrl || null;
        if (dto.highConcurrency !== undefined) config.highConcurrency = dto.highConcurrency;
        if (dto.outlinePower !== undefined) config.outlinePower = dto.outlinePower;
        if (dto.freeUsageLimit !== undefined) config.freeUsageLimit = dto.freeUsageLimit;
        if (dto.homeTitle !== undefined) config.homeTitle = dto.homeTitle;
        if (dto.quickStartTemplates !== undefined) config.quickStartTemplates = dto.quickStartTemplates;

        const savedConfig = await this.configRepository.save(config);

        // 配置更新后失效缓存
        this.invalidateCache();

        return savedConfig;
    }

    async getPluginConfig() {
        const config = await this.getConfig();
        return {
            pluginName: config.pluginName,
            coverImagePower: config.coverImagePower,
            contentImagePower: config.contentImagePower,
            homeTitle: config.homeTitle,
            quickStartTemplates: config.quickStartTemplates,
        };
    }

}

