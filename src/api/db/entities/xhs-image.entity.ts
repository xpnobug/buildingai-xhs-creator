import { ExtensionEntity } from "@buildingai/core/decorators";
import {
    Column,
    CreateDateColumn,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from "@buildingai/db/typeorm";

/**
 * 图片生成状态枚举
 */
export enum ImageStatus {
    PENDING = "pending",
    GENERATING = "generating",
    COMPLETED = "completed",
    FAILED = "failed",
}

/**
 * 小红书图片实体
 */
@ExtensionEntity({ name: "xhs_creator_images", comment: "小红书图文生成图片" })
export class XhsImage {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    // 所属任务ID（外键列 task_id）
    @Column({ type: "uuid", name: "task_id" })
    taskId: string;

    // 关联任务
    @ManyToOne("XhsTask", "images", {
        onDelete: "CASCADE",
    })
    @JoinColumn({ name: "task_id" })
    task: any;

    // 页面索引
    @Column({ type: "int" })
    pageIndex: number;

    // 页面类型
    @Column({ type: "varchar", length: 100 })
    pageType: "cover" | "content" | "summary";

    // 图片生成提示词
    @Column({ type: "text" })
    prompt: string;

    // 生成的图片URL
    @Column({ type: "varchar", nullable: true })
    imageUrl: string;

    // 缩略图URL
    @Column({ type: "varchar", nullable: true })
    thumbnailUrl: string;

    // 生成状态
    @Column({
        type: "enum",
        enum: ImageStatus,
        default: ImageStatus.PENDING,
    })
    status: ImageStatus;

    // 错误信息
    @Column({ type: "text", nullable: true })
    errorMessage: string;

    // 重试次数
    @Column({ type: "int", default: 0 })
    retryCount: number;

    // 当前版本号
    @Column({ type: "int", default: 1, comment: "当前版本号" })
    currentVersion: number;

    // 是否已扣减积分
    @Column({ type: "boolean", default: false, comment: "是否已扣减积分" })
    powerDeducted: boolean;

    // 扣减的积分数量
    @Column({ type: "int", default: 0, comment: "扣减的积分数量" })
    powerAmount: number;

    // 关联的账单记录号（用于追溯）
    @Column({
        type: "varchar",
        nullable: true,
        comment: "关联的账单记录号（用于追溯）",
    })
    billingAccountNo: string;

    @CreateDateColumn()
    createdAt: Date;
}
