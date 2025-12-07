import { ExtensionWebController } from "@buildingai/core/decorators";
import { Get } from "@nestjs/common";

import { XhsConfigService } from "../services/xhs-config.service";

@ExtensionWebController("xhs-creator")
export class XhsConfigWebController {
    constructor(private readonly xhsConfigService: XhsConfigService) {}

    @Get("config")
    async getPluginConfig() {
        return await this.xhsConfigService.getPluginConfig();
    }
}

