import { ExtensionEntity } from "@buildingai/core/decorators";
import { Column, CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

/**
 * 小红书用户使用统计
 * 跟踪用户的免费使用次数消耗情况
 */
@ExtensionEntity({ name: "xhs_user_usage", comment: "小红书用户使用统计" })
export class XhsUserUsage {
    /**
     * 主键ID
     */
    @PrimaryGeneratedColumn("uuid")
    id: string;

    /**
     * 用户ID
     */
    @Column({ type: "varchar", length: 255, unique: true, comment: "用户ID" })
    userId: string;

    /**
     * 已使用免费次数（大纲+图片共用）
     */
    @Column({ type: "int", default: 0, comment: "已使用免费次数" })
    freeUsageCount: number;

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
