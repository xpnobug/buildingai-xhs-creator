import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";

export class GenerateImagesDto {
    @IsUUID()
    @IsNotEmpty()
    taskId: string;

    @IsArray()
    pages: Array<{
        index: number;
        type: "cover" | "content" | "summary";
        content: string;
    }>;

    @IsString()
    fullOutline: string;

    /**
     * 是否为批量重绘（全部重绘）
     * true: 版本号递增，标记为 batch-regenerate
     * false/undefined: 首次生成，版本号为 1，标记为 initial
     */
    @IsBoolean()
    @IsOptional()
    isRegenerate?: boolean;
}
