import { DataSource } from "@buildingai/db/typeorm";
import { Logger } from "@nestjs/common";

/**
 * Extension upgrade script for version 1.0.1
 *
 * 自动检测并添加图片积分计费字段
 */
export class Upgrade {
    private readonly logger = new Logger(Upgrade.name);

    constructor(private readonly dataSource: DataSource) {}

    /**
     * Execute upgrade logic
     */
    async execute(): Promise<void> {
        this.logger.log("🔄 开始升级到版本 1.0.1 - 添加积分计费字段");

        try {
            // 检测并添加积分计费字段
            await this.addBillingFields();

            this.logger.log("✅ 升级到版本 1.0.1 完成");
        } catch (error) {
            this.logger.error(`❌ 升级失败: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * 检测并添加积分计费字段到 xhs_creator_images 表
     */
    private async addBillingFields(): Promise<void> {
        this.logger.log("检查 xhs_creator_images 表字段...");

        const tableName = "xhs_creator_images";
        const schemaName = "buildingai_xhs_creator";

        // 检查需要添加的字段
        const fieldsToAdd = [
            {
                name: "power_deducted",
                type: "boolean",
                default: "false",
                comment: "是否已扣减积分",
            },
            {
                name: "power_amount",
                type: "integer",
                default: "0",
                comment: "扣减的积分数量",
            },
            {
                name: "billing_account_no",
                type: "varchar",
                nullable: true,
                comment: "关联的账单记录号（用于追溯）",
            },
        ];

        for (const field of fieldsToAdd) {
            const exists = await this.checkColumnExists(schemaName, tableName, field.name);

            if (!exists) {
                this.logger.log(`  添加字段: ${field.name}...`);
                await this.addColumn(schemaName, tableName, field);
                this.logger.log(`  ✓ 字段 ${field.name} 添加成功`);
            } else {
                this.logger.log(`  ⊙ 字段 ${field.name} 已存在，跳过`);
            }
        }

        this.logger.log("✅ 积分计费字段检查完成");
    }

    /**
     * 检查列是否存在
     */
    private async checkColumnExists(
        schemaName: string,
        tableName: string,
        columnName: string,
    ): Promise<boolean> {
        const result = await this.dataSource.query(
            `SELECT column_name 
             FROM information_schema.columns 
             WHERE table_schema = $1 
               AND table_name = $2 
               AND column_name = $3`,
            [schemaName, tableName, columnName],
        );

        return result.length > 0;
    }

    /**
     * 添加列到表
     */
    private async addColumn(
        schemaName: string,
        tableName: string,
        field: {
            name: string;
            type: string;
            default?: string;
            nullable?: boolean;
            comment: string;
        },
    ): Promise<void> {
        const fullTableName = `"${schemaName}"."${tableName}"`;

        // 构建 ALTER TABLE 语句
        let alterSQL = `ALTER TABLE ${fullTableName} ADD COLUMN "${field.name}" ${field.type}`;

        // 添加 NOT NULL 约束（如果不是可空字段）
        if (!field.nullable) {
            alterSQL += " NOT NULL";
        }

        // 添加默认值
        if (field.default !== undefined) {
            alterSQL += ` DEFAULT ${field.default}`;
        }

        // 执行添加列
        await this.dataSource.query(alterSQL);

        // 添加注释
        await this.dataSource.query(
            `COMMENT ON COLUMN ${fullTableName}."${field.name}" IS '${field.comment}'`,
        );
    }
}
