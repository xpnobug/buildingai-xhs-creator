<script setup lang="ts">
import { computed, ref, watch, onMounted } from "vue";

import AlertDialog from "../common/AlertDialog.vue";
import RegenerateOptionsDialog from "./RegenerateOptionsDialog.vue";
import { useXhsCreatorStore } from "~/stores/xhs-creator";
import { taskApi } from "~/services/xhs/api";

const props = defineProps<{
    active?: boolean;
}>();

const emit = defineEmits<{
    (e: "back"): void;
    (e: "completed"): void;
}>();

const store = useXhsCreatorStore();
const isGenerating = ref(false);
const hasStartedGeneration = ref(false);

// 错误弹窗状态
const showErrorDialog = ref(false);
const errorDialogMessage = ref("");

// 重新生成选项弹窗状态
const showRegenerateOptions = ref(false);

// 时间预估状态
const estimatedTime = ref("");
const generationStartTime = ref<number | null>(null);
const elapsedSeconds = ref(0);
let elapsedTimer: ReturnType<typeof setInterval> | null = null;

// 计算总积分需求
const totalPowerRequired = computed(() => store.totalPagesPower);

// 增量重绘所需积分
const dirtyPowerRequired = computed(() => store.dirtyPagesPower);

// 修改过的页面数量
const dirtyPagesCount = computed(() => store.dirtyPagesCount);

// 总页面数量
const totalPagesCount = computed(() => store.pages.length);

const progressPercent = computed(() => {
    if (!store.generationProgress.total) return 0;
    return Math.round(
        (store.generationProgress.current / store.generationProgress.total) * 100,
    );
});

const statusText = (status?: string) => {
    const map: Record<string, string> = {
        pending: "等待中",
        generating: "生成中",
        completed: "已完成",
        failed: "失败",
    };
    return map[status || "pending"] || "等待中";
};

// 格式化时间显示
const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds} 秒`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins} 分 ${secs} 秒` : `${mins} 分钟`;
};

// 动态剩余时间计算
const remainingTime = computed(() => {
    if (!isGenerating.value || !generationStartTime.value) return estimatedTime.value;
    const progress = store.generationProgress;
    if (!progress.total || progress.current === 0) return estimatedTime.value;
    
    const elapsed = elapsedSeconds.value;
    const progressRatio = progress.current / progress.total;
    const estimatedTotal = elapsed / progressRatio;
    const remaining = Math.max(0, Math.round(estimatedTotal - elapsed));
    return formatTime(remaining);
});

const startGeneration = async () => {
    if (!store.pages.length || isGenerating.value) return;
    isGenerating.value = true;
    hasStartedGeneration.value = true;
    
    // 启动计时器
    generationStartTime.value = Date.now();
    elapsedSeconds.value = 0;
    elapsedTimer = setInterval(() => {
        elapsedSeconds.value = Math.round((Date.now() - (generationStartTime.value || Date.now())) / 1000);
    }, 1000);

    try {
        await store.generateImages();
        emit("completed");
    } catch (error: unknown) {
        console.error("生成失败:", error);
        const errorMsg = error instanceof Error ? error.message : "生成失败，请重试";
        
        // 显示居中弹窗
        errorDialogMessage.value = errorMsg;
        showErrorDialog.value = true;
    } finally {
        isGenerating.value = false;
        // 清除计时器
        if (elapsedTimer) {
            clearInterval(elapsedTimer);
            elapsedTimer = null;
        }
    }
};

// 从历史编辑：全部重新生成
const handleRegenerateAll = async () => {
    // 重置所有页面状态为 pending
    store.pages.forEach((page) => {
        page.status = "pending";
        page.imageUrl = undefined;
        page.errorMessage = undefined;
    });
    // 清除来源标记，避免重复弹窗
    store.editSource = null;
    // 开始生成
    await startGeneration();
};

// 从历史编辑：查看当前结果
const handleViewResult = () => {
    // 清除来源标记
    store.editSource = null;
    emit("completed");
};

// 从历史编辑：仅保存（返回大纲页）
const handleSaveOnly = () => {
    // 清除来源标记
    store.editSource = null;
    emit("back");
};

// 从历史编辑：仅重绘修改的页面（增量重绘）
const handleRegenerateDirty = async () => {
    if (store.dirtyPagesCount === 0) {
        errorDialogMessage.value = "没有修改过的页面需要重绘";
        showErrorDialog.value = true;
        return;
    }
    
    // 清除来源标记
    store.editSource = null;
    
    isGenerating.value = true;
    hasStartedGeneration.value = true;
    
    // 重置仅修改过的页面状态为 pending
    store.pages.forEach((page) => {
        if (page.isDirty) {
            page.status = "pending";
            page.imageUrl = undefined;
            page.errorMessage = undefined;
        }
    });
    
    try {
        // 传递 isRegenerate=true, incrementalOnly=true
        await store.generateImages(true, true);
        emit("completed");
    } catch (error: unknown) {
        console.error("增量重绘失败:", error);
        const errorMsg = error instanceof Error ? error.message : "增量重绘失败，请重试";
        errorDialogMessage.value = errorMsg;
        showErrorDialog.value = true;
    } finally {
        isGenerating.value = false;
    }
};

const stopGeneration = () => {
    isGenerating.value = false;
};

watch(
    () => props.active,
    (isActive) => {
        if (!isActive) {
            stopGeneration();
            return;
        }

        if (!store.pages.length) {
            emit("back");
            return;
        }

        // 检查数据库中是否已经有图片（通过 imageUrl 或 status 判断）
        const hasImagesInDb = store.pages.some(
            (page) => page.imageUrl || page.status === "completed" || page.status === "failed",
        );

        // 【新增】如果是从历史编辑来的且已有图片，显示选项弹窗
        if (store.editSource === 'history' && hasImagesInDb) {
            showRegenerateOptions.value = true;
            return;
        }

        // 如果数据库中已经有图片，说明是从历史记录加载的，不需要重新生成
        if (hasImagesInDb) {
            // 检查是否所有图片都已完成（成功或失败）
            const allCompleted = store.pages.every(
                (page) => page.status === "completed" || page.status === "failed",
            );

            // 如果所有图片都已完成，自动切换到结果页
            if (allCompleted) {
                emit("completed");
            }
            // 否则显示当前状态，不自动重新生成
            return;
        }

        // 检查是否所有图片都是pending状态（未开始生成）
        const allPending = store.pages.every((page) => page.status === "pending");

        // 如果所有图片都是pending状态，说明是首次生成或者是重新生成（regenerateAllImages重置了状态）
        // 这种情况下应该自动开始生成
        if (allPending) {
            hasStartedGeneration.value = false; // 重置标志，允许重新生成
            startGeneration();
            return;
        }

        // 如果图片已经生成过（成功或失败），且已经启动过生成流程，则不自动重新生成
        // 用户可以通过"全部重绘"按钮手动重新生成
        if (hasStartedGeneration.value) {
            return;
        }

        // 首次进入且不是allPending，自动开始生成
        startGeneration();
    },
    { immediate: true },
);

// 监听生成进度，全部完成后自动切换
const allCompleted = computed(() => {
    return store.pages.length > 0 && store.pages.every(
        (page) => page.status === "completed" || page.status === "failed"
    );
});

watch(allCompleted, (val) => {
    if (val && props.active && !showErrorDialog.value && !showRegenerateOptions.value) {
        // 延迟跳转，让用户看到完成状态
        setTimeout(() => {
            emit("completed");
        }, 1000);
    }
});

// 组件挂载时获取时间预估
onMounted(async () => {
    try {
        const coverCount = store.pages.filter(p => p.type === "cover").length;
        const contentCount = store.pages.filter(p => p.type !== "cover").length;
        const result = await taskApi.getEstimation(coverCount || 1, contentCount || 5);
        if (result.success && result.formattedTime) {
            estimatedTime.value = result.formattedTime;
        }
    } catch (error) {
        console.error("获取时间预估失败:", error);
        // 使用默认值
        estimatedTime.value = "约 2 分钟";
    }
});

const goBack = () => {
    if (isGenerating.value) return;
    emit("back");
};
</script>

<template>
    <div class="rounded-[32px] border border-border/60 bg-card/80 p-6 shadow-sm lg:p-8">
        <header class="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
                <p class="text-xs font-semibold uppercase tracking-[0.3em] text-primary/80">
                    Progress
                </p>
                <h2 class="text-2xl font-bold text-foreground md:text-3xl">正在生成图片</h2>
                <p class="text-sm text-muted-foreground">
                    {{ store.generationProgress.message || "AI 正在并发生成所有页面" }}
                </p>
            </div>
            <button
                class="inline-flex items-center rounded-full border border-border/70 px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/5"
                :disabled="isGenerating"
                @click="goBack"
            >
                返回大纲
            </button>
        </header>

        <section class="rounded-3xl border border-border/60 bg-background/80 p-6 shadow-sm">
            <div class="mb-4 flex items-center justify-between">
                <span class="text-sm font-semibold text-muted-foreground">生成进度</span>
                <span class="text-base font-semibold text-primary">{{ progressPercent }}%</span>
            </div>
            <div class="h-2 rounded-full bg-muted">
                <div
                    class="h-full rounded-full bg-primary transition-all"
                    :style="{ width: `${progressPercent}%` }"
                ></div>
            </div>
            
            <!-- 时间预估显示 -->
            <div v-if="remainingTime" class="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <UIcon name="i-lucide-clock" class="h-4 w-4 text-primary/70" />
                <span>预计剩余时间：{{ remainingTime }}</span>
            </div>

            <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <article
                    v-for="page in store.pages"
                    :key="page.index"
                    class="flex h-full flex-col rounded-2xl border border-border/60 bg-background/70 shadow-sm"
                >
                    <div
                        class="relative flex flex-1 items-center justify-center overflow-hidden rounded-t-2xl bg-muted min-h-[200px]"
                    >
                        <!-- 已完成：显示实际图片 -->
                        <img
                            v-if="page.status === 'completed' && page.imageUrl"
                            :src="page.imageUrl"
                            :alt="`第 ${page.index + 1} 页`"
                            class="h-full w-full object-cover"
                        />
                        <!-- 失败：显示错误图标 -->
                        <div v-else-if="page.status === 'failed'" class="flex flex-col items-center gap-2 text-destructive">
                            <UIcon name="i-lucide-alert-triangle" class="h-8 w-8" />
                            <span class="text-xs">生成失败</span>
                        </div>
                        <!-- 等待中/生成中：显示骨架屏效果 -->
                        <div v-else class="absolute inset-0 skeleton-shimmer">
                            <div class="absolute inset-0 flex flex-col items-center justify-center gap-3">
                                <!-- 状态图标 -->
                                <div 
                                    class="w-12 h-12 rounded-full flex items-center justify-center"
                                    :class="page.status === 'generating' ? 'bg-primary/20' : 'bg-muted-foreground/10'"
                                >
                                    <UIcon 
                                        name="i-lucide-image" 
                                        class="h-6 w-6"
                                        :class="page.status === 'generating' ? 'text-primary animate-pulse' : 'text-muted-foreground/50'" 
                                    />
                                </div>
                                <!-- 状态文字 -->
                                <span 
                                    class="text-xs font-medium"
                                    :class="page.status === 'generating' ? 'text-primary' : 'text-muted-foreground/70'"
                                >
                                    {{ page.status === 'generating' ? '正在生成...' : '排队等待中' }}
                                </span>
                                <!-- 进度指示（仅生成中显示） -->
                                <div v-if="page.status === 'generating'" class="flex gap-1">
                                    <span class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style="animation-delay: 0ms" />
                                    <span class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style="animation-delay: 150ms" />
                                    <span class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style="animation-delay: 300ms" />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div
                        class="flex items-center justify-between border-t border-border/40 px-4 py-3 text-sm"
                    >
                        <div>
                            <div class="text-xs text-muted-foreground">Page {{ page.index + 1 }}</div>
                            <div class="font-semibold text-foreground">{{ statusText(page.status) }}</div>
                        </div>
                        <span
                            class="rounded-full px-3 py-1 text-xs font-medium"
                            :class="{
                                'bg-success/10 text-success': page.status === 'completed',
                                'bg-primary/10 text-primary': page.status === 'generating',
                                'bg-muted text-muted-foreground': page.status === 'pending',
                                'bg-destructive/10 text-destructive': page.status === 'failed',
                            }"
                        >
                            {{ statusText(page.status) }}
                        </span>
                    </div>
                    <p
                        v-if="page.status === 'failed'"
                        class="px-4 pb-4 text-xs text-destructive"
                    >
                        {{ page.errorMessage || "生成失败" }}
                    </p>
                </article>
            </div>

            <div
                class="mt-6 flex items-center gap-3 rounded-2xl border border-dashed border-border/70 bg-background/50 px-4 py-3 text-sm text-muted-foreground"
            >
                <UIcon name="i-lucide-info" class="h-4 w-4 text-primary" />
                请保持页面开启，生成完成后会自动切换至结果页。如果长时间没有响应，可返回上一步重新发起。
            </div>
        </section>

        <!-- 错误提示弹窗 -->
        <AlertDialog
            :show="showErrorDialog"
            title="图片生成失败"
            :message="errorDialogMessage"
            type="error"
            @close="showErrorDialog = false"
        />
        
        <!-- 从历史编辑：重新生成选项弹窗 -->
        <RegenerateOptionsDialog
            :show="showRegenerateOptions"
            :total-power="totalPowerRequired"
            :dirty-pages-count="dirtyPagesCount"
            :dirty-power="dirtyPowerRequired"
            :total-pages-count="totalPagesCount"
            @close="showRegenerateOptions = false"
            @view-result="handleViewResult"
            @regenerate-all="handleRegenerateAll"
            @regenerate-dirty="handleRegenerateDirty"
            @save-only="handleSaveOnly"
        />
    </div>
</template>

<style scoped>
/* 骨架屏闪烁动画 */
.skeleton-shimmer {
    background: linear-gradient(
        90deg,
        hsl(var(--muted)) 0%,
        hsl(var(--muted) / 0.5) 50%,
        hsl(var(--muted)) 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
}

@keyframes shimmer {
    0% {
        background-position: 200% 0;
    }
    100% {
        background-position: -200% 0;
    }
}
</style>

