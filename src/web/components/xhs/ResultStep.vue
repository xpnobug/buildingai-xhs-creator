<script setup lang="ts">
import { ref } from "vue";

import AlertDialog from "../common/AlertDialog.vue";
import ImagePreviewModal from "../common/ImagePreviewModal.vue";
import { useXhsCreatorStore } from "~/stores/xhs-creator";
import { taskApi } from "~/services/xhs/api";

const emit = defineEmits<{
    (e: "restart"): void;
}>();

const store = useXhsCreatorStore();
const regeneratingIndex = ref<number | null>(null);
const message = useMessage();

// 错误弹窗状态
const showErrorDialog = ref(false);
const errorDialogMessage = ref("");

// 下载状态跟踪
const downloadingImages = ref<Set<string>>(new Set());
const isDownloadingZip = ref(false);

const isRegeneratingAll = computed(() => regeneratingIndex.value === -1);

const handleRegenerate = async (pageIndex: number) => {
    if (regeneratingIndex.value !== null) return;
    regeneratingIndex.value = pageIndex;
    try {
        await store.regenerateImage(pageIndex);
    } catch (error) {
        console.error("重新生成失败:", error);
        const errorMsg = error instanceof Error ? error.message : "重新生成失败，请重试";
        errorDialogMessage.value = errorMsg;
        showErrorDialog.value = true;
    } finally {
        regeneratingIndex.value = null;
    }
};

const handleRegenerateAll = async () => {
    if (regeneratingIndex.value !== null) return;
    regeneratingIndex.value = -1;
    try {
        await store.regenerateAllImages();
    } catch (error) {
        console.error("全部重新生成失败:", error);
        const errorMsg = error instanceof Error ? error.message : "全部重新生成失败，请重试";
        errorDialogMessage.value = errorMsg;
        showErrorDialog.value = true;
    } finally {
        regeneratingIndex.value = null;
    }
};

// 检查某个图片是否正在下载
const isImageDownloading = (url: string) => downloadingImages.value.has(url);

// 下载单张图片（使用fetch避免跨域问题）
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
        message.error("下载失败，请稍后重试");
    } finally {
        downloadingImages.value.delete(url);
    }
};

// 打包下载所有图片（调用后端 ZIP 接口）
const downloadAll = async () => {
    if (!store.taskId) {
        message.error("任务ID不存在");
        return;
    }
    
    try {
        isDownloadingZip.value = true;
        message.info("正在打包下载，请稍候...");
        
        const blob = await taskApi.downloadTaskZip(store.taskId);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const title = store.topic || "images";
        link.href = url;
        link.download = `${title}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        message.success("打包下载成功");
    } catch (error) {
        console.error("打包下载失败:", error);
        message.error("打包下载失败，请稍后重试");
    } finally {
        isDownloadingZip.value = false;
    }
};

const startOver = () => {
    store.reset();
    emit("restart");
};

// 图片预览状态
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
</script>

<template>
    <div class="rounded-[32px] border border-border/60 bg-card/80 p-6 shadow-sm lg:p-8">
        <header class="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
                <p class="text-xs font-semibold uppercase tracking-[0.3em] text-primary/80">
                    Result
                </p>
            </div>
            <div class="flex flex-wrap gap-3">
                <button
                    class="inline-flex items-center rounded-full border border-border/70 px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/5"
                    @click="startOver"
                >
                    再来一篇
                </button>
                <button
                    class="inline-flex items-center rounded-full border border-border/70 px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/5 disabled:opacity-50"
                    :disabled="isRegeneratingAll"
                    @click="handleRegenerateAll"
                >
                    全部重绘
                </button>
                <button
                    class="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    :disabled="isDownloadingZip"
                    @click="downloadAll"
                >
                    <UIcon 
                        :name="isDownloadingZip ? 'i-lucide-loader-2' : 'i-lucide-download'" 
                        class="h-4 w-4" 
                        :class="{ 'animate-spin': isDownloadingZip }"
                    />
                    {{ isDownloadingZip ? "打包中..." : "打包下载" }}
                </button>
            </div>
        </header>

        <section class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div v-if="store.pages.length === 0" class="col-span-full flex flex-col items-center justify-center py-12 text-muted-foreground">
                <UIcon name="i-lucide-image-off" class="mb-2 h-10 w-10 opacity-50" />
                <p>暂无生成结果</p>
                <button 
                    class="mt-4 text-sm text-primary hover:underline"
                    @click="emit('restart')"
                >
                    返回重新开始
                </button>
            </div>
            <article
                v-for="page in store.pages"
                :key="page.index"
                class="group flex flex-col rounded-3xl border border-border/60 bg-background/80 shadow-sm"
            >
                <div
                    v-if="page.imageUrl"
                    class="relative aspect-[3/4] overflow-hidden rounded-t-3xl cursor-pointer"
                    @click="viewImage(page.imageUrl, page.index)"
                >
                    <img
                        :src="page.imageUrl"
                        :alt="`第 ${page.index + 1} 页`"
                        class="h-full w-full object-cover"
                    />
                    <div
                        v-if="regeneratingIndex === page.index"
                        class="absolute inset-0 flex flex-col items-center justify-center bg-white/80 text-primary"
                    >
                        <UIcon name="i-lucide-loader-2" class="mb-2 h-5 w-5 animate-spin" />
                        重绘中...
                    </div>
                    <div
                        v-else
                        class="absolute inset-0 flex items-center justify-center bg-black/0 text-white transition group-hover:bg-black/40"
                    >
                        <span class="opacity-0 transition group-hover:opacity-100">预览大图</span>
                    </div>
                </div>
                <div
                    v-else
                    class="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-t-3xl bg-muted text-sm text-muted-foreground"
                >
                    <UIcon
                        :name="page.status === 'failed' ? 'i-lucide-alert-circle' : 'i-lucide-clock'"
                        class="h-6 w-6"
                    />
                    {{ page.status === "failed" ? page.errorMessage || "生成失败" : "等待中" }}
                </div>

                <div class="flex items-center justify-between border-t border-border/40 px-4 py-3 text-sm">
                    <div>
                        <div class="text-xs text-muted-foreground">Page {{ page.index + 1 }}</div>
                        <div class="font-semibold text-foreground">
                            {{ page.status === "completed" ? "已完成" : page.status === "failed" ? "失败" : "处理中" }}
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button
                            class="rounded-full border border-border/70 p-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                            title="重新生成"
                            :disabled="regeneratingIndex === page.index"
                            @click="handleRegenerate(page.index)"
                        >
                            <UIcon name="i-lucide-refresh-ccw" class="h-4 w-4" />
                        </button>
                        <button
                            v-if="page.imageUrl"
                            class="rounded-full border border-border/70 p-2 text-xs text-muted-foreground hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                            title="下载"
                            :disabled="isImageDownloading(page.imageUrl)"
                            @click="downloadImage(page.imageUrl, `page-${page.index + 1}.png`)"
                        >
                            <UIcon 
                                :name="isImageDownloading(page.imageUrl) ? 'i-lucide-loader-2' : 'i-lucide-download'" 
                                class="h-4 w-4" 
                                :class="{ 'animate-spin': isImageDownloading(page.imageUrl) }"
                            />
                        </button>
                    </div>
                </div>
            </article>
        </section>

        <!-- 错误提示弹窗 -->
        <AlertDialog
            :show="showErrorDialog"
            title="操作失败"
            :message="errorDialogMessage"
            type="error"
            @close="showErrorDialog = false"
        />
        
        <!-- 图片预览弹窗 -->
        <ImagePreviewModal
            v-model:open="showImagePreview"
            :src="previewImage?.url || null"
            :alt="previewImage?.alt"
        />
    </div>
</template>

