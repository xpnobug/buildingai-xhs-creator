import { Logger } from "@nestjs/common";
import type { DataSource } from "@buildingai/db/typeorm";

/**
 * 版本 1.0.2 升级脚本
 * 新增图片版本管理功能
 */
export async function upgrade_1_0_2(dataSource: DataSource): Promise<void> {
    const logger = new Logger("XhsCreator-Upgrade-1.0.2");
    
    try {
        logger.log("开始执行 1.0.2 升级脚本：添加图片版本管理");

        // 1. 为 xhs_creator_images 表添加 current_version 字段
        await dataSource.query(`
            ALTER TABLE xhs_creator_images 
            ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1;
        `);
        logger.log("✓ 添加 current_version 字段");

        // 2. 为现有图片设置版本号为 1
        await dataSource.query(`
            UPDATE xhs_creator_images 
            SET current_version = 1 
            WHERE current_version IS NULL;
        `);
        logger.log("✓ 初始化现有图片版本号");

        // 3. 创建图片版本历史表
        await dataSource.query(`
            CREATE TABLE IF NOT EXISTS xhs_creator_image_history (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                image_id UUID NOT NULL,
                task_id UUID NOT NULL,
                page_index INTEGER NOT NULL,
                version INTEGER NOT NULL,
                image_url VARCHAR NOT NULL,
                prompt TEXT NOT NULL,
                generated_by VARCHAR(50) NOT NULL,
                power_amount INTEGER DEFAULT 0,
                is_current BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                CONSTRAINT fk_image_history_image 
                    FOREIGN KEY (image_id) 
                    REFERENCES xhs_creator_images(id) 
                    ON DELETE CASCADE,
                    
                CONSTRAINT fk_image_history_task 
                    FOREIGN KEY (task_id) 
                    REFERENCES xhs_creator_tasks(id) 
                    ON DELETE CASCADE
            );
        `);
        logger.log("✓ 创建图片版本历史表");

        // 4. 创建索引
        await dataSource.query(`
            CREATE INDEX IF NOT EXISTS idx_image_history_image_id 
            ON xhs_creator_image_history(image_id);
        `);
        
        await dataSource.query(`
            CREATE INDEX IF NOT EXISTS idx_image_history_task_page 
            ON xhs_creator_image_history(task_id, page_index);
        `);
        
        await dataSource.query(`
            CREATE INDEX IF NOT EXISTS idx_image_history_version 
            ON xhs_creator_image_history(task_id, page_index, version);
        `);
        logger.log("✓ 创建索引");

        // 5. 迁移现有图片数据到版本历史表（作为 v1）
        await dataSource.query(`
            INSERT INTO xhs_creator_image_history (
                image_id, task_id, page_index, version, 
                image_url, prompt, generated_by, power_amount, 
                is_current, created_at
            )
            SELECT 
                id, task_id, page_index, 1,
                image_url, prompt, 'initial', power_amount,
                TRUE, created_at
            FROM xhs_creator_images
            WHERE image_url IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM xhs_creator_image_history h
                WHERE h.image_id = xhs_creator_images.id
            );
        `);
        logger.log("✓ 迁移现有图片到版本历史表");

        logger.log("✅ 1.0.2 升级脚本执行完成");
    } catch (error) {
        logger.error(`❌ 1.0.2 升级脚本执行失败: ${error.message}`);
        throw error;
    }
}
