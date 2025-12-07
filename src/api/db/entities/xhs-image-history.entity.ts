import { ExtensionEntity } from "@buildingai/core/decorators";
import {
    Column,
    CreateDateColumn,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from "@buildingai/db/typeorm";

/**
 * 图片版本历史实体
 * 记录每次图片生成/重绘的历史版本
 */
@ExtensionEntity({ name: "xhs_creator_image_history", comment: "小红书图片版本历史" })
export class XhsImageHistory {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    // 关联的主图片记录ID
    @Column({ type: "uuid", name: "image_id", comment: "关联的主图片记录ID" })
    imageId: string;

    // 关联主图片记录
    @ManyToOne("XhsImage", {
        onDelete: "CASCADE",
    })
    @JoinColumn({ name: "image_id" })
    image: any;

    // 所属任务ID
    @Column({ type: "uuid", name: "task_id", comment: "所属任务ID" })
    taskId: string;

    // 页面索引
    @Column({ type: "int", comment: "页面索引" })
    pageIndex: number;

    // 版本号（从1开始递增）
    @Column({ type: "int", comment: "版本号" })
    version: number;

    // 该版本的图片URL
    @Column({ type: "varchar", comment: "图片URL" })
    imageUrl: string;

    // 该版本使用的提示词
    @Column({ type: "text", comment: "图片生成提示词" })
    prompt: string;

    // 生成方式
    @Column({
        type: "varchar",
        length: 50,
        comment: "生成方式：initial（初始生成）/single-regenerate（单个重绘）/batch-regenerate（批量重绘）",
    })
    generatedBy: "initial" | "single-regenerate" | "batch-regenerate";

    // 消耗的积分
    @Column({ type: "int", default: 0, comment: "消耗的积分数量" })
    powerAmount: number;

    // 是否为当前使用的版本
    @Column({ type: "boolean", default: true, comment: "是否为当前版本" })
    isCurrent: boolean;

    // 创建时间（版本生成时间）
    @CreateDateColumn({ comment: "版本创建时间" })
    createdAt: Date;
}
