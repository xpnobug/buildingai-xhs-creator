import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { XhsConfig } from "../../../db/entities/xhs-config.entity";
import { UpdateXhsConfigDto } from "../dto";

@Injectable()
export class XhsConfigService {
    protected readonly logger = new Logger(XhsConfigService.name);

    constructor(
        @InjectRepository(XhsConfig)
        private readonly configRepository: Repository<XhsConfig>,
    ) {}

    async getConfig(): Promise<XhsConfig> {
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
                }),
            );
            this.logger.log("创建默认图文配置");
        }

        return config;
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

        return await this.configRepository.save(config);
    }

    async getPluginConfig() {
        const config = await this.getConfig();
        return {
            pluginName: config.pluginName,
            coverImagePower: config.coverImagePower,
            contentImagePower: config.contentImagePower,
        };
    }

}

