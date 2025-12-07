<script setup lang="ts">
import { computed, ref, watch } from "vue";

import AlertDialog from "../common/AlertDialog.vue";
import RegenerateOptionsDialog from "./RegenerateOptionsDialog.vue";
import { useXhsCreatorStore } from "~/stores/xhs-creator";

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

const startGeneration = async () => {
    if (!store.pages.length || isGenerating.value) return;
    isGenerating.value = true;
    hasStartedGeneration.value = true;

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

            <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <article
                    v-for="page in store.pages"
                    :key="page.index"
                    class="flex h-full flex-col rounded-2xl border border-border/60 bg-background/70 shadow-sm"
                >
                    <div
                        class="relative flex flex-1 items-center justify-center overflow-hidden rounded-t-2xl bg-muted"
                    >
                        <img
                            v-if="page.status === 'completed' && page.imageUrl"
                            :src="page.imageUrl"
                            :alt="`第 ${page.index + 1} 页`"
                            class="h-full w-full object-cover"
                        />
                        <div v-else-if="page.status === 'failed'" class="text-destructive">
                            <UIcon name="i-lucide-alert-triangle" class="h-8 w-8" />
                        </div>
                        <div v-else class="text-primary">
                            <UIcon name="i-lucide-loader-2" class="h-8 w-8 animate-spin" />
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

