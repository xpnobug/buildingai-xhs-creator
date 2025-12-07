<script setup lang="ts">
import { onMounted, ref, computed } from "vue";

import AlertDialog from "../common/AlertDialog.vue";
import RegenerateOptionsDialog from "./RegenerateOptionsDialog.vue";
import { useXhsCreatorStore } from "~/stores/xhs-creator";
import { taskApi } from "~/services/xhs/api";

const emit = defineEmits<{
    (e: "back"): void;
    (e: "start-generate"): void;
    (e: "completed"): void;
}>();

const store = useXhsCreatorStore();
const dragOverIndex = ref<number | null>(null);
const draggedIndex = ref<number | null>(null);

// 错误弹窗状态
const showErrorDialog = ref(false);
const errorDialogMessage = ref("");
const isCheckingBalance = ref(false);

// 生成状态
const isGenerating = ref(false);

// 保存中状态
const isSaving = ref(false);

// 消息提示
const message = useMessage();

// 重新生成选项弹窗状态（从历史编辑时）
const showRegenerateOptions = ref(false);

// 计算总积分需求（封面80，内容40）
const totalPowerRequired = computed(() => store.totalPagesPower);

// 增量重绘所需积分
const dirtyPowerRequired = computed(() => store.dirtyPagesPower);

// 修改过的页面数量
const dirtyPagesCount = computed(() => store.dirtyPagesCount);

// 总页面数量
const totalPagesCount = computed(() => store.pages.length);

// 检查是否已有图片
const hasExistingImages = computed(() => {
    return store.pages.some(
        (page) => page.imageUrl || page.status === "completed" || page.status === "failed"
    );
});

const ensureOutlineReady = () => {
    if (!store.pages.length) {
        emit("back");
    }
};

onMounted(() => {
    ensureOutlineReady();
});

const getPageTypeName = (type: string) => {
    const names: Record<string, string> = {
        cover: "封面",
        content: "内容",
        summary: "总结",
    };
    return names[type] || "内容";
};

const onDragStart = (event: DragEvent, index: number) => {
    draggedIndex.value = index;
    event.dataTransfer?.setData("text/plain", index.toString());
};

const onDragOver = (event: DragEvent, index: number) => {
    event.preventDefault();
    if (draggedIndex.value === index) return;
    dragOverIndex.value = index;
};

const onDrop = (event: DragEvent, index: number) => {
    event.preventDefault();
    dragOverIndex.value = null;
    if (draggedIndex.value === null || draggedIndex.value === index) return;

    const pages = [...store.pages];
    const [moved] = pages.splice(draggedIndex.value, 1);
    if (!moved) {
        draggedIndex.value = null;
        return;
    }
    pages.splice(index, 0, moved);
    pages.forEach((page, idx) => {
        page.index = idx;
    });
    store.pages = pages;
    draggedIndex.value = null;
};

const deletePage = (index: number) => {
    if (store.pages.length <= 1) return;
    store.pages.splice(index, 1);
    store.pages.forEach((page, idx) => {
        page.index = idx;
    });
};

const addPage = () => {
    store.pages.push({
        index: store.pages.length,
        type: "content",
        content: "",
    });
};

const updateContent = (pageIndex: number, value: string) => {
    store.updatePage(pageIndex, value);
};

const goBack = () => {
    emit("back");
};

// 开始生成图片（直接在当前页面，不跳转）
// isRegenerate: true 表示是重绘，会递增版本号
const startGeneration = async (isRegenerate = false) => {
    if (!store.pages.length || isGenerating.value) return;
    
    isGenerating.value = true;
    
    // 重置所有页面状态为 pending
    store.pages.forEach((page) => {
        page.status = "pending";
        page.imageUrl = undefined;
        page.errorMessage = undefined;
    });
    
    try {
        await store.generateImages(isRegenerate);
        emit("completed");
    } catch (error: unknown) {
        console.error("生成失败:", error);
        const errorMsg = error instanceof Error ? error.message : "生成失败，请重试";
        errorDialogMessage.value = errorMsg;
        showErrorDialog.value = true;
    } finally {
        isGenerating.value = false;
    }
};

// 点击开始生成按钮
const handleStartGeneration = async () => {
    if (!store.pages.length) return;
    
    // 如果是从历史编辑来的，必须经过弹窗选择
    if (store.editSource === 'history') {
        showRegenerateOptions.value = true;
        return;
    }
    
    // 显示检查中状态
    isCheckingBalance.value = true;
    
    try {
        // 向后端验证余额是否充足
        const response = await usePluginWebPost<{success: boolean; message?: string}>(
            "/balance/check",
            {
                requiredPower: totalPowerRequired.value,
            },
        );
        
        if (!response.success) {
            // 余额不足，显示弹窗
            errorDialogMessage.value = response.message || `余额不足，需要 ${totalPowerRequired.value} 积分，请充值后重试`;
            showErrorDialog.value = true;
            return;
        }
        
        // 余额充足，直接开始生成（不跳转页面）
        // 首次生成不是重绘
        await startGeneration(false);
    } catch (error) {
        console.error("检查余额失败:", error);
        // 如果接口失败，仍然允许继续
        await startGeneration(false);
    } finally {
        isCheckingBalance.value = false;
    }
};

// 从历史编辑：查看当前结果（不清除来源，返回后仍需弹窗）
const handleViewResult = () => {
    // 不清除 editSource，这样返回大纲页再点击生成仍会弹窗
    emit("completed");
};

// 从历史编辑：全部重新生成（传递 isRegenerate=true 递增版本号）
const handleRegenerateAll = async () => {
    // 只有在真正开始生成时才清除来源标记
    store.editSource = null;
    // 传递 true 表示是重绘，会递增版本号
    await startGeneration(true);
};

// 从历史编辑：仅重绘修改的页面（增量重绘）
const handleRegenerateDirty = async () => {
    if (store.dirtyPagesCount === 0) {
        message.warning("没有修改过的页面需要重绘");
        return;
    }
    
    // 只有在真正开始生成时才清除来源标记
    store.editSource = null;
    
    isGenerating.value = true;
    
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

// 从历史编辑：仅保存大纲（调用后端API保存，不清除来源）
const handleSaveOnly = async () => {
    if (!store.taskId || !store.pages.length) {
        message.warning("没有可保存的内容");
        return;
    }
    
    isSaving.value = true;
    
    try {
        // 准备保存的数据
        const pagesToSave = store.pages.map((page) => ({
            index: page.index,
            type: page.type as "cover" | "content" | "summary",
            content: page.content,
        }));
        
        await taskApi.updateOutline(store.taskId, pagesToSave);
        message.success("大纲保存成功");
        
        // 不清除 editSource，再次点击生成仍会弹窗
    } catch (error: unknown) {
        console.error("保存大纲失败:", error);
        const errorMsg = error instanceof Error ? error.message : "保存失败，请重试";
        message.error(errorMsg);
    } finally {
        isSaving.value = false;
    }
};
</script>

<template>
    <div class="rounded-[32px] border border-border/60 bg-card/80 p-6 shadow-sm lg:p-8">
        <header class="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
                <p class="text-xs font-semibold uppercase tracking-[0.3em] text-primary/80">
                    Outline
                </p>
                <h2 class="text-2xl font-bold text-foreground md:text-3xl">编辑大纲</h2>
                <p class="text-sm text-muted-foreground">
                    调整顺序、补充文案，再开始生成配图。
                </p>
            </div>
            <div class="flex flex-wrap gap-3">
                <button
                    class="inline-flex items-center rounded-full border border-border/70 px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/5 disabled:opacity-50"
                    :disabled="isGenerating"
                    @click="goBack"
                >
                    返回
                </button>
                <button
                    class="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90 disabled:opacity-70"
                    :disabled="isGenerating || isCheckingBalance"
                    @click="handleStartGeneration"
                >
                    <UIcon 
                        v-if="isGenerating || isCheckingBalance" 
                        name="i-lucide-loader-2" 
                        class="h-4 w-4 animate-spin" 
                    />
                    {{ isGenerating ? '生成中...' : (isCheckingBalance ? '检查中...' : '开始生成图片') }}
                </button>
            </div>
        </header>

        <div class="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            <div
                v-for="(page, idx) in store.pages"
                :key="page.index"
                class="flex flex-col rounded-2xl border border-border/60 bg-background/70 p-4 shadow-sm transition hover:shadow-lg"
                draggable="true"
                :class="{ 'border-primary shadow-lg': dragOverIndex === idx }"
                @dragstart="onDragStart($event, idx)"
                @dragover="onDragOver($event, idx)"
                @drop="onDrop($event, idx)"
            >
                <div class="mb-3 flex items-center justify-between">
                    <div>
                        <div class="text-xs font-semibold text-muted-foreground">Page {{ idx + 1 }}</div>
                        <div class="text-base font-semibold text-foreground">
                            {{ getPageTypeName(page.type) }}
                        </div>
                    </div>
                    <div class="flex items-center gap-2 text-muted-foreground">
                        <button
                            class="rounded-full border border-border/60 p-2 text-xs hover:bg-foreground/5"
                            title="拖拽排序"
                        >
                            <UIcon name="i-lucide-grip-vertical" class="h-4 w-4" />
                        </button>
                        <button
                            class="rounded-full border border-border/60 p-2 text-xs text-destructive hover:bg-destructive/10"
                            title="删除"
                            @click="deletePage(idx)"
                        >
                            <UIcon name="i-lucide-trash-2" class="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <textarea
                    class="min-h-[160px] flex-1 resize-none rounded-xl border border-border/60 bg-card/70 p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                    :value="page.content"
                    placeholder="在此输入文案..."
                    @input="updateContent(page.index, ($event.target as HTMLTextAreaElement).value)"
                ></textarea>

                <div class="mt-2 text-right text-xs text-muted-foreground">
                    {{ page.content.length }} 字
                </div>
            </div>

            <button
                class="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-transparent text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary"
                type="button"
                @click="addPage"
            >
                <span class="text-3xl">+</span>
                添加页面
            </button>
        </div>
        
        <!-- 错误提示弹窗 -->
        <AlertDialog
            :show="showErrorDialog"
            title="余额不足"
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

