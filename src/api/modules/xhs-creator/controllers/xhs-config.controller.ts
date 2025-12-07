import { ExtensionConsoleController } from "@buildingai/core/decorators";
import { Body, Get, Param, Patch } from "@nestjs/common";

import { UpdateXhsConfigDto } from "../dto";
import { XhsConfigService } from "../services/xhs-config.service";

@ExtensionConsoleController("config", "小红书图文配置管理")
export class XhsConfigController {
    constructor(private readonly xhsConfigService: XhsConfigService) {}

    @Get()
    async getConfig() {
        return await this.xhsConfigService.getConfig();
    }

    @Patch(":id")
    async updateConfig(@Param("id") id: string, @Body() dto: UpdateXhsConfigDto) {
        return await this.xhsConfigService.updateConfig(id, dto);
    }
}

