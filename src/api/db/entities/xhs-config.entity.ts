import { ExtensionEntity } from "@buildingai/core/decorators";
import { Column, CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

/**
 * 小红书图文生成配置
 */
@ExtensionEntity({ name: "xhs_config", comment: "小红书图文生成配置" })
export class XhsConfig {
    /**
     * 主键ID
     */
    @PrimaryGeneratedColumn("uuid")
    id: string;

    /**
     * 绑定的密钥配置ID
     */
    @Column({ type: "varchar", length: 255, comment: "绑定的密钥配置ID", default: "" })
    bindKeyConfigId: string;

    /**
     * 文本密钥配置ID
     */
    @Column({ type: "varchar", length: 255, comment: "文本生成密钥配置ID", default: "" })
    textKeyConfigId: string;

    /**
     * 图片密钥配置ID
     */
    @Column({ type: "varchar", length: 255, comment: "图片生成密钥配置ID", default: "" })
    imageKeyConfigId: string;

    /**
     * 插件名称
     */
    @Column({ type: "varchar", length: 255, comment: "插件名称" })
    pluginName: string;

    /**
     * 封面图消耗积分
     */
    @Column({ type: "int", default: 80, comment: "封面图每张消耗积分" })
    coverImagePower: number;

    /**
     * 内容图消耗积分
     */
    @Column({ type: "int", default: 40, comment: "内容图每张消耗积分" })
    contentImagePower: number;

    /**
     * 文本生成模型
     */
    @Column({
        type: "varchar",
        length: 255,
        default: "gpt-4o-mini",
        comment: "用于生成大纲的文本模型",
    })
    textModel: string;

    /**
     * 文本模型ID
     */
    @Column({
        type: "uuid",
        nullable: true,
        comment: "系统AI模型ID（文本）",
    })
    textModelId: string | null;

    /**
     * 图片生成模型
     */
    @Column({
        type: "varchar",
        length: 255,
        default: "gpt-image-1",
        comment: "用于生成图片的模型",
    })
    imageModel: string;

    /**
     * 图片模型ID
     */
    @Column({
        type: "uuid",
        nullable: true,
        comment: "系统AI模型ID（图片）",
    })
    imageModelId: string | null;

    /**
     * 图片生成端点类型
     * images: OpenAI Images API (/v1/images/generations) - 默认，适用于 DALL-E
     * chat: Chat Completions API (/v1/chat/completions) - 适用于 Gemini, Claude 等支持图片生成的模型
     * custom: 自定义端点 - 适用于其他非标准 API
     */
    @Column({
        type: "varchar",
        length: 50,
        default: "images",
        comment: "图片生成端点类型：images（OpenAI Images API）、chat（Chat Completions API）、custom（自定义端点）",
    })
    imageEndpointType: "images" | "chat" | "custom";

    /**
     * 自定义图片生成端点URL
     * 当 imageEndpointType 为 'custom' 时使用
     */
    @Column({
        type: "varchar",
        length: 500,
        nullable: true,
        comment: "自定义图片生成端点URL（当image_endpoint_type为custom时使用）",
    })
    imageEndpointUrl: string | null;

    /**
     * 是否启用高并发图片生成
     * 启用后会并行生成内容页图片，加快整体生成速度
     */
    @Column({
        type: "boolean",
        default: false,
        comment: "是否启用高并发图片生成模式",
    })
    highConcurrency: boolean;

    /**
     * 大纲生成消耗积分
     */
    @Column({
        type: "int",
        default: 10,
        comment: "大纲生成每次消耗积分",
    })
    outlinePower: number;

    /**
     * 用户免费使用次数（大纲+图片共用）
     */
    @Column({
        type: "int",
        default: 5,
        comment: "每用户免费使用总次数（大纲和图片生成共用）",
    })
    freeUsageLimit: number;

    /**
     * 创建时间
     */
    @CreateDateColumn({ comment: "创建时间" })
    createdAt: Date;

    /**
     * 更新时间
     */
    @UpdateDateColumn({ comment: "更新时间" })
    updatedAt: Date;
}

