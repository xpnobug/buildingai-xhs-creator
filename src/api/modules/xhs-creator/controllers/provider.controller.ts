import { ExtensionConsoleController } from "@buildingai/core/decorators";
import { Body, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { Repository } from "@buildingai/db/typeorm";
import { XhsProvider } from "../../../db/entities/xhs-provider.entity";
import { CreateProviderDto } from "../dto";

/**
 * AI服务商配置控制器
 */
@ExtensionConsoleController("providers", "AI服务商配置")
export class ProviderController {
    constructor(
        @InjectRepository(XhsProvider)
        private providerRepository: Repository<XhsProvider>,
    ) {}

    /**
     * 获取所有服务商配置
     */
    @Get()
    async getProviders() {
        const providers = await this.providerRepository.find();

        // 脱敏处理API Key
        const sanitizedProviders = providers.map((p) => ({
            ...p,
            apiKey: this.maskApiKey(p.apiKey),
        }));

        return {
            success: true,
            providers: sanitizedProviders,
        };
    }

    /**
     * 创建服务商配置
     */
    @Post()
    async createProvider(@Body() dto: CreateProviderDto) {
        const provider = this.providerRepository.create(dto);
        await this.providerRepository.save(provider);

        return {
            success: true,
            provider: {
                ...provider,
                apiKey: this.maskApiKey(provider.apiKey),
            },
        };
    }

    /**
     * 更新服务商配置
     */
    @Put(":id")
    async updateProvider(@Param("id") id: string, @Body() dto: Partial<CreateProviderDto>) {
        const provider = await this.providerRepository.findOne({ where: { id } });

        if (!provider) {
            throw new Error("服务商配置不存在");
        }

        Object.assign(provider, dto);
        await this.providerRepository.save(provider);

        return {
            success: true,
            provider: {
                ...provider,
                apiKey: this.maskApiKey(provider.apiKey),
            },
        };
    }

    /**
     * 激活服务商
     */
    @Post(":id/activate")
    async activateProvider(@Param("id") id: string) {
        const provider = await this.providerRepository.findOne({ where: { id } });

        if (!provider) {
            throw new Error("服务商配置不存在");
        }

        // 取消同类型其他服务商的激活状态
        await this.providerRepository.update(
            { serviceType: provider.serviceType, isActive: true },
            { isActive: false },
        );

        // 激活当前服务商
        provider.isActive = true;
        await this.providerRepository.save(provider);

        return {
            success: true,
        };
    }

    /**
     * 删除服务商配置
     */
    @Delete(":id")
    async deleteProvider(@Param("id") id: string) {
        await this.providerRepository.delete(id);

        return {
            success: true,
        };
    }

    /**
     * API Key脱敏处理
     */
    private maskApiKey(apiKey: string): string {
        if (!apiKey || apiKey.length < 8) {
            return "****";
        }

        const start = apiKey.substring(0, 4);
        const end = apiKey.substring(apiKey.length - 4);
        return `${start}****${end}`;
    }
}
