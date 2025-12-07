import { Logger } from "@nestjs/common";
import type { DataSource } from "@buildingai/db/typeorm";

/**
 * 版本 1.1.0 升级脚本
 * 新增积分消费控制与免费次数功能
 */
export async function upgrade_1_1_0(dataSource: DataSource): Promise<void> {
    const logger = new Logger("XhsCreator-Upgrade-1.1.0");
    
    try {
        logger.log("开始执行 1.1.0 升级脚本：添加积分消费控制与免费次数");

        // 1. 为 xhs_config 表添加 outline_power 字段（大纲生成积分消耗）
        await dataSource.query(`
            ALTER TABLE xhs_config 
            ADD COLUMN IF NOT EXISTS outline_power INTEGER NOT NULL DEFAULT 10;
        `);
        await dataSource.query(`
            COMMENT ON COLUMN xhs_config.outline_power IS '大纲生成每次消耗积分';
        `);
        logger.log("✓ 添加 outline_power 字段");

        // 2. 为 xhs_config 表添加 free_usage_limit 字段（免费使用次数）
        await dataSource.query(`
            ALTER TABLE xhs_config 
            ADD COLUMN IF NOT EXISTS free_usage_limit INTEGER NOT NULL DEFAULT 5;
        `);
        await dataSource.query(`
            COMMENT ON COLUMN xhs_config.free_usage_limit IS '每用户免费使用总次数（大纲和图片生成共用）';
        `);
        logger.log("✓ 添加 free_usage_limit 字段");

        // 3. 创建用户使用统计表
        await dataSource.query(`
            CREATE TABLE IF NOT EXISTS xhs_user_usage (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id VARCHAR(255) NOT NULL UNIQUE,
                free_usage_count INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await dataSource.query(`
            COMMENT ON TABLE xhs_user_usage IS '小红书用户使用统计';
        `);
        await dataSource.query(`
            COMMENT ON COLUMN xhs_user_usage.user_id IS '用户ID';
        `);
        await dataSource.query(`
            COMMENT ON COLUMN xhs_user_usage.free_usage_count IS '已使用免费次数';
        `);
        logger.log("✓ 创建 xhs_user_usage 表");

        // 4. 创建索引
        await dataSource.query(`
            CREATE INDEX IF NOT EXISTS idx_xhs_user_usage_user_id 
            ON xhs_user_usage(user_id);
        `);
        logger.log("✓ 创建索引");

        // 5. 更新现有配置记录，设置默认值
        await dataSource.query(`
            UPDATE xhs_config 
            SET outline_power = 10, free_usage_limit = 5
            WHERE outline_power IS NULL OR free_usage_limit IS NULL;
        `);
        logger.log("✓ 更新现有配置默认值");

        logger.log("✅ 1.1.0 升级脚本执行完成");
    } catch (error) {
        logger.error(`❌ 1.1.0 升级脚本执行失败: ${error.message}`);
        throw error;
    }
}
