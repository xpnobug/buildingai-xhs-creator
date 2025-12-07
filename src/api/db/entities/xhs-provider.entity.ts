import { ExtensionEntity } from "@buildingai/core/decorators";
import { Column, CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from "@buildingai/db/typeorm";

/**
 * AI服务商类型枚举
 */
export enum ProviderType {
    OPENAI = "openai",
    GEMINI = "gemini",
    CUSTOM = "custom",
}

/**
 * 服务类型枚举
 */
export enum ServiceType {
    TEXT = "text",    // 文本生成
    IMAGE = "image",  // 图片生成
}

/**
 * AI服务商配置实体
 */
@ExtensionEntity({ name: "xhs_creator_providers", comment: "小红书AI服务商配置" })
export class XhsProvider {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    // 服务商名称
    @Column({ type: "varchar", length: 100 })
    name: string;

    // 服务商类型
    @Column({
        type: "enum",
        enum: ProviderType,
    })
    type: ProviderType;

    // 服务类型
    @Column({
        type: "enum",
        enum: ServiceType,
    })
    serviceType: ServiceType;

    // API密钥
    @Column({ type: "varchar", length: 500 })
    apiKey: string;

    // API基础URL
    @Column({ type: "varchar", nullable: true })
    baseUrl: string;

    // 模型名称
    @Column({ type: "varchar", nullable: true })
    model: string;

    // 其他配置（JSON格式）
    @Column({ type: "jsonb", nullable: true })
    config: Record<string, any>;

    // 是否激活
    @Column({ type: "boolean", default: false })
    isActive: boolean;

    // 是否启用
    @Column({ type: "boolean", default: true })
    isEnabled: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
