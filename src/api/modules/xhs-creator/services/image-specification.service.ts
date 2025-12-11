import { Injectable, Logger } from "@nestjs/common";

/**
 * 图片尺寸规格
 */
export interface ImageSizeSpec {
    id: string;
    name: string;
    /** 宽高比 (如 "1:1", "3:4", "16:9") */
    aspectRatio: string;
    /** 默认宽度 */
    width: number;
    /** 默认高度 */
    height: number;
    /** 描述 */
    description: string;
    /** 适用场景 */
    useCase: string[];
    /** 是否小红书推荐 */
    recommended: boolean;
}

/**
 * 图片风格预设
 */
export interface ImageStylePreset {
    id: string;
    name: string;
    /** 风格描述（用于 Prompt） */
    promptModifier: string;
    /** 颜色主题 */
    colorTheme: string[];
    /** 预览缩略图 */
    thumbnailUrl?: string;
    /** 适用类型 */
    applicableTypes: ("cover" | "content" | "summary")[];
    /** 标签 */
    tags: string[];
}

/**
 * 图片规格服务
 * 
 * 管理：
 * - 多种图片尺寸规格
 * - 图片风格预设
 * - 小红书推荐配置
 */
@Injectable()
export class ImageSpecificationService {
    private readonly logger = new Logger(ImageSpecificationService.name);

    /**
     * 小红书推荐尺寸规格
     */
    private readonly sizeSpecs: ImageSizeSpec[] = [
        {
            id: "square",
            name: "正方形",
            aspectRatio: "1:1",
            width: 1080,
            height: 1080,
            description: "适合产品展示、美食、单图笔记",
            useCase: ["产品", "美食", "单图"],
            recommended: true,
        },
        {
            id: "portrait_34",
            name: "竖版 3:4",
            aspectRatio: "3:4",
            width: 1080,
            height: 1440,
            description: "适合人像、穿搭、全身照",
            useCase: ["人像", "穿搭", "OOTD"],
            recommended: true,
        },
        {
            id: "portrait_916",
            name: "竖版 9:16",
            aspectRatio: "9:16",
            width: 1080,
            height: 1920,
            description: "适合长图、攻略、信息图",
            useCase: ["攻略", "长图", "信息图"],
            recommended: true,
        },
        {
            id: "landscape_43",
            name: "横版 4:3",
            aspectRatio: "4:3",
            width: 1440,
            height: 1080,
            description: "适合风景、多人合照",
            useCase: ["风景", "合照", "旅行"],
            recommended: false,
        },
        {
            id: "landscape_169",
            name: "横版 16:9",
            aspectRatio: "16:9",
            width: 1920,
            height: 1080,
            description: "适合视频封面、宽幅场景",
            useCase: ["视频封面", "场景"],
            recommended: false,
        },
        {
            id: "xhs_cover",
            name: "小红书封面",
            aspectRatio: "3:4",
            width: 900,
            height: 1200,
            description: "小红书官方推荐封面尺寸",
            useCase: ["封面", "首图"],
            recommended: true,
        },
    ];

    /**
     * 风格预设库
     */
    private readonly stylePresets: ImageStylePreset[] = [
        {
            id: "modern_minimal",
            name: "现代简约",
            promptModifier: "minimalist design, clean lines, white space, modern aesthetic, subtle colors",
            colorTheme: ["#FFFFFF", "#000000", "#E0E0E0"],
            applicableTypes: ["cover", "content", "summary"],
            tags: ["简约", "现代", "高级"],
        },
        {
            id: "japanese_fresh",
            name: "日系小清新",
            promptModifier: "Japanese aesthetic, soft pastel colors, delicate illustrations, gentle mood, lots of white space",
            colorTheme: ["#F5E6D3", "#D4E5F7", "#E8F0D8"],
            applicableTypes: ["cover", "content"],
            tags: ["日系", "清新", "少女"],
        },
        {
            id: "chinese_style",
            name: "国潮风",
            promptModifier: "Chinese traditional style, red and gold colors, traditional patterns, cultural elements, bold design",
            colorTheme: ["#C41E3A", "#D4AF37", "#1C1C1C"],
            applicableTypes: ["cover", "content"],
            tags: ["国潮", "传统", "中国风"],
        },
        {
            id: "instagram_style",
            name: "Ins风",
            promptModifier: "Instagram aesthetic, high contrast, bright colors, trendy composition, lifestyle photography style",
            colorTheme: ["#FF6B6B", "#4ECDC4", "#FFE66D"],
            applicableTypes: ["cover", "content"],
            tags: ["时尚", "潮流", "社交"],
        },
        {
            id: "vintage_retro",
            name: "复古怀旧",
            promptModifier: "vintage aesthetic, warm sepia tones, film grain texture, nostalgic atmosphere, old photo effect",
            colorTheme: ["#D4A373", "#CCD5AE", "#FAEDCD"],
            applicableTypes: ["cover", "content", "summary"],
            tags: ["复古", "怀旧", "胶片"],
        },
        {
            id: "tech_future",
            name: "科技未来",
            promptModifier: "futuristic design, dark background, neon blue and purple, geometric shapes, tech aesthetic",
            colorTheme: ["#0D1B2A", "#00D4FF", "#7B2CBF"],
            applicableTypes: ["cover", "content"],
            tags: ["科技", "未来", "酷炫"],
        },
        {
            id: "cute_cartoon",
            name: "可爱卡通",
            promptModifier: "cute cartoon style, kawaii aesthetic, bright cheerful colors, adorable characters, playful design",
            colorTheme: ["#FFB5E8", "#B5FFFC", "#FFFEB5"],
            applicableTypes: ["cover", "content"],
            tags: ["可爱", "卡通", "萌系"],
        },
        {
            id: "magazine_cover",
            name: "杂志封面",
            promptModifier: "magazine cover layout, professional typography, editorial design, fashion magazine aesthetic",
            colorTheme: ["#000000", "#FFFFFF", "#FF0000"],
            applicableTypes: ["cover"],
            tags: ["杂志", "专业", "时尚"],
        },
    ];

    /**
     * 获取所有尺寸规格
     */
    getAllSizeSpecs(): ImageSizeSpec[] {
        return this.sizeSpecs;
    }

    /**
     * 获取推荐尺寸规格
     */
    getRecommendedSizeSpecs(): ImageSizeSpec[] {
        return this.sizeSpecs.filter((s) => s.recommended);
    }

    /**
     * 根据 ID 获取尺寸规格
     */
    getSizeSpecById(id: string): ImageSizeSpec | undefined {
        return this.sizeSpecs.find((s) => s.id === id);
    }

    /**
     * 根据使用场景推荐尺寸
     */
    recommendSizeByUseCase(useCase: string): ImageSizeSpec[] {
        return this.sizeSpecs.filter((s) =>
            s.useCase.some((u) => u.includes(useCase) || useCase.includes(u)),
        );
    }

    /**
     * 获取所有风格预设
     */
    getAllStylePresets(): ImageStylePreset[] {
        return this.stylePresets;
    }

    /**
     * 根据 ID 获取风格预设
     */
    getStylePresetById(id: string): ImageStylePreset | undefined {
        return this.stylePresets.find((s) => s.id === id);
    }

    /**
     * 根据页面类型获取适用风格
     */
    getStylesByPageType(pageType: "cover" | "content" | "summary"): ImageStylePreset[] {
        return this.stylePresets.filter((s) =>
            s.applicableTypes.includes(pageType),
        );
    }

    /**
     * 根据标签搜索风格
     */
    searchStylesByTag(tag: string): ImageStylePreset[] {
        return this.stylePresets.filter((s) =>
            s.tags.some((t) => t.includes(tag)),
        );
    }

    /**
     * 获取风格的 Prompt 修饰语
     */
    getStylePromptModifier(styleId: string): string {
        const preset = this.getStylePresetById(styleId);
        return preset?.promptModifier || "";
    }

    /**
     * 组合尺寸和风格生成完整 Prompt 后缀
     */
    buildSpecificationPrompt(sizeId: string, styleId: string): string {
        const size = this.getSizeSpecById(sizeId);
        const style = this.getStylePresetById(styleId);

        const parts: string[] = [];

        if (size) {
            parts.push(`Image size: ${size.width}x${size.height} pixels (${size.aspectRatio})`);
        }

        if (style) {
            parts.push(style.promptModifier);
        }

        return parts.join(". ");
    }
}
