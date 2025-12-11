import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { ImagePromptService } from "../services/image-prompt.service";

/**
 * ImagePromptService 单元测试
 */
describe("ImagePromptService", () => {
    let service: ImagePromptService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [ImagePromptService],
        }).compile();

        service = module.get<ImagePromptService>(ImagePromptService);
    });

    describe("buildImagePrompt", () => {
        it("应该正确构建封面页提示词", () => {
            const result = service.buildImagePrompt(
                "图片描述：一杯精致的咖啡",
                "cover",
                "咖啡制作指南大纲",
                "如何制作咖啡",
            );

            expect(result).toContain("封面");
            expect(result).toContain("一杯精致的咖啡");
        });

        it("应该正确构建内容页提示词", () => {
            const result = service.buildImagePrompt(
                "图片描述：咖啡豆研磨过程",
                "content",
            );

            expect(result).toContain("内容");
        });

        it("应该正确构建总结页提示词", () => {
            const result = service.buildImagePrompt(
                "图片描述：咖啡文化总结",
                "summary",
            );

            expect(result).toContain("总结");
        });
    });

    describe("extractImagePrompt", () => {
        it("应该正确提取图片描述", () => {
            const content = "标题：咖啡制作\n图片描述：精致咖啡杯\n其他内容";
            const result = service.extractImagePrompt(content);

            expect(result).toBe("精致咖啡杯");
        });

        it("没有图片描述时返回原始内容", () => {
            const content = "没有格式的内容";
            const result = service.extractImagePrompt(content);

            expect(result).toBe(content);
        });
    });
});
