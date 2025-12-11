<script setup lang="ts">
import { computed } from "vue";

interface Props {
    show: boolean;
    totalPower: number;
    // 增量重绘相关
    dirtyPagesCount: number;     // 修改过的页面数量
    dirtyPower: number;          // 仅重绘修改页面所需积分
    totalPagesCount: number;     // 总页面数量
}

interface Emits {
    (e: "close"): void;
    (e: "view-result"): void;
    (e: "regenerate-all"): void;
    (e: "regenerate-dirty"): void;  // 新增：仅重绘修改页面
    (e: "save-only"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const isOpen = computed(() => props.show);

// 是否有修改过的页面（用于显示增量重绘选项）
const hasDirtyPages = computed(() => props.dirtyPagesCount > 0);

const handleClose = () => {
    emit("close");
};

const handleViewResult = () => {
    emit("view-result");
    emit("close");
};

const handleRegenerateAll = () => {
    emit("regenerate-all");
    emit("close");
};

// 新增：仅重绘修改页面
const handleRegenerateDirty = () => {
    emit("regenerate-dirty");
    emit("close");
};

const handleSaveOnly = () => {
    emit("save-only");
    emit("close");
};
</script>

<template>
    <Teleport to="body">
        <Transition name="fade">
            <div
                v-if="isOpen"
                class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                @click.self="handleClose"
            >
                <div
                    class="relative mx-4 w-full max-w-md overflow-hidden rounded-2xl bg-background shadow-2xl"
                >
                    <!-- 头部 -->
                    <div class="border-b border-border/40 px-6 py-4">
                        <div class="flex items-center justify-between">
                            <h3 class="text-lg font-semibold text-foreground">
                                选择下一步操作
                            </h3>
                            <button
                                @click="handleClose"
                                class="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors"
                            >
                                <UIcon name="i-lucide-x" class="h-5 w-5" />
                            </button>
                        </div>
                        <p class="mt-1 text-sm text-muted-foreground">
                            检测到此任务已生成过图片，请选择操作
                        </p>
                    </div>

                    <!-- 选项列表 -->
                    <div class="p-4 space-y-3">
                        <!-- 查看当前结果 -->
                        <button
                            @click="handleViewResult"
                            class="group w-full flex items-start gap-4 rounded-xl border border-border/60 bg-card p-4 text-left transition-all hover:border-primary hover:shadow-md"
                        >
                            <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <UIcon name="i-lucide-eye" class="h-5 w-5" />
                            </div>
                            <div class="flex-1">
                                <div class="font-medium text-foreground group-hover:text-primary">
                                    查看当前结果
                                </div>
                                <div class="text-sm text-muted-foreground">
                                    直接查看已生成的图片，不消耗积分
                                </div>
                            </div>
                            <UIcon name="i-lucide-chevron-right" class="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                        </button>

                        <!-- 仅重绘修改的页面（推荐，仅在有修改时显示） -->
                        <button
                            v-if="hasDirtyPages"
                            @click="handleRegenerateDirty"
                            class="group w-full flex items-start gap-4 rounded-xl border-2 border-green-500/50 bg-green-500/5 p-4 text-left transition-all hover:border-green-500 hover:shadow-md"
                        >
                            <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                                <UIcon name="i-lucide-pencil" class="h-5 w-5" />
                            </div>
                            <div class="flex-1">
                                <div class="flex items-center gap-2 font-medium text-foreground group-hover:text-green-600">
                                    仅重绘修改的页面
                                    <span class="rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-600">推荐</span>
                                </div>
                                <div class="text-sm text-muted-foreground">
                                    重新生成 <span class="font-semibold text-green-600">{{ dirtyPagesCount }}</span> 张图片，消耗 <span class="font-semibold text-green-600">{{ dirtyPower }}</span> 积分
                                </div>
                            </div>
                            <UIcon name="i-lucide-chevron-right" class="h-5 w-5 text-muted-foreground group-hover:text-green-500" />
                        </button>

                        <!-- 全部重新生成 -->
                        <button
                            @click="handleRegenerateAll"
                            class="group w-full flex items-start gap-4 rounded-xl border border-border/60 bg-card p-4 text-left transition-all hover:border-primary hover:shadow-md"
                        >
                            <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-500">
                                <UIcon name="i-lucide-refresh-cw" class="h-5 w-5" />
                            </div>
                            <div class="flex-1">
                                <div class="font-medium text-foreground group-hover:text-primary">
                                    全部重新生成
                                </div>
                                <div class="text-sm text-muted-foreground">
                                    重新生成所有 {{ totalPagesCount }} 张图片，消耗 <span class="font-semibold text-orange-500">{{ totalPower }}</span> 积分
                                </div>
                            </div>
                            <UIcon name="i-lucide-chevron-right" class="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                        </button>

                        <!-- 仅保存大纲 -->
                        <button
                            @click="handleSaveOnly"
                            class="group w-full flex items-start gap-4 rounded-xl border border-border/60 bg-card p-4 text-left transition-all hover:border-primary hover:shadow-md"
                        >
                            <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                <UIcon name="i-lucide-save" class="h-5 w-5" />
                            </div>
                            <div class="flex-1">
                                <div class="font-medium text-foreground group-hover:text-primary">
                                    仅保存大纲编辑
                                </div>
                                <div class="text-sm text-muted-foreground">
                                    保存修改，稍后再决定是否重新生成
                                </div>
                            </div>
                            <UIcon name="i-lucide-chevron-right" class="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                        </button>
                    </div>

                    <!-- 底部提示 -->
                    <div class="border-t border-border/40 bg-muted/30 px-6 py-3">
                        <div class="flex items-center gap-2 text-xs text-muted-foreground">
                            <UIcon name="i-lucide-info" class="h-4 w-4" />
                            <span>重新生成将创建新版本，原有版本仍可在版本历史中查看</span>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
