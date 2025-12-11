import { IsBoolean, IsNumber, IsOptional, IsString } from "class-validator";

/**
 * 更新小红书配置 DTO
 */
export class UpdateXhsConfigDto {
    @IsString()
    @IsOptional()
    bindKeyConfigId?: string;

    @IsString()
    @IsOptional()
    pluginName?: string;

    @IsNumber()
    @IsOptional()
    coverImagePower?: number;

    @IsNumber()
    @IsOptional()
    contentImagePower?: number;

    @IsString()
    @IsOptional()
    textModel?: string;

    @IsString()
    @IsOptional()
    textModelId?: string;

    @IsString()
    @IsOptional()
    textKeyConfigId?: string;

    @IsString()
    @IsOptional()
    imageKeyConfigId?: string;

    @IsString()
    @IsOptional()
    imageModel?: string;

    @IsString()
    @IsOptional()
    imageModelId?: string;

    @IsString()
    @IsOptional()
    imageEndpointType?: "images" | "chat" | "custom";

    @IsString()
    @IsOptional()
    imageEndpointUrl?: string | null;

    @IsBoolean()
    @IsOptional()
    highConcurrency?: boolean;

    @IsNumber()
    @IsOptional()
    outlinePower?: number;

    @IsNumber()
    @IsOptional()
    freeUsageLimit?: number;

    @IsString()
    @IsOptional()
    homeTitle?: string;

    @IsOptional()
    quickStartTemplates?: { title: string; image: string }[] | null;

    @IsString()
    @IsOptional()
    outlinePrompt?: string | null;

    @IsString()
    @IsOptional()
    imagePrompt?: string | null;
}

