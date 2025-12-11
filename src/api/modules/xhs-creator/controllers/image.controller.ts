import { ExtensionWebController } from "@buildingai/core/decorators";
import { Body, Post, Sse, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import type { Subscription } from "rxjs";
import { Observable } from "rxjs";
import { ImageService } from "../services";
import { GenerateImagesDto, RegenerateImageDto } from "../dto";

/**
 * 图片生成控制器
 */
@ExtensionWebController("images")
export class ImageController {
    constructor(private readonly imageService: ImageService) {}

    /**
     * 批量生成图片（SSE流式返回）
     */
    @Sse("generate")
    generateImages(@Body() dto: GenerateImagesDto): Observable<any> {
        return this.imageService.generateImages(
            dto.taskId,
            dto.pages,
            dto.fullOutline,
            dto.isRegenerate,
        );
    }

    /**
     * 批量生成图片（POST + SSE 文本流）
     * 兼容 RedInk 的实现方式，避免超长 URL 问题
     */
    @Post("generate")
    generateImagesStream(
        @Body() dto: GenerateImagesDto,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders?.();

        const observable = this.imageService.generateImages(
            dto.taskId,
            dto.pages,
            dto.fullOutline,
            dto.isRegenerate,
        );

        const subscription: Subscription = observable.subscribe({
            next: (event) => {
                try {
                    const dataStr = typeof event.data === "string" ? event.data : "";
                    let eventType = "message";
                    try {
                        const parsed = JSON.parse(dataStr);
                        if (parsed?.type) {
                            eventType = parsed.type;
                        }
                    } catch {
                        // ignore JSON parse error, fallback to default event type
                    }

                    res.write(`event: ${eventType}\n`);
                    res.write(`data: ${dataStr}\n\n`);
                } catch {
                    // 单条事件写入失败时，忽略该事件，继续后续
                }
            },
            error: (error: Error) => {
                const payload = {
                    type: "error",
                    message: error.message,
                };
                res.write(`event: error\n`);
                res.write(`data: ${JSON.stringify(payload)}\n\n`);
                res.end();
            },
            complete: () => {
                res.end();
            },
        });

        // 客户端关闭连接时，取消订阅
        req.on("close", () => {
            subscription.unsubscribe();
            if (!res.writableEnded) {
                res.end();
            }
        });
    }

    /**
     * 重新生成单张图片（流式SSE响应）
     */
    @Post("regenerate")
    regenerateImageStream(
        @Body() dto: RegenerateImageDto,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders?.();

        const observable = this.imageService.regenerateImageStream(
            dto.taskId,
            dto.pageIndex,
            dto.prompt,
        );

        const subscription: Subscription = observable.subscribe({
            next: (event) => {
                try {
                    const dataStr = typeof event.data === "string" ? event.data : "";
                    let eventType = "message";
                    try {
                        const parsed = JSON.parse(dataStr);
                        if (parsed?.type) {
                            eventType = parsed.type;
                        }
                    } catch {
                        // ignore JSON parse error
                    }

                    res.write(`event: ${eventType}\n`);
                    res.write(`data: ${dataStr}\n\n`);
                } catch {
                    // 单条事件写入失败时，忽略该事件，继续后续
                }
            },
            error: (error: Error) => {
                const payload = {
                    type: "error",
                    message: error.message,
                };
                res.write(`event: error\n`);
                res.write(`data: ${JSON.stringify(payload)}\n\n`);
                res.end();
            },
            complete: () => {
                res.end();
            },
        });

        // 客户端关闭连接时，取消订阅
        req.on("close", () => {
            subscription.unsubscribe();
            if (!res.writableEnded) {
                res.end();
            }
        });
    }

    /**
     * 获取图片的所有历史版本
     */
    @Post("versions/list")
    async getImageVersions(@Body() dto: { taskId: string; pageIndex: number }) {
        const versions = await this.imageService.getImageVersions(dto.taskId, dto.pageIndex);
        return {
            success: true,
            versions: versions.map((v) => ({
                version: v.version,
                imageUrl: v.imageUrl,
                prompt: v.prompt,
                generatedBy: v.generatedBy,
                powerAmount: v.powerAmount,
                isCurrent: v.isCurrent,
                createdAt: v.createdAt,
            })),
        };
    }

    /**
     * 获取特定版本的图片
     */
    @Post("versions/get")
    async getImageVersion(
        @Body() dto: { taskId: string; pageIndex: number; version: number },
    ) {
        const version = await this.imageService.getImageVersion(
            dto.taskId,
            dto.pageIndex,
            dto.version,
        );
        if (!version) {
            return {
                success: false,
                message: `版本 v${dto.version} 不存在`,
            };
        }
        return {
            success: true,
            version: {
                version: version.version,
                imageUrl: version.imageUrl,
                prompt: version.prompt,
                generatedBy: version.generatedBy,
                powerAmount: version.powerAmount,
                isCurrent: version.isCurrent,
                createdAt: version.createdAt,
            },
        };
    }

    /**
     * 恢复到指定版本
     */
    @Post("versions/restore")
    async restoreImageVersion(
        @Body() dto: { taskId: string; pageIndex: number; version: number },
    ) {
        try {
            const imageUrl = await this.imageService.restoreImageVersion(
                dto.taskId,
                dto.pageIndex,
                dto.version,
            );
            return {
                success: true,
                imageUrl,
                message: `已切换到版本 v${dto.version}`,
            };
        } catch (error) {
            return {
                success: false,
                message: error.message || "恢复失败",
            };
        }
    }
}
