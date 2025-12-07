import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@buildingai/db/@nestjs/typeorm";
import { AiPublicModule } from "@buildingai/extension-sdk";
import { XhsTask } from "../../db/entities/xhs-task.entity";
import { XhsImage } from "../../db/entities/xhs-image.entity";
import { XhsImageHistory } from "../../db/entities/xhs-image-history.entity";
import { XhsProvider } from "../../db/entities/xhs-provider.entity";
import { XhsConfig } from "../../db/entities/xhs-config.entity";
import { XhsUserUsage } from "../../db/entities/xhs-user-usage.entity";
import {
    OutlineController,
    ImageController,
    TaskController,
    ProviderController,
    XhsConfigController,
    XhsConfigWebController,
    TaskConsoleController,
    BalanceController,
} from "./controllers";
import {
    OutlineService,
    ImageService,
    ImagePromptService,
    XhsConfigService,
    ImageVersionService,
    GeneratorResolverService,
} from "./services";
import { BillingService } from "./services/billing.service";

/**
 * 小红书图文生成模块
 * 提供AI驱动的小红书图文内容生成功能
 */
@Module({
    imports: [TypeOrmModule.forFeature([XhsTask, XhsImage, XhsImageHistory, XhsProvider, XhsConfig, XhsUserUsage]), AiPublicModule],
    controllers: [
        OutlineController,
        ImageController,
        TaskController,
        ProviderController,
        XhsConfigController,
        XhsConfigWebController,
        TaskConsoleController,
        BalanceController,
    ],
    providers: [
        OutlineService,
        ImageService,
        ImagePromptService,
        XhsConfigService,
        BillingService,
        ImageVersionService,
        GeneratorResolverService,
    ],
    exports: [
        OutlineService,
        ImageService,
        ImagePromptService,
        XhsConfigService,
        BillingService,
        ImageVersionService,
        GeneratorResolverService,
    ],
})
export class XhsCreatorModule {}

