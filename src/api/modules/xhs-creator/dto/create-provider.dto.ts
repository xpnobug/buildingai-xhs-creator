import {
    IsBoolean,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
} from "class-validator";
import { ProviderType, ServiceType } from "../../../db/entities";

export class CreateProviderDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsEnum(ProviderType)
    type: ProviderType;

    @IsEnum(ServiceType)
    serviceType: ServiceType;

    @IsString()
    @IsNotEmpty()
    apiKey: string;

    @IsOptional()
    @IsString()
    baseUrl?: string;

    @IsOptional()
    @IsString()
    model?: string;

    @IsOptional()
    config?: Record<string, any>;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
