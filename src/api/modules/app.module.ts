import { Module } from "@nestjs/common";

import { XhsCreatorModule } from "./xhs-creator/xhs-creator.module";

@Module({
    imports: [XhsCreatorModule],
    exports: [XhsCreatorModule],
})
export class AppModule {}
