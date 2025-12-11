import { BaseSeeder } from "@buildingai/db";
import { XhsCreatorInitialSeeder } from "./seeders/initial.seeder";

/**
 * 小红书图文生成器 - 种子入口
 *
 * 包含初始化数据库表的种子
 */
export async function getSeeders(): Promise<BaseSeeder[]> {
    return [
        new XhsCreatorInitialSeeder(),
    ];
}
