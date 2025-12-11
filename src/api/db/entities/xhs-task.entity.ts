import { ExtensionEntity } from "@buildingai/core/decorators";
import {
    Column,
    CreateDateColumn,
    Index,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from "@buildingai/db/typeorm";

/**
 * 任务状态枚举
 */
export enum TaskStatus {
    PENDING = "pending",
    GENERATING_OUTLINE = "generating_outline",
    OUTLINE_READY = "outline_ready",
    GENERATING_IMAGES = "generating_images",
    COMPLETED = "completed",
    FAILED = "failed",
}

/**
 * 小红书图文生成任务实体
 */
@ExtensionEntity({ name: "xhs_creator_tasks", comment: "小红书图文生成任务" })
@Index("idx_xhs_task_user_status", ["userId", "status"])  // 复合索引：按用户ID+状态查询
export class XhsTask {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    // 用户输入的主题
    @Column({ type: "varchar", length: 500 })
    topic: string;

    // AI生成的完整大纲
    @Column({ type: "text", nullable: true })
    outline: string;

    // 页面结构化数据
    @Column({ type: "jsonb", nullable: true })
    pages: Array<{
        index: number;
        type: "cover" | "content" | "summary";
        content: string;
    }>;

    // 任务状态
    @Column({
        type: "enum",
        enum: TaskStatus,
        default: TaskStatus.PENDING,
    })
    status: TaskStatus;

    // 用户上传的参考图片URL列表
    @Column({ type: "jsonb", nullable: true })
    userImages: string[];

    // 封面图片URL
    @Column({ type: "varchar", nullable: true })
    coverImageUrl: string;

    // 总页数
    @Column({ type: "int", default: 0 })
    totalPages: number;

    // 已生成页数
    @Column({ type: "int", default: 0 })
    generatedPages: number;

    // 错误信息
    @Column({ type: "text", nullable: true })
    errorMessage: string;

    // 关联的图片
    @OneToMany("XhsImage", "task")
    images: any[];

    // 创建用户ID
    @Column({ type: "uuid", nullable: true })
    userId: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
