<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { imageApi } from "~/services/xhs/api";
import ImagePreviewModal from "../common/ImagePreviewModal.vue";

interface ImageVersion {
    version: number;
    imageUrl: string;
    prompt: string;
    generatedBy: string;
    powerAmount: number;
    isCurrent: boolean;
    createdAt: string;
}

interface Props {
    open: boolean;
    taskId: string | null;
    pageIndex: number | null;
    pageLabel?: string;
}

interface Emits {
    (e: "update:open", value: boolean): void;
    (e: "version-switched"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const message = useMessage();
const versions = ref<ImageVersion[]>([]);
const isLoading = ref(false);
const selectedVersions = ref<number[]>([]);
const restoringVersion = ref<number | null>(null);

const isModalOpen = computed({
    get: () => props.open,
    set: (value) => emit("update:open", value),
});

// 监听弹窗打开，加载版本数据
watch(
    () => [props.open, props.taskId, props.pageIndex],
    async ([open, taskId, pageIndex]) => {
        if (open && taskId && pageIndex !== null) {
            await loadVersions();
        } else {
            // 重置状态
            versions.value = [];
            selectedVersions.value = [];
        }
    },
    { immediate: true },
);

// 加载版本列表
const loadVersions = async () => {
    if (!props.taskId || props.pageIndex === null) return;

    try {
        isLoading.value = true;
        const response = await imageApi.getImageVersions(props.taskId, props.pageIndex);
        if (response.success) {
            versions.value = response.versions;
            // 默认选择当前版本和前一个版本进行对比
            const currentVersion = versions.value.find((v) => v.isCurrent);
            if (currentVersion) {
                selectedVersions.value = [currentVersion.version];
                // 如果有其他版本，选择相邻的版本
                const otherVersions = versions.value.filter((v) => !v.isCurrent);
                if (otherVersions.length > 0 && otherVersions[0]) {
                    selectedVersions.value.push(otherVersions[0].version);
                }
            }
        }
    } catch (error) {
        console.error("加载版本失败:", error);
        message.error("加载版本失败");
    } finally {
        isLoading.value = false;
    }
};

// 切换版本选择
const toggleVersion = (version: number) => {
    const index = selectedVersions.value.indexOf(version);
    if (index > -1) {
        // 至少保留一个选中的版本
        if (selectedVersions.value.length > 1) {
            selectedVersions.value.splice(index, 1);
        }
    } else {
        // 最多选择3个版本进行对比
        if (selectedVersions.value.length < 3) {
            selectedVersions.value.push(version);
            // 按版本号排序
            selectedVersions.value.sort((a, b) => b - a);
        } else {
            message.warning("最多同时对比3个版本");
        }
    }
};

// 获取选中的版本详情
const selectedVersionDetails = computed(() => {
    return selectedVersions.value
        .map((v) => versions.value.find((ver) => ver.version === v))
        .filter((v) => v !== undefined) as ImageVersion[];
});

// 切换到指定版本
const switchToVersion = async (version: number) => {
    if (!props.taskId || props.pageIndex === null) return;

    try {
        restoringVersion.value = version;
        const response = await imageApi.restoreImageVersion(
            props.taskId,
            props.pageIndex,
            version,
        );

        if (response.success) {
            message.success(response.message || "版本切换成功");
            // 重新加载版本列表
            await loadVersions();
            // 通知父组件刷新
            emit("version-switched");
        } else {
            message.error(response.message || "切换失败");
        }
    } catch (error) {
        console.error("切换版本失败:", error);
        message.error("切换版本失败");
    } finally {
        restoringVersion.value = null;
    }
};

// 图片预览状态
const previewImage = ref<{ url: string; alt: string } | null>(null);
const showImagePreview = ref(false);

const viewImage = (url: string, version?: number) => {
    previewImage.value = {
        url,
        alt: version !== undefined ? `版本 ${version}` : "图片预览",
    };
    showImagePreview.value = true;
};

// 关闭弹窗
const closeModal = () => {
    isModalOpen.value = false;
};

// 格式化时间
const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
};

// 格式化生成方式
const formatGeneratedBy = (generatedBy: string) => {
    const map: Record<string, string> = {
        initial: "初始生成",
        "single-regenerate": "单个重绘",
        "batch-regenerate": "批量重绘",
    };
    return map[generatedBy] || generatedBy;
};
</script>

<template>
    <Teleport to="body">
        <!-- 弹窗遮罩 -->
        <div
            v-if="isModalOpen"
            class="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            @click.self="closeModal"
        >
            <!-- 弹窗内容 - 固定宽高 -->
            <div
                class="relative mx-4 flex h-[85vh] w-full max-w-6xl flex-col rounded-2xl bg-background shadow-2xl"
            >
                <!-- 头部 - 固定高度 -->
                <div class="flex-shrink-0 border-b border-border/40 px-6 py-4">
                    <div class="flex items-center justify-between">
                        <div>
                            <h2 class="text-xl font-bold text-foreground">
                                版本历史对比
                                <span v-if="pageLabel" class="text-base font-normal text-muted-foreground">
                                    - {{ pageLabel }}
                                </span>
                            </h2>
                            <p class="mt-1 text-sm text-muted-foreground">
                                共 {{ versions.length }} 个版本 · 选择最多3个版本进行对比
                            </p>
                        </div>
                        <button
                            @click="closeModal"
                            class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-black/20 text-white backdrop-blur-sm transition-all hover:bg-black/40"
                        >
                            <UIcon name="i-lucide-x" class="h-5 w-5" />
                        </button>
                    </div>

                    <!-- 版本选择器 -->
                    <div class="mt-4 flex flex-wrap gap-2">
                        <button
                            v-for="ver in versions"
                            :key="ver.version"
                            @click="toggleVersion(ver.version)"
                            class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all"
                            :class="
                                selectedVersions.includes(ver.version)
                                    ? 'bg-primary text-white shadow-sm'
                                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                            "
                        >
                            <span>v{{ ver.version }}</span>
                            <UIcon
                                v-if="ver.isCurrent"
                                name="i-lucide-check-circle"
                                class="h-3.5 w-3.5"
                            />
                        </button>
                    </div>
                </div>

                <!-- 内容区域 - 可滚动 -->
                <div class="flex-1 overflow-y-auto">
                    <!-- 加载状态 -->
                    <div v-if="isLoading" class="flex h-full items-center justify-center">
                        <div
                            class="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
                        ></div>
                    </div>

                    <!-- 版本对比区域 -->
                    <div
                        v-else-if="selectedVersionDetails.length > 0"
                        class="flex justify-center gap-6 p-6"
                    >
                        <div
                            v-for="version in selectedVersionDetails"
                            :key="version.version"
                            class="flex flex-col rounded-2xl bg-card shadow-sm ring-1 ring-border/40"
                            :class="[
                                { 'ring-2 ring-primary': version.isCurrent },
                                selectedVersionDetails.length === 1 ? 'w-full max-w-md' : 'w-full max-w-sm'
                            ]"
                        >
                            <!-- 版本头部 -->
                            <div class="flex items-center justify-between border-b border-border/40 px-4 py-3">
                                <div class="flex items-center gap-2">
                                    <span
                                        class="inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold"
                                        :class="
                                            version.isCurrent
                                                ? 'bg-primary text-white'
                                                : 'bg-muted text-muted-foreground'
                                        "
                                    >
                                        v{{ version.version }}
                                    </span>
                                    <div>
                                        <div class="text-sm font-medium text-foreground">
                                            {{ version.isCurrent ? "当前版本" : `版本 ${version.version}` }}
                                        </div>
                                        <div class="text-xs text-muted-foreground">
                                            {{ formatTime(version.createdAt) }}
                                        </div>
                                    </div>
                                </div>
                                <span
                                    v-if="version.isCurrent"
                                    class="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                                >
                                    使用中
                                </span>
                            </div>

                            <!-- 图片预览 -->
                            <div
                                class="relative aspect-[3/4] cursor-pointer overflow-hidden bg-muted"
                                @click="viewImage(version.imageUrl, version.version)"
                            >
                                <img
                                    :src="version.imageUrl"
                                    :alt="`版本 ${version.version}`"
                                    class="h-full w-full object-cover transition-transform hover:scale-105"
                                />
                                <div
                                    class="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity hover:opacity-100"
                                >
                                    <UIcon name="i-lucide-zoom-in" class="h-8 w-8 text-white" />
                                </div>
                            </div>

                            <!-- 版本信息 -->
                            <div class="flex-1 border-t border-border/40 p-4">
                                <div class="space-y-2 text-sm">
                                    <div class="flex items-center justify-between">
                                        <span class="text-muted-foreground">生成方式</span>
                                        <span class="font-medium text-foreground">
                                            {{ formatGeneratedBy(version.generatedBy) }}
                                        </span>
                                    </div>
                                    <div class="flex items-center justify-between">
                                        <span class="text-muted-foreground">消耗积分</span>
                                        <span class="font-medium text-foreground">
                                            {{ version.powerAmount || 0 }}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <!-- 操作按钮 -->
                            <div class="border-t border-border/40 p-4">
                                <button
                                    v-if="!version.isCurrent"
                                    @click="switchToVersion(version.version)"
                                    :disabled="restoringVersion === version.version"
                                    class="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                                >
                                    <span v-if="restoringVersion === version.version">切换中...</span>
                                    <span v-else>使用此版本</span>
                                </button>
                                <div
                                    v-else
                                    class="w-full rounded-lg bg-muted px-4 py-2 text-center text-sm font-medium text-muted-foreground"
                                >
                                    当前使用版本
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 空状态 -->
                    <div v-else class="flex flex-1 flex-col items-center justify-center text-center py-20">
                        <UIcon name="i-lucide-images" class="mb-4 h-16 w-16 text-muted-foreground" />
                        <p class="text-lg font-medium text-foreground">暂无版本</p>
                        <p class="mt-1 text-sm text-muted-foreground">请先选择要对比的版本</p>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
    
    <!-- 图片预览弹窗 -->
    <ImagePreviewModal
        v-model:open="showImagePreview"
        :src="previewImage?.url || null"
        :alt="previewImage?.alt"
    />
</template>
