import { Injectable, Logger } from "@nestjs/common";
import { PublicAiModelService } from "@buildingai/extension-sdk";

import {
    BaseGenerator,
    OpenAIGenerator,
    ChatCompletionsGenerator,
    CustomEndpointGenerator,
} from "../generators";
import { XhsConfigService } from "./xhs-config.service";

/**
 * 生成器解析服务
 * 根据配置返回对应的图片生成器
 */
@Injectable()
export class GeneratorResolverService {
    private readonly logger = new Logger(GeneratorResolverService.name);

    constructor(
        private readonly configService: XhsConfigService,
        private readonly aiModelService: PublicAiModelService,
    ) {}

    /**
     * 解析并返回图片生成器
     */
    async resolve(): Promise<BaseGenerator> {
        const config = await this.configService.getConfig();
        if (!config.imageModelId) {
            throw new Error("尚未选择图片生成模型，请先在后台配置模型");
        }

        const [model, providerSecret] = await Promise.all([
            this.aiModelService.getModelInfo(config.imageModelId),
            this.aiModelService.getProviderConfig(config.imageModelId),
        ]);

        const apiKey = providerSecret["apiKey"]?.value;
        if (!apiKey) {
            throw new Error("所选图片模型未绑定密钥，请检查AI供应商配置");
        }

        const baseUrl = providerSecret["baseUrl"]?.value;
        const modelName = model.model || config.imageModel || "gpt-image-1";
        const endpointType = config.imageEndpointType || "images";
        const customEndpointUrl = config.imageEndpointUrl;

        // 打印使用的图片模型信息
        this.logModelInfo(model.provider.provider, modelName, baseUrl, config.imageModelId, endpointType, customEndpointUrl);

        // 根据端点类型选择生成器
        return this.createGenerator(endpointType, apiKey, baseUrl, modelName, customEndpointUrl);
    }

    /**
     * 打印模型信息
     */
    private logModelInfo(
        provider: string,
        modelName: string,
        baseUrl: string | undefined,
        modelId: string,
        endpointType: string,
        customEndpointUrl?: string | null,
    ): void {
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("🎨 [XHS Creator] 图片生成 - 使用的图片模型信息:");
        console.log(`   供应商: ${provider}`);
        console.log(`   模型名称: ${modelName}`);
        console.log(`   Base URL: ${baseUrl || "默认"}`);
        console.log(`   模型ID: ${modelId}`);
        console.log(`   端点类型: ${endpointType}`);
        if (endpointType === "custom" && customEndpointUrl) {
            console.log(`   自定义端点: ${customEndpointUrl}`);
        }
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    }

    /**
     * 根据端点类型创建生成器
     */
    private createGenerator(
        endpointType: string,
        apiKey: string,
        baseUrl: string | undefined,
        modelName: string,
        customEndpointUrl?: string | null,
    ): BaseGenerator {
        switch (endpointType) {
            case "images":
                // 使用 OpenAI Images API (/v1/images/generations)
                return new OpenAIGenerator({
                    apiKey,
                    baseUrl,
                    model: modelName,
                });

            case "chat":
                // 使用 Chat Completions API (/v1/chat/completions)
                return new ChatCompletionsGenerator({
                    apiKey,
                    baseUrl,
                    model: modelName,
                });

            case "custom":
                // 使用自定义端点
                if (!customEndpointUrl) {
                    throw new Error("自定义端点类型需要配置 imageEndpointUrl");
                }
                return new CustomEndpointGenerator({
                    apiKey,
                    baseUrl,
                    model: modelName,
                    endpointUrl: customEndpointUrl,
                });

            default:
                throw new Error(`不支持的端点类型: ${endpointType}`);
        }
    }
}
