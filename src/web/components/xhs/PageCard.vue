<script setup lang="ts">
/**
 * 页面卡片组件
 * 用于展示任务详情中的单个页面信息
 */
import { computed } from "vue";

interface Props {
    pageIndex: number;
    pageType: "cover" | "content" | "summary";
    pageContent: string;
    imageUrl?: string;
    status?: string;
    currentVersion?: number;
    isDownloading?: boolean;
}

interface Emits {
    (e: "view-image", url: string, index: number): void;
    (e: "download", url: string, filename: string): void;
    (e: "view-versions", index: number, label: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

/** 页面类型显示标签 */
const pageTypeLabel = computed(() => {
    switch (props.pageType) {
        case "cover":
            return "封面";
        case "summary":
            return "总结";
        default:
            return `内容页 ${props.pageIndex}`;
    }
});

/** 页面类型对应的样式类 */
const typeClass = computed(() => {
    switch (props.pageType) {
        case "cover":
            return "bg-emerald-500/20 text-emerald-400";
        case "summary":
            return "bg-purple-500/20 text-purple-400";
        default:
            return "bg-blue-500/20 text-blue-400";
    }
});

/** 获取状态样式类 */
const statusClass = computed(() => {
    switch (props.status) {
        case "completed":
            return "text-green-400";
        case "failed":
            return "text-red-400";
        case "generating":
            return "text-yellow-400";
        default:
            return "text-muted-foreground";
    }
});

/** 处理图片查看 */
function handleViewImage() {
    if (props.imageUrl) {
        emit("view-image", props.imageUrl, props.pageIndex);
    }
}

/** 处理图片下载 */
function handleDownload() {
    if (props.imageUrl) {
        const filename = `page_${props.pageIndex}.png`;
        emit("download", props.imageUrl, filename);
    }
}

/** 处理版本查看 */
function handleViewVersions() {
    emit("view-versions", props.pageIndex, pageTypeLabel.value);
}
</script>

<template>
    <div class="group relative overflow-hidden rounded-xl bg-card/50 p-3 transition-all hover:bg-card/70">
        <!-- 页面类型标签 -->
        <div class="mb-2 flex items-center justify-between">
            <span :class="['inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', typeClass]">
                {{ pageTypeLabel }}
            </span>
            <span v-if="currentVersion" class="text-xs text-muted-foreground">
                v{{ currentVersion }}
            </span>
        </div>

        <!-- 图片预览 -->
        <div
            v-if="imageUrl"
            class="aspect-[3/4] cursor-pointer overflow-hidden rounded-lg bg-muted"
            @click="handleViewImage"
        >
            <img
                :src="imageUrl"
                :alt="pageTypeLabel"
                class="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
        </div>
        <div v-else class="flex aspect-[3/4] items-center justify-center rounded-lg bg-muted">
            <span :class="['text-sm', statusClass]">
                {{ status === "generating" ? "生成中..." : status === "failed" ? "生成失败" : "待生成" }}
            </span>
        </div>

        <!-- 操作按钮 -->
        <div v-if="imageUrl" class="mt-2 flex items-center gap-1">
            <button
                class="flex-1 rounded bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20"
                :disabled="isDownloading"
                @click="handleDownload"
            >
                {{ isDownloading ? "下载中..." : "下载" }}
            </button>
            <button
                class="flex-1 rounded bg-secondary/50 px-2 py-1 text-xs text-secondary-foreground hover:bg-secondary/70"
                @click="handleViewVersions"
            >
                版本
            </button>
        </div>
    </div>
</template>
