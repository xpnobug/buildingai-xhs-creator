<script setup lang="ts">
import { computed, ref, watch } from "vue";

import type { Page, XhsTask } from "~/models";
import { taskApi, imageApi } from "~/services/xhs/api";
import VersionComparisonModal from "./VersionComparisonModal.vue";
import ImagePreviewModal from "../common/ImagePreviewModal.vue";
import PublishToXhsModal from "./PublishToXhsModal.vue";

interface Props {
    taskId: string | null;
    open: boolean;
}

interface Emits {
    (e: "update:open", value: boolean): void;
    (e: "close"): void;
}

// 扩展的 Page 类型，包含图片信息
interface PageWithImage extends Page {
    imageUrl?: string;
    status?: string;
    errorMessage?: string;
    currentVersion?: number;
    versionCount?: number;  // 版本历史记录数量
}

// 扩展的 XhsTask 类型，pages 包含图片信息
interface XhsTaskWithImages extends Omit<XhsTask, "pages"> {
    pages?: PageWithImage[];
}

// 版本信息接口
interface ImageVersion {
    version: number;
    imageUrl: string;
    prompt: string;
    generatedBy: string;
    powerAmount: number;
    isCurrent: boolean;
    createdAt: string;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const isLoading = ref(false);
const task = ref<XhsTaskWithImages | null>(null);
const isOutlineVisible = ref(false);

// 版本管理状态
// 版本对比弹窗状态
const showVersionModal = ref(false);
const versionModalPage = ref<{ index: number; label: string } | null>(null);

// 发布到小红书弹窗状态
const showPublishModal = ref(false);

const isModalOpen = computed({
    get: () => props.open,
    set: (value) => emit("update:open", value),
});

// 当弹窗显示且有taskId时获取任务详情
watch(
    () => [props.open, props.taskId],
    async ([visible, taskId]) => {
        if (visible && taskId) {
            await fetchTaskDetail();
        } else {
            task.value = null;
            isOutlineVisible.value = false;
        }
    },
    { immediate: true },
);

// 获取任务详情
const fetchTaskDetail = async () => {
    if (!props.taskId) return;

    try {
        isLoading.value = true;
        const response = await taskApi.getTask(props.taskId);
        if (response.task) {
            task.value = response.task;

            // 加载图片
            const imagesResponse = await taskApi.getTaskImages(props.taskId);
            if (imagesResponse.images && task.value.pages) {
                // 将图片信息合并到pages中
                const pagesWithImages = await Promise.all(
                    task.value.pages.map(async (page: Page): Promise<PageWithImage> => {
                        const image = imagesResponse.images.find(
                            (img: any) => img.pageIndex === page.index,
                        );
                        
                        // 获取版本历史数量
                        let versionCount = 1;
                        try {
                            const versionsRes = await imageApi.getImageVersions(props.taskId!, page.index);
                            versionCount = versionsRes.versions?.length || 1;
                        } catch {
                            // 忽略错误，默认1个版本
                        }
                        
                        return {
                            ...page,
                            imageUrl: image?.imageUrl,
                            status: image?.status || "pending",
                            errorMessage: image?.errorMessage,
                            currentVersion: image?.currentVersion || 1,
                            versionCount,
                        };
                    })
                );
                task.value.pages = pagesWithImages;
            }
        }
    } catch (error) {
        console.error("获取任务详情失败:", error);
    } finally {
        isLoading.value = false;
    }
};

// 关闭弹窗
const closeModal = () => {
    isModalOpen.value = false;
    emit("close");
};

const toggleOutline = () => {
    if (!task.value?.outline) return;
    isOutlineVisible.value = !isOutlineVisible.value;
};

// 格式化日期时间
const formatDateTime = (value?: string) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate(),
    ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
        date.getMinutes(),
    ).padStart(2, "0")}`;
};

// 获取状态文本
const getStatusText = (status?: string) => {
    const map: Record<string, string> = {
        completed: "已完成",
        failed: "失败",
        generating: "生成中",
        pending: "等待中",
    };
    return map[status || "pending"] || status || "等待中";
};

// 页面类型标签
const getPageTypeLabel = (type: Page["type"]) => {
    const map: Record<Page["type"], string> = {
        cover: "封面",
        content: "内容",
        summary: "总结",
    };
    return map[type] || "内容";
};

const message = useMessage();
// 使用Set跟踪正在下载的图片URL，而不是全局状态
const downloadingImages = ref<Set<string>>(new Set());

// 检查某个图片是否正在下载
const isImageDownloading = (url: string) => downloadingImages.value.has(url);

// 下载图片
const downloadImage = async (url: string, filename: string) => {
    if (!url || downloadingImages.value.has(url)) return;
    
    try {
        downloadingImages.value.add(url);
        
        // 使用fetch下载图片，避免跨域问题
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`下载失败: ${response.status}`);
        }
        
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // 清理blob URL
        URL.revokeObjectURL(blobUrl);
        
        message.success("下载成功");
    } catch (error) {
        console.error("下载图片失败:", error);
        message.error("下载失败,请稍后重试");
    } finally {
        downloadingImages.value.delete(url);
    }
};

// 打包下载所有图片（调用后端 ZIP 接口，与 RedInk 一致）
const isDownloadingZip = ref(false);

const downloadAll = async () => {
    if (!task.value?.id) return;
    
    try {
        isDownloadingZip.value = true;
        message.info("正在打包下载,请稍候...");
        
        const blob = await taskApi.downloadTaskZip(task.value.id);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const title = task.value.topic || "images";
        link.href = url;
        link.download = `${title}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        message.success("打包下载成功");
    } catch (error) {
        console.error("打包下载失败:", error);
        message.error("打包下载失败,请稍后重试");
    } finally {
        isDownloadingZip.value = false;
    }
};

// 查看图片状态
const previewImage = ref<{ url: string; alt: string } | null>(null);
const showImagePreview = ref(false);

const viewImage = (url?: string, pageIndex?: number) => {
    if (!url) return;
    previewImage.value = {
        url,
        alt: pageIndex !== undefined ? `Page ${pageIndex + 1}` : "图片预览",
    };
    showImagePreview.value = true;
};

// 打开版本对比弹窗
const openVersionModal = (pageIndex: number, pageLabel: string) => {
    versionModalPage.value = { index: pageIndex, label: pageLabel };
    showVersionModal.value = true;
};

// 版本切换后刷新
const handleVersionSwitched = async () => {
    await fetchTaskDetail();
};

// 键盘事件处理（ESC关闭弹窗）
const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && props.open) {
        closeModal();
    }
};

// 监听键盘事件
watch(
    () => props.open,
    (visible) => {
        if (visible) {
            document.addEventListener("keydown", handleKeydown);
        } else {
            document.removeEventListener("keydown", handleKeydown);
        }
    },
);
</script>

<template>
    <!-- 弹窗遮罩 -->
    <div
        v-if="isModalOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        @click.self="closeModal"
    >
        <!-- 弹窗内容 -->
        <div
            class="relative mx-4 max-h-[90vh] w-full max-w-6xl overflow-auto rounded-2xl bg-background shadow-2xl"
        >
            <!-- 关闭按钮 -->
            <button
                @click="closeModal"
                class="absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-white backdrop-blur-sm transition-all hover:bg-black/40"
            >
                <UIcon name="i-lucide-x" class="h-5 w-5" />
            </button>

            <!-- 加载状态 -->
            <div v-if="isLoading" class="flex h-96 items-center justify-center">
                <div
                    class="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
                ></div>
            </div>

            <!-- 任务详情内容：小红书风格图片预览 -->
            <div v-else-if="task" class="p-6">
                <!-- 顶部标题栏 -->
                <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h2 class="mb-2 text-2xl font-bold text-foreground">
                            {{ task.topic || "未命名任务" }}
                        </h2>
                        <div class="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            <span>
                                {{ (task.pages || []).length || 0 }} 张图片 ·
                                {{ formatDateTime(task.createdAt) }}
                            </span>
                            <span>状态：{{ getStatusText(task.status) }}</span>
                        </div>
                    </div>
                <div class="flex items-center gap-3 mr-10">
                        <button
                            v-if="task.outline"
                            type="button"
                            class="text-sm font-medium text-primary hover:text-primary/80"
                            @click="toggleOutline"
                        >
                            {{ isOutlineVisible ? "收起大纲" : "查看大纲" }}
                        </button>
                        <button
                            type="button"
                            @click="showPublishModal = true"
                            class="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#ff2442] to-[#ff6b81] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md"
                        >
                            <UIcon name="i-lucide-share-2" class="h-4 w-4" />
                            发布到小红书
                        </button>
                        <button
                            type="button"
                            @click="downloadAll"
                            :disabled="isDownloadingZip"
                            class="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <UIcon 
                                :name="isDownloadingZip ? 'i-lucide-loader-2' : 'i-lucide-download'" 
                                class="h-4 w-4" 
                                :class="{ 'animate-spin': isDownloadingZip }"
                            />
                            {{ isDownloadingZip ? "打包中..." : "打包下载" }}
                        </button>
                    </div>
                </div>

                <!-- 完整大纲（参照示例布局，可折叠） -->
                <div
                    v-if="isOutlineVisible && task.pages && task.pages.length > 0"
                    class="mb-6"
                >
                    <h3 class="mb-4 text-lg font-semibold text-foreground">完整大纲</h3>
                    <div class="space-y-4">
                        <div
                            v-for="(page, index) in task.pages"
                            :key="page.index"
                            class="rounded-2xl bg-card shadow-sm ring-1 ring-border/40"
                        >
                            <!-- 卡片头部：P 标 + 页面类型 + 字数 -->
                            <div
                                class="flex items-center justify-between gap-2 rounded-t-2xl px-5 pt-4 pb-2"
                            >
                                <div class="flex items-center gap-2">
                                    <span
                                        class="inline-flex min-w-[40px] justify-center rounded-full bg-[#ff2442] px-3 py-0.5 text-xs font-semibold text-white"
                                    >
                                        P{{ index + 1 }}
                                    </span>
                                    <span
                                        class="inline-flex items-center rounded-full bg-pink-100 px-3 py-0.5 text-xs font-medium text-pink-700"
                                    >
                                        {{ getPageTypeLabel(page.type) }}
                                    </span>
                                </div>
                                <span class="text-xs text-muted-foreground">
                                    {{ (page.content || "").length }} 字
                                </span>
                            </div>

                            <!-- 卡片正文：页面内容 -->
                            <div class="px-5 pb-4 pt-1">
                                <p
                                    class="whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground"
                                >
                                    {{ page.content }}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 图片列表：参照示例布局 -->
                <div v-if="task.pages && task.pages.length > 0" class="mb-2">
                    <div class="grid gap-5 md:grid-cols-3 xl:grid-cols-4">
                        <div
                            v-for="(page, index) in task.pages"
                            :key="page.index"
                            class="flex flex-col rounded-2xl bg-card shadow-sm ring-1 ring-border/40"
                        >
                            <!-- 图片预览 -->
                            <div 
                                class="group relative aspect-[3/4] cursor-pointer overflow-hidden rounded-t-2xl bg-muted"
                                @click="viewImage(page.imageUrl, index)"
                            >
                                <img
                                    v-if="page.imageUrl"
                                    :src="page.imageUrl"
                                    :alt="`第 ${index + 1} 页`"
                                    class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                />
                                <div
                                    v-else
                                    class="flex h-full w-full items-center justify-center"
                                >
                                    <UIcon
                                        :name="page.status === 'failed' ? 'i-lucide-alert-circle' : 'i-lucide-clock'"
                                        class="h-10 w-10 text-muted-foreground"
                                    />
                                </div>

                                <!-- 悬浮层：点击查看大图 -->
                                <div
                                    v-if="page.imageUrl"
                                    class="absolute inset-0 flex items-center justify-center bg-black/0 transition-all duration-300 group-hover:bg-black/40"
                                >
                                    <span class="flex items-center gap-2 text-sm font-medium text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                                        <UIcon name="i-lucide-maximize-2" class="h-5 w-5" />
                                        查看大图
                                    </span>
                                </div>

                                <!-- 左下角 Page 标签 -->
                                <div
                                    class="absolute bottom-2 left-2 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white"
                                >
                                    Page {{ index + 1 }}
                                </div>
                            </div>

                            <!-- 底部操作区：版本号、版本历史、下载 -->
                            <div class="flex items-center justify-between border-t border-border/40 px-4 py-2">
                                <div class="flex items-center gap-2">
                                    <span class="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                                        <UIcon name="i-lucide-layers" class="h-3.5 w-3.5" />
                                        v{{ page.currentVersion ?? 1 }}
                                    </span>
                                    <button
                                        v-if="(page.versionCount ?? 1) > 1"
                                        type="button"
                                        class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                                        @click="openVersionModal(page.index, `Page ${index + 1}`)"
                                    >
                                        <UIcon name="i-lucide-history" class="h-3.5 w-3.5" />
                                        版本历史
                                    </button>
                                </div>
                                <button
                                    v-if="page.imageUrl"
                                    class="rounded-full border border-border/70 p-2 text-xs text-muted-foreground hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="下载"
                                    :disabled="isImageDownloading(page.imageUrl)"
                                    @click="
                                        page.imageUrl &&
                                            downloadImage(page.imageUrl, `page-${index + 1}.png`)
                                    "
                                >
                                    <UIcon 
                                        :name="isImageDownloading(page.imageUrl) ? 'i-lucide-loader-2' : 'i-lucide-download'" 
                                        class="h-4 w-4" 
                                        :class="{ 'animate-spin': isImageDownloading(page.imageUrl) }"
                                    />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 空状态 -->
                <div v-else class="flex flex-col items-center justify-center py-16 text-center">
                    <UIcon name="i-lucide-inbox" class="mb-4 h-16 w-16 text-muted-foreground" />
                    <p class="text-lg font-medium text-foreground">暂无图片</p>
                </div>
            </div>

            <!-- 错误状态 -->
            <div v-else class="flex h-96 flex-col items-center justify-center text-center">
                <UIcon name="i-lucide-alert-circle" class="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 class="mb-2 text-lg font-medium text-foreground">加载失败</h3>
                <p class="text-sm text-muted-foreground">无法获取任务详情，请稍后重试</p>
            </div>
        </div>
        <!-- 版本对比弹窗 -->
        <VersionComparisonModal
            v-model:open="showVersionModal"
            :task-id="task?.id || null"
            :page-index="versionModalPage?.index ?? null"
            :page-label="versionModalPage?.label"
            @version-switched="handleVersionSwitched"
        />
        
        <!-- 图片预览弹窗 -->
        <ImagePreviewModal
            v-model:open="showImagePreview"
            :src="previewImage?.url || null"
            :alt="previewImage?.alt"
        />
        
        <!-- 发布到小红书弹窗 -->
        <PublishToXhsModal
            v-model:open="showPublishModal"
            :topic="task?.topic || ''"
            :pages="task?.pages || []"
        />
    </div>
</template>

<style scoped>
.line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
</style>

