import { ExtensionWebController } from "@buildingai/core/decorators";
import { Get, Put, Body, Param, Query, Req, Res, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@buildingai/db/@nestjs/typeorm";
import { Repository } from "@buildingai/db/typeorm";
import AdmZip from "adm-zip";
import axios from "axios";
import type { Request, Response } from "express";
import { XhsTask } from "../../../db/entities/xhs-task.entity";
import { XhsImage } from "../../../db/entities/xhs-image.entity";

/**
 * 任务管理控制器
 */
@ExtensionWebController("tasks")
export class TaskController {
    constructor(
        @InjectRepository(XhsTask)
        private taskRepository: Repository<XhsTask>,
        @InjectRepository(XhsImage)
        private imageRepository: Repository<XhsImage>,
    ) {}

    /**
     * 获取任务列表
     */
    @Get()
    async getTasks(
        @Req() req: Request,
        @Query("page") page?: string,
        @Query("pageSize") pageSize?: string,
    ) {
        const pageNum = page ? parseInt(page, 10) : 1;
        const pageSizeNum = pageSize ? parseInt(pageSize, 10) : 12;
        const skip = (pageNum - 1) * pageSizeNum;

        // 只查询当前登录用户的任务
        const user: any = (req as any).user;
        const userId = user?.id;

        const findOptions: any = {
            order: { createdAt: "DESC" },
            skip,
            take: pageSizeNum,
        };

        if (userId) {
            findOptions.where = { userId };
        }

        const [tasks, total] = await this.taskRepository.findAndCount(findOptions);

        return {
            success: true,
            tasks,
            pagination: {
                page: pageNum,
                pageSize: pageSizeNum,
                total,
                totalPages: Math.ceil(total / pageSizeNum),
            },
        };
    }

    /**
     * 获取任务详情
     */
    @Get(":id")
    async getTask(@Param("id") id: string) {
        const task = await this.taskRepository.findOne({
            where: { id },
            relations: ["images"],
        });

        if (!task) {
            throw new Error("任务不存在");
        }

        return {
            success: true,
            task,
        };
    }

    /**
     * 更新任务大纲（仅保存，不触发重新生成）
     * 用于从历史编辑大纲后保存修改
     */
    @Put(":id/outline")
    async updateOutline(
        @Param("id") id: string,
        @Body() body: { pages: Array<{ index: number; type: "cover" | "content" | "summary"; content: string }> },
        @Req() req: Request,
    ) {
        const user: any = (req as any).user;
        const userId = user?.id;

        const task = await this.taskRepository.findOne({
            where: { id },
        });

        if (!task) {
            throw new BadRequestException("任务不存在");
        }

        // 验证任务所有权
        if (userId && task.userId !== userId) {
            throw new BadRequestException("无权修改该任务");
        }

        if (!body.pages || !Array.isArray(body.pages)) {
            throw new BadRequestException("pages 参数无效");
        }

        // 更新大纲页面
        task.pages = body.pages;
        task.totalPages = body.pages.length;
        
        // 重新生成大纲文本（从页面内容拼接）
        task.outline = body.pages.map((p, i) => {
            const typeLabel = p.type === "cover" ? "封面" : p.type === "summary" ? "总结" : "内容";
            return `【第${i + 1}页 - ${typeLabel}】\n${p.content}`;
        }).join("\n\n");
        
        await this.taskRepository.save(task);

        return {
            success: true,
            message: "大纲保存成功",
            task: {
                id: task.id,
                pages: task.pages,
                totalPages: task.totalPages,
            },
        };
    }

    /**
     * 获取任务的所有图片
     */
    @Get(":id/images")
    async getTaskImages(@Param("id") id: string) {
        const images = await this.imageRepository.find({
            where: { taskId: id },
            order: { pageIndex: "ASC" },
        });

        return {
            success: true,
            images,
        };
    }

    /**
     * 获取任务生成进度（用于 SSE 断线重连）
     * 返回当前任务状态和所有图片的生成状态
     */
    @Get(":id/progress")
    async getTaskProgress(@Param("id") id: string, @Req() req: Request) {
        const user: any = (req as any).user;
        const userId = user?.id;

        const task = await this.taskRepository.findOne({
            where: { id },
        });

        if (!task) {
            throw new Error("任务不存在");
        }

        // 验证任务所有权
        if (userId && task.userId !== userId) {
            throw new Error("无权访问该任务");
        }

        const images = await this.imageRepository.find({
            where: { taskId: id },
            order: { pageIndex: "ASC" },
        });

        // 统计完成进度
        const completedImages = images.filter((img) => img.status === "completed");
        const failedImages = images.filter((img) => img.status === "failed");
        const pendingImages = images.filter((img) => img.status === "pending" || img.status === "generating");

        return {
            success: true,
            progress: {
                taskId: id,
                status: task.status,
                totalPages: task.totalPages,
                generatedPages: task.generatedPages,
                completedCount: completedImages.length,
                failedCount: failedImages.length,
                pendingCount: pendingImages.length,
                coverImageUrl: task.coverImageUrl,
                errorMessage: task.errorMessage,
            },
            images: images.map((img) => ({
                pageIndex: img.pageIndex,
                pageType: img.pageType,
                status: img.status,
                imageUrl: img.imageUrl,
                errorMessage: img.errorMessage,
            })),
        };
    }

    /**
     * 打包下载任务的所有图片（ZIP）
     */
    @Get(":id/download-zip")
    async downloadTaskImagesZip(@Param("id") id: string, @Req() req: Request, @Res() res: Response) {
        const task = await this.taskRepository.findOne({ where: { id } });
        if (!task) {
            res.status(404).json({ success: false, error: "任务不存在" });
            return;
        }

        const images = await this.imageRepository.find({
            where: { taskId: id },
            order: { pageIndex: "ASC" },
        });

        const validImages = images.filter((img) => !!img.imageUrl);
        if (validImages.length === 0) {
            res.status(404).json({ success: false, error: "该任务暂无可下载的图片" });
            return;
        }

        const zip = new AdmZip();

        try {
            // 依次下载图片并写入 ZIP（参照 RedInk 思路，但使用 URL 源）
            for (const image of validImages) {
                const rawUrl = image.imageUrl!;

                // 支持相对路径和绝对 URL
                const isAbsolute = /^https?:\/\//i.test(rawUrl);
                const url = isAbsolute
                    ? rawUrl
                    : `${req.protocol}://${req.get("host")}${
                          rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`
                      }`;

                try {
                    const response = await axios.get<ArrayBuffer>(url, {
                        responseType: "arraybuffer",
                    });
                    const buffer = Buffer.from(response.data);
                    const index = image.pageIndex ?? 0;
                    const fileName = `page_${index + 1}.png`;
                    zip.addFile(fileName, buffer);
                } catch (error) {
                    // 单张图片下载失败时记录日志并跳过，继续处理其他图片
                    // eslint-disable-next-line no-console
                    console.error("[XHS Creator] 下载图片失败，已跳过:", url, error);
                }
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                error: "打包图片时发生错误，请稍后重试",
            });
            return;
        }

        const zipBuffer = zip.toBuffer();

        if (!zipBuffer.length) {
            res.status(500).json({
                success: false,
                error: "没有成功打包任何图片",
            });
            return;
        }

        const rawTitle = task.topic || "images";
        const safeTitle = rawTitle.replace(/[<>:\"/\\|?*\x00-\x1F]/g, "").trim() || "images";
        const filename = `${safeTitle}.zip`;

        res.setHeader("Content-Type", "application/zip");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        );
        res.end(zipBuffer);
    }
}
