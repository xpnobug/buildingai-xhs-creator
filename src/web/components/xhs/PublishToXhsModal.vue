<script setup lang="ts">
import { ref, computed } from "vue";

interface Props {
    open: boolean;
    topic: string;         // 标题/主题
    pages: Array<{
        index: number;
        type: "cover" | "content" | "summary";
        content: string;
        imageUrl?: string;
    }>;
}

interface Emits {
    (e: "update:open", value: boolean): void;
    (e: "close"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const message = useMessage();

const isModalOpen = computed({
    get: () => props.open,
    set: (value) => emit("update:open", value),
});

// 平台检测
const isMobile = computed(() => {
    if (typeof navigator === "undefined") return false;
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
});

const isAndroid = computed(() => {
    if (typeof navigator === "undefined") return false;
    return /Android/i.test(navigator.userAgent);
});

// 下载状态
const isDownloading = ref(false);
const downloadProgress = ref(0);
const copiedTitle = ref(false);
const copiedContent = ref(false);

// 格式化标题（小红书风格：添加表情）
const formattedTitle = computed(() => {
    const topic = props.topic || "未命名";
    // 添加适合小红书的表情
    return `✨ ${topic} | 超实用分享`;
});

// 格式化正文（小红书风格）
const formattedContent = computed(() => {
    const lines: string[] = [];
    
    props.pages.forEach((page, idx) => {
        const emoji = page.type === "cover" ? "📍" : page.type === "summary" ? "💡" : "✅";
        // 提取文字内容（去掉图片描述部分）
        let text = page.content || "";
        const textMatch = text.match(/文字[：:]\s*(.+?)(?=\n|图片描述|$)/s);
        if (textMatch && textMatch[1]) {
            text = textMatch[1].trim();
        }
        if (text) {
            lines.push(`${emoji} P${idx + 1}: ${text}`);
        }
    });
    
    lines.push("");
    lines.push("---");
    lines.push("🔗 内容由 AI 生成");
    lines.push("#小红书 #AI绘图 #图文分享");
    
    return lines.join("\n");
});

// 完整文案（标题 + 正文）
const fullText = computed(() => {
    return `${formattedTitle.value}\n\n${formattedContent.value}`;
});

// 复制标题
const copyTitle = async () => {
    try {
        await navigator.clipboard.writeText(formattedTitle.value);
        copiedTitle.value = true;
        message.success("标题已复制");
        setTimeout(() => {
            copiedTitle.value = false;
        }, 2000);
    } catch (error) {
        message.error("复制失败");
    }
};

// 复制正文
const copyContent = async () => {
    try {
        await navigator.clipboard.writeText(formattedContent.value);
        copiedContent.value = true;
        message.success("正文已复制");
        setTimeout(() => {
            copiedContent.value = false;
        }, 2000);
    } catch (error) {
        message.error("复制失败");
    }
};

// 复制全部
const copyAll = async () => {
    try {
        await navigator.clipboard.writeText(fullText.value);
        copiedTitle.value = true;
        copiedContent.value = true;
        message.success("文案已全部复制");
        setTimeout(() => {
            copiedTitle.value = false;
            copiedContent.value = false;
        }, 2000);
    } catch (error) {
        message.error("复制失败");
    }
};

// 下载所有图片
const downloadImages = async () => {
    const images = props.pages.filter(p => p.imageUrl);
    if (images.length === 0) {
        message.warning("没有可下载的图片");
        return;
    }
    
    isDownloading.value = true;
    downloadProgress.value = 0;
    
    try {
        for (let i = 0; i < images.length; i++) {
            const page = images[i];
            if (!page || !page.imageUrl) continue;
            
            const imageUrl = page.imageUrl;
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement("a");
            link.href = url;
            link.download = `小红书图片_${i + 1}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            downloadProgress.value = Math.round(((i + 1) / images.length) * 100);
            
            // 间隔下载，避免浏览器阻止
            if (i < images.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        message.success("全部图片下载完成");
    } catch (error) {
        console.error("下载失败:", error);
        message.error("部分图片下载失败");
    } finally {
        isDownloading.value = false;
        downloadProgress.value = 0;
    }
};

// 唤起小红书 App（直接打开发布页面）
const openXiaohongshu = () => {
    if (isMobile.value) {
        // 移动端：直接打开发布页面（而非首页）
        // iOS: xhsdiscover://post
        // Android: xhsdiscovery://post（注意多了个 y）
        const postScheme = isAndroid.value 
            ? "xhsdiscovery://post" 
            : "xhsdiscover://post";
        
        window.location.href = postScheme;
        
        // 2.5秒后检测是否跳转成功
        setTimeout(() => {
            // 如果还在当前页面，说明没有安装 App，尝试备用 scheme
            const fallbackScheme = isAndroid.value
                ? "xhsdiscovery://"
                : "xhsdiscover://";
            
            window.location.href = fallbackScheme;
            
            // 再等待后提示下载
            setTimeout(() => {
                const confirmed = confirm("未检测到小红书 App，是否前往下载？");
                if (confirmed) {
                    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
                    window.location.href = isIOS
                        ? "https://apps.apple.com/app/id741292507"
                        : "https://www.xiaohongshu.com/app";
                }
            }, 1500);
        }, 2500);
    } else {
        // PC 端：直接打开网页版创作中心的发布页面
        window.open("https://creator.xiaohongshu.com/publish/publish", "_blank");
    }
};

// 关闭弹窗
const closeModal = () => {
    isModalOpen.value = false;
    emit("close");
};
</script>

<template>
    <div
        v-if="isModalOpen"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
        @click.self="closeModal"
    >
        <div
            class="relative mx-4 w-full max-w-md overflow-hidden rounded-3xl bg-background shadow-2xl"
        >
            <!-- 头部 -->
            <div class="relative bg-gradient-to-r from-[#ff2442] to-[#ff6b81] px-6 py-5 text-white">
                <button
                    @click="closeModal"
                    class="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 transition-colors hover:bg-white/30"
                >
                    <UIcon name="i-lucide-x" class="h-5 w-5" />
                </button>
                <div class="flex items-center gap-3">
                    <div class="flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                        <UIcon name="i-lucide-share-2" class="h-6 w-6" />
                    </div>
                    <div>
                        <h2 class="text-xl font-bold">发布到小红书</h2>
                        <p class="text-sm text-white/80">一键复制文案，快速发布</p>
                    </div>
                </div>
            </div>

            <!-- 内容区 -->
            <div class="max-h-[60vh] overflow-y-auto px-6 py-5">
                <!-- 步骤提示 -->
                <div class="mb-5 rounded-xl bg-muted/50 p-4">
                    <h3 class="mb-2 text-sm font-semibold text-foreground">📋 发布步骤</h3>
                    <ol class="space-y-1 text-xs text-muted-foreground">
                        <li>1. 复制标题和正文</li>
                        <li>2. 下载全部图片到手机</li>
                        <li>3. 打开小红书 App，粘贴文案上传图片</li>
                    </ol>
                </div>

                <!-- 标题预览 -->
                <div class="mb-4">
                    <div class="mb-2 flex items-center justify-between">
                        <span class="text-sm font-medium text-foreground">标题</span>
                        <button
                            @click="copyTitle"
                            class="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors"
                            :class="copiedTitle ? 'bg-green-100 text-green-700' : 'bg-primary/10 text-primary hover:bg-primary/20'"
                        >
                            <UIcon :name="copiedTitle ? 'i-lucide-check' : 'i-lucide-copy'" class="h-3 w-3" />
                            {{ copiedTitle ? "已复制" : "复制" }}
                        </button>
                    </div>
                    <div class="rounded-lg bg-muted/30 p-3 text-sm text-foreground">
                        {{ formattedTitle }}
                    </div>
                </div>

                <!-- 正文预览 -->
                <div class="mb-4">
                    <div class="mb-2 flex items-center justify-between">
                        <span class="text-sm font-medium text-foreground">正文</span>
                        <button
                            @click="copyContent"
                            class="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors"
                            :class="copiedContent ? 'bg-green-100 text-green-700' : 'bg-primary/10 text-primary hover:bg-primary/20'"
                        >
                            <UIcon :name="copiedContent ? 'i-lucide-check' : 'i-lucide-copy'" class="h-3 w-3" />
                            {{ copiedContent ? "已复制" : "复制" }}
                        </button>
                    </div>
                    <div class="max-h-32 overflow-y-auto rounded-lg bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
                        {{ formattedContent }}
                    </div>
                </div>

                <!-- 图片统计 -->
                <div class="mb-4 flex items-center justify-between rounded-lg bg-muted/30 p-3">
                    <div class="flex items-center gap-2">
                        <UIcon name="i-lucide-images" class="h-5 w-5 text-muted-foreground" />
                        <span class="text-sm text-foreground">
                            {{ pages.filter(p => p.imageUrl).length }} 张图片
                        </span>
                    </div>
                    <button
                        @click="downloadImages"
                        :disabled="isDownloading"
                        class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                    >
                        <UIcon 
                            :name="isDownloading ? 'i-lucide-loader-2' : 'i-lucide-download'" 
                            class="h-3.5 w-3.5"
                            :class="{ 'animate-spin': isDownloading }"
                        />
                        {{ isDownloading ? `下载中 ${downloadProgress}%` : "下载全部" }}
                    </button>
                </div>
            </div>

            <!-- 底部操作区 -->
            <div class="border-t border-border/40 px-6 py-4">
                <div class="flex gap-3">
                    <button
                        @click="copyAll"
                        class="flex-1 rounded-full border border-primary py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                        <UIcon name="i-lucide-clipboard" class="mr-1.5 h-4 w-4 inline-block" />
                        复制全部文案
                    </button>
                    <button
                        @click="openXiaohongshu"
                        class="flex-1 rounded-full bg-gradient-to-r from-[#ff2442] to-[#ff6b81] py-3 text-sm font-medium text-white shadow-lg transition-all hover:shadow-xl"
                    >
                        <UIcon name="i-lucide-external-link" class="mr-1.5 h-4 w-4 inline-block" />
                        {{ isMobile ? "打开小红书发布" : "打开创作中心" }}
                    </button>
                </div>
                <p class="mt-3 text-center text-xs text-muted-foreground">
                    {{ isMobile ? "点击后将直接跳转到小红书发布页面" : "将在新窗口打开小红书创作中心发布页" }}
                </p>
            </div>
        </div>
    </div>
</template>
