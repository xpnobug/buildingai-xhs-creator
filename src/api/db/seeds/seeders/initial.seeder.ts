import { BaseSeeder } from "@buildingai/db";
import { DataSource } from "@buildingai/db/typeorm";

/**
 * XHS Creator 初始化种子
 *
 * 创建 buildingai-xhs-creator 插件所需的数据库表
 */
export class XhsCreatorInitialSeeder extends BaseSeeder {
    readonly name = "XhsCreatorInitialSeeder";
    readonly priority = 100;

    /**
     * 运行种子文件
     */
    async run(dataSource: DataSource): Promise<void> {
        const queryRunner = dataSource.createQueryRunner();

        try {
            await queryRunner.connect();
            await queryRunner.startTransaction();

            // 创建 xhs_creator_tasks 表
            await queryRunner.query(
                `CREATE TABLE IF NOT EXISTS "buildingai_xhs_creator"."xhs_creator_tasks" (
                    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                    "topic" character varying(500) NOT NULL,
                    "outline" text,
                    "pages" jsonb,
                    "status" character varying(50) NOT NULL DEFAULT 'pending',
                    "user_images" jsonb,
                    "cover_image_url" character varying,
                    "total_pages" integer NOT NULL DEFAULT '0',
                    "generated_pages" integer NOT NULL DEFAULT '0',
                    "error_message" text,
                    "user_id" uuid,
                    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                    CONSTRAINT "PK_xhs_creator_tasks" PRIMARY KEY ("id")
                );
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_tasks"."topic" IS '用户输入的主题';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_tasks"."outline" IS 'AI生成的完整大纲';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_tasks"."pages" IS '页面结构化数据';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_tasks"."status" IS '任务状态';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_tasks"."user_images" IS '用户上传的参考图片URL列表';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_tasks"."cover_image_url" IS '封面图片URL';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_tasks"."total_pages" IS '总页数';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_tasks"."generated_pages" IS '已生成页数';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_tasks"."error_message" IS '错误信息';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_tasks"."user_id" IS '创建用户ID';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_tasks"."created_at" IS '创建时间';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_tasks"."updated_at" IS '更新时间'`,
            );
            await queryRunner.query(
                `COMMENT ON TABLE "buildingai_xhs_creator"."xhs_creator_tasks" IS '小红书图文生成任务'`,
            );
            this.logSuccess("创建 xhs_creator_tasks 表成功");

            // 创建 xhs_creator_providers 表
            await queryRunner.query(
                `CREATE TABLE IF NOT EXISTS "buildingai_xhs_creator"."xhs_creator_providers" (
                    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                    "name" character varying(100) NOT NULL,
                    "type" character varying(50) NOT NULL,
                    "service_type" character varying(50) NOT NULL,
                    "api_key" character varying(500) NOT NULL,
                    "base_url" character varying,
                    "model" character varying,
                    "config" jsonb,
                    "is_active" boolean NOT NULL DEFAULT false,
                    "is_enabled" boolean NOT NULL DEFAULT true,
                    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                    CONSTRAINT "PK_xhs_creator_providers" PRIMARY KEY ("id")
                );
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_providers"."name" IS '服务商名称';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_providers"."type" IS '服务商类型';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_providers"."service_type" IS '服务类型';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_providers"."api_key" IS 'API密钥';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_providers"."base_url" IS 'API基础URL';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_providers"."model" IS '模型名称';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_providers"."config" IS '其他配置（JSON格式）';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_providers"."is_active" IS '是否激活';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_providers"."is_enabled" IS '是否启用';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_providers"."created_at" IS '创建时间';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_providers"."updated_at" IS '更新时间'`,
            );
            await queryRunner.query(
                `COMMENT ON TABLE "buildingai_xhs_creator"."xhs_creator_providers" IS 'AI服务商配置'`,
            );
            this.logSuccess("创建 xhs_creator_providers 表成功");

            // 创建 xhs_creator_images 表
            await queryRunner.query(
                `CREATE TABLE IF NOT EXISTS "buildingai_xhs_creator"."xhs_creator_images" (
                    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                    "task_id" uuid NOT NULL,
                    "page_index" integer NOT NULL,
                    "page_type" character varying(100) NOT NULL,
                    "prompt" text NOT NULL,
                    "image_url" character varying,
                    "thumbnail_url" character varying,
                    "status" character varying(50) NOT NULL DEFAULT 'pending',
                    "error_message" text,
                    "retry_count" integer NOT NULL DEFAULT '0',
                    "current_version" integer NOT NULL DEFAULT '1',
                    "power_deducted" boolean NOT NULL DEFAULT false,
                    "power_amount" integer NOT NULL DEFAULT '0',
                    "billing_account_no" character varying,
                    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                    CONSTRAINT "PK_xhs_creator_images" PRIMARY KEY ("id"),
                    CONSTRAINT "FK_xhs_creator_images_task_id" FOREIGN KEY ("task_id") REFERENCES "buildingai_xhs_creator"."xhs_creator_tasks"("id") ON DELETE CASCADE
                );
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_images"."task_id" IS '所属任务ID';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_images"."page_index" IS '页面索引';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_images"."page_type" IS '页面类型';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_images"."prompt" IS '图片生成提示词';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_images"."image_url" IS '生成的图片URL';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_images"."thumbnail_url" IS '缩略图URL';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_images"."status" IS '生成状态';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_images"."error_message" IS '错误信息';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_images"."retry_count" IS '重试次数';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_images"."current_version" IS '当前版本号';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_images"."power_deducted" IS '是否已扣减积分';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_images"."power_amount" IS '扣减的积分数量';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_images"."billing_account_no" IS '关联的账单记录号（用于追溯）';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_images"."created_at" IS '创建时间'`,
            );
            await queryRunner.query(
                `COMMENT ON TABLE "buildingai_xhs_creator"."xhs_creator_images" IS '小红书图片生成记录'`,
            );
            this.logSuccess("创建 xhs_creator_images 表成功");

            // 创建 xhs_creator_image_history 表
            await queryRunner.query(
                `CREATE TABLE IF NOT EXISTS "buildingai_xhs_creator"."xhs_creator_image_history" (
                    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                    "image_id" uuid NOT NULL,
                    "task_id" uuid NOT NULL,
                    "page_index" integer NOT NULL,
                    "version" integer NOT NULL,
                    "image_url" character varying NOT NULL,
                    "prompt" text NOT NULL,
                    "generated_by" character varying(50) NOT NULL,
                    "power_amount" integer NOT NULL DEFAULT '0',
                    "is_current" boolean NOT NULL DEFAULT true,
                    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                    CONSTRAINT "PK_xhs_creator_image_history" PRIMARY KEY ("id"),
                    CONSTRAINT "FK_xhs_creator_image_history_image_id" FOREIGN KEY ("image_id") REFERENCES "buildingai_xhs_creator"."xhs_creator_images"("id") ON DELETE CASCADE,
                    CONSTRAINT "FK_xhs_creator_image_history_task_id" FOREIGN KEY ("task_id") REFERENCES "buildingai_xhs_creator"."xhs_creator_tasks"("id") ON DELETE CASCADE
                );
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_image_history"."image_id" IS '关联的主图片记录ID';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_image_history"."task_id" IS '所属任务ID';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_image_history"."page_index" IS '页面索引';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_image_history"."version" IS '版本号';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_image_history"."image_url" IS '图片URL';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_image_history"."prompt" IS '图片生成提示词';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_image_history"."generated_by" IS '生成方式：initial（初始生成）/single-regenerate（单个重绘）/batch-regenerate（批量重绘）';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_image_history"."power_amount" IS '消耗的积分数量';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_image_history"."is_current" IS '是否为当前版本';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_image_history"."created_at" IS '版本创建时间'`,
            );
            await queryRunner.query(
                `COMMENT ON TABLE "buildingai_xhs_creator"."xhs_creator_image_history" IS '小红书图片版本历史'`,
            );
            this.logSuccess("创建 xhs_creator_image_history 表成功");

            // 创建索引
            await queryRunner.query(
                `CREATE INDEX IF NOT EXISTS "idx_image_history_image_id" 
                ON "buildingai_xhs_creator"."xhs_creator_image_history"("image_id")`,
            );
            await queryRunner.query(
                `CREATE INDEX IF NOT EXISTS "idx_image_history_task_page" 
                ON "buildingai_xhs_creator"."xhs_creator_image_history"("task_id", "page_index")`,
            );
            await queryRunner.query(
                `CREATE INDEX IF NOT EXISTS "idx_image_history_version" 
                ON "buildingai_xhs_creator"."xhs_creator_image_history"("task_id", "page_index", "version")`,
            );
            this.logSuccess("创建版本历史表索引成功");

            // 创建 xhs_creator_images 复合索引（优化按任务ID+页面索引查询）
            await queryRunner.query(
                `CREATE INDEX IF NOT EXISTS "idx_xhs_image_task_page" 
                ON "buildingai_xhs_creator"."xhs_creator_images"("task_id", "page_index")`,
            );
            this.logSuccess("创建 xhs_creator_images 复合索引成功");

            // 创建 xhs_creator_tasks 复合索引（优化按用户ID+状态查询）
            await queryRunner.query(
                `CREATE INDEX IF NOT EXISTS "idx_xhs_task_user_status" 
                ON "buildingai_xhs_creator"."xhs_creator_tasks"("user_id", "status")`,
            );
            this.logSuccess("创建 xhs_creator_tasks 复合索引成功");

            // 创建 xhs_config 表
            await queryRunner.query(
                `CREATE TABLE IF NOT EXISTS "buildingai_xhs_creator"."xhs_config" (
                    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                    "plugin_name" character varying(255) NOT NULL,
                    "bind_key_config_id" character varying(255) NOT NULL DEFAULT '',
                    "text_key_config_id" character varying(255) NOT NULL DEFAULT '',
                    "image_key_config_id" character varying(255) NOT NULL DEFAULT '',
                    "cover_image_power" integer NOT NULL DEFAULT 80,
                    "content_image_power" integer NOT NULL DEFAULT 40,
                    "text_model" character varying(255) NOT NULL DEFAULT 'gpt-4o-mini',
                    "text_model_id" uuid,
                    "image_model" character varying(255) NOT NULL DEFAULT 'gpt-image-1',
                    "image_model_id" uuid,
                    "image_endpoint_type" character varying(50) NOT NULL DEFAULT 'images',
                    "image_endpoint_url" character varying(500),
                    "high_concurrency" boolean NOT NULL DEFAULT false,
                    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                    CONSTRAINT "PK_xhs_config" PRIMARY KEY ("id")
                );
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_config"."plugin_name" IS '插件名称';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_config"."bind_key_config_id" IS '绑定的密钥配置ID';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_config"."text_key_config_id" IS '文本生成密钥配置ID';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_config"."image_key_config_id" IS '图片生成密钥配置ID';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_config"."cover_image_power" IS '封面图积分消耗';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_config"."content_image_power" IS '内容图积分消耗';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_config"."text_model" IS '文本生成模型';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_config"."text_model_id" IS '系统AI模型ID（文本）';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_config"."image_model" IS '图片生成模型';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_config"."image_model_id" IS '系统AI模型ID（图片）';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_config"."image_endpoint_type" IS '图片生成端点类型：images（OpenAI Images API）、chat（Chat Completions API）、custom（自定义端点）';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_config"."image_endpoint_url" IS '自定义图片生成端点URL（当image_endpoint_type为custom时使用）';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_config"."high_concurrency" IS '是否启用高并发图片生成模式';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_config"."created_at" IS '创建时间';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_config"."updated_at" IS '更新时间'`,
            );

            // 添加新字段（如果表已存在）
            await queryRunner.query(
                `ALTER TABLE "buildingai_xhs_creator"."xhs_config" 
                 ADD COLUMN IF NOT EXISTS "outline_power" integer NOT NULL DEFAULT 10`,
            );
            await queryRunner.query(
                `COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_config"."outline_power" IS '大纲生成每次消耗积分'`,
            );
            await queryRunner.query(
                `ALTER TABLE "buildingai_xhs_creator"."xhs_config" 
                 ADD COLUMN IF NOT EXISTS "free_usage_limit" integer NOT NULL DEFAULT 5`,
            );
            await queryRunner.query(
                `COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_config"."free_usage_limit" IS '每用户免费使用总次数（大纲和图片生成共用）'`,
            );
            await queryRunner.query(
                `COMMENT ON TABLE "buildingai_xhs_creator"."xhs_config" IS '小红书图文生成计费配置'`,
            );
            this.logSuccess("创建 xhs_config 表成功");

            // 初始化默认配置
            await queryRunner.query(
                `INSERT INTO "buildingai_xhs_creator"."xhs_config"
                    ("plugin_name", "bind_key_config_id", "text_key_config_id", "image_key_config_id", "cover_image_power", "content_image_power", "text_model", "text_model_id", "image_model", "image_model_id", "image_endpoint_type", "image_endpoint_url", "high_concurrency", "outline_power", "free_usage_limit")
                 VALUES ('小红书图文生成', '', '', '', 80, 40, 'gpt-4o-mini', NULL, 'gpt-image-1', NULL, 'images', NULL, false, 10, 5)
                 ON CONFLICT DO NOTHING`,
            );
            this.logSuccess("创建 xhs_config 表成功");

            // 创建 xhs_user_usage 表（用户免费次数统计）
            await queryRunner.query(
                `CREATE TABLE IF NOT EXISTS "buildingai_xhs_creator"."xhs_user_usage" (
                    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                    "user_id" character varying(255) NOT NULL,
                    "free_usage_count" integer NOT NULL DEFAULT 0,
                    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                    CONSTRAINT "PK_xhs_user_usage" PRIMARY KEY ("id"),
                    CONSTRAINT "UQ_xhs_user_usage_user_id" UNIQUE ("user_id")
                );
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_user_usage"."user_id" IS '用户ID';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_user_usage"."free_usage_count" IS '已使用免费次数';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_user_usage"."created_at" IS '创建时间';
                COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_user_usage"."updated_at" IS '更新时间'`,
            );
            await queryRunner.query(
                `COMMENT ON TABLE "buildingai_xhs_creator"."xhs_user_usage" IS '小红书用户使用统计'`,
            );
            await queryRunner.query(
                `CREATE INDEX IF NOT EXISTS "idx_xhs_user_usage_user_id" 
                ON "buildingai_xhs_creator"."xhs_user_usage"("user_id")`,
            );
            this.logSuccess("创建 xhs_user_usage 表成功");

            await queryRunner.commitTransaction();
            this.logSuccess("buildingai-xhs-creator 插件所有表创建成功");
        } catch (error: any) {
            await queryRunner.rollbackTransaction();
            this.logError(`创建表失败: ${error?.message ?? error}`);
            throw error;
        } finally {
            await queryRunner.release();
        }
    }
}
