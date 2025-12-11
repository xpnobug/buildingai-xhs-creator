import { IsEnum, IsOptional, IsString, IsInt, Min, Max } from "class-validator";
import { Type } from "class-transformer";
import { TaskStatus } from "../../../db/entities/xhs-task.entity";

/**
 * 查询任务列表 DTO
 */
export class QueryTaskDto {
    /**
     * 页码
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    /**
     * 每页数量
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    pageSize?: number = 20;

    /**
     * 任务状态筛选
     */
    @IsOptional()
    @IsEnum(TaskStatus)
    status?: TaskStatus;

    /**
     * 用户ID筛选
     */
    @IsOptional()
    @IsString()
    userId?: string;

    /**
     * 主题关键词搜索
     */
    @IsOptional()
    @IsString()
    keyword?: string;

    /**
     * 开始时间（ISO 8601格式）
     */
    @IsOptional()
    @IsString()
    startDate?: string;

    /**
     * 结束时间（ISO 8601格式）
     */
    @IsOptional()
    @IsString()
    endDate?: string;
}

