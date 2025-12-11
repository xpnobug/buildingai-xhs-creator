import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * 添加图片积分计费字段
 */
export class AddPowerFieldsToXhsImage20251204140251 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // 添加积分计费相关字段
        await queryRunner.query(`
            ALTER TABLE "buildingai_xhs_creator"."xhs_creator_images"
            ADD COLUMN IF NOT EXISTS "power_deducted" boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS "power_amount" integer NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS "billing_account_no" varchar NULL;
        `);

        // 添加字段注释
        await queryRunner.query(`
            COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_images"."power_deducted" IS '是否已扣减积分';
            COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_images"."power_amount" IS '扣减的积分数量';
            COMMENT ON COLUMN "buildingai_xhs_creator"."xhs_creator_images"."billing_account_no" IS '关联的账单记录号（用于追溯）';
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // 回滚：删除字段
        await queryRunner.query(`
            ALTER TABLE "buildingai_xhs_creator"."xhs_creator_images"
            DROP COLUMN IF EXISTS "power_deducted",
            DROP COLUMN IF EXISTS "power_amount",
            DROP COLUMN IF EXISTS "billing_account_no";
        `);
    }
}
