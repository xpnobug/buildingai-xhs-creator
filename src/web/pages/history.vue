<script setup lang="ts">
import "vue-waterfall-plugin-next/dist/style.css";

import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { Waterfall } from "vue-waterfall-plugin-next";

import PageHeader from "~/components/common/PageHeader.vue";
import TaskDetailModal from "~/components/xhs/TaskDetailModal.vue";
import type { XhsTask } from "~/models";
import { taskApi } from "~/services/xhs/api";
import { useXhsCreatorStore } from "~/stores/xhs-creator";

definePageMeta({
    name: "历史记录",
    auth: true,
});

const store = useXhsCreatorStore();
const waterfallRef = ref();
const loadMoreTrigger = ref<HTMLElement>();
const isLoading = ref(false);
const isLoadingMore = ref(false);
const hasMore = ref(true);
const currentPage = ref(1);
const pageSize = ref(12);
const tasks = ref<XhsTask[]>([]);
const selectedTaskId = ref<string | null>(null);
const isDetailModalOpen = ref(false);

let loadMoreObserver: IntersectionObserver | null = null;

// 瀑布流配置
const WATERFALL_CONFIG = {
    BREAKPOINTS: {
        1200: { rowPerView: 3 },
        900: { rowPerView: 2 },
        600: { rowPerView: 1 },
    },
    GUTTER: 4,
    ANIMATION_DURATION: 300,
    DEFAULT_ROW_PER_VIEW: 4,
} as const;

// 瀑布流数据
const waterfallData = computed(() => {
    return tasks.value.map((task) => ({
        id: task.id,
        task,
        src: task.coverImageUrl || "",
    }));
});

// 加载任务列表
const loadTasks = async (reset = false) => {
    if (reset) {
        currentPage.value = 1;
        hasMore.value = true;
        tasks.value = [];
    }

    if (!hasMore.value) return;
    if (isLoading.value || isLoadingMore.value) return;

    const startTime = Date.now();

    try {
        if (currentPage.value === 1) {
            isLoading.value = true;
        } else {
            isLoadingMore.value = true;
        }

        const response = await taskApi.getTasks(currentPage.value, pageSize.value);
        const newTasks = response.tasks || [];

        if (reset) {
            tasks.value = newTasks;
        } else {
            tasks.value.push(...newTasks);
        }

        // 更新分页信息
        if (response.pagination) {
            hasMore.value = currentPage.value < response.pagination.totalPages;
        } else {
            hasMore.value = newTasks.length === pageSize.value;
        }
        currentPage.value++;

        // 重新渲染瀑布流
        await nextTick();
        setTimeout(() => {
            refreshWaterfall();
        }, 100);

        // 只在首次加载后设置观察器
        if (currentPage.value === 2) {
            setTimeout(() => {
                setupLoadMoreObserver();
            }, 500);
        }
    } catch (error) {
        console.error("加载任务列表失败:", error);
    } finally {
        const MIN_FIRST_LOAD_DURATION = 5000; // 首屏最少展示加载 2 秒
        const elapsed = Date.now() - startTime;
        const delay = currentPage.value === 1 ? Math.max(0, MIN_FIRST_LOAD_DURATION - elapsed) : 0;

        if (delay > 0) {
            setTimeout(() => {
                isLoading.value = false;
                isLoadingMore.value = false;
            }, delay);
        } else {
        isLoading.value = false;
        isLoadingMore.value = false;
        }
    }
};

// 强制重新渲染瀑布流
const refreshWaterfall = () => {
    if (waterfallRef.value?.renderer) {
        waterfallRef.value.renderer();
        setTimeout(() => {
            if (waterfallRef.value?.renderer) {
                waterfallRef.value.renderer();
            }
        }, 100);
    }
};

// 设置触底加载观察器
const setupLoadMoreObserver = () => {
    if (loadMoreObserver) {
        loadMoreObserver.disconnect();
    }

    if (!loadMoreTrigger.value || !hasMore.value) {
        return;
    }

    setTimeout(() => {
        if (!loadMoreTrigger.value || !hasMore.value) {
            return;
        }

        loadMoreObserver = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (
                    entry?.isIntersecting &&
                    hasMore.value &&
                    !isLoadingMore.value &&
                    !isLoading.value
                ) {
                    loadTasks();
                }
            },
            {
                root: null,
                rootMargin: "50px",
                threshold: 0.1,
            },
        );

        loadMoreObserver.observe(loadMoreTrigger.value);
    }, 500);
};

// 清理触底加载观察器
const cleanupLoadMoreObserver = () => {
    if (loadMoreObserver) {
        loadMoreObserver.disconnect();
        loadMoreObserver = null;
    }
};

// 打开详情弹窗
const openDetailModal = (taskId: string) => {
    selectedTaskId.value = taskId;
    isDetailModalOpen.value = true;
};

// 关闭详情弹窗
const closeDetailModal = () => {
    isDetailModalOpen.value = false;
    selectedTaskId.value = null;
};

// 跳转编辑大纲
const handleEditTask = async (taskId: string) => {
    try {
        // 将历史任务加载到生成流程的 store 中
        await store.loadTask(taskId);
        // 保存 taskId 到 sessionStorage 以便页面刷新后恢复
        if (typeof window !== "undefined") {
            sessionStorage.setItem("xhs-creator-current-taskId", taskId);
        }
        // 跳转到编辑大纲页面
        navigateTo("/xhs/outline");
    } catch (error) {
        console.error("跳转编辑大纲失败:", error);
    }
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
const getStatusText = (status: string) => {
    const map: Record<string, string> = {
        completed: "已完成",
        failed: "失败",
        generating_images: "生成中",
        generating_outline: "生成中",
        pending: "等待中",
    };
    return map[status] || status;
};

// 获取状态颜色
const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
        // 角标颜色加强版：不再是浅色 /10，而是实体色 + 白字 + 阴影
        completed: "bg-success text-white shadow-sm",
        failed: "bg-destructive text-white shadow-sm",
        generating_images: "bg-primary text-white shadow-sm",
        generating_outline: "bg-primary text-white shadow-sm",
        pending: "bg-muted text-foreground shadow-sm",
    };
    return map[status] || "bg-muted text-muted-foreground";
};

onMounted(() => {
    loadTasks(true);
});

onBeforeUnmount(() => {
    cleanupLoadMoreObserver();
});
</script>

<template>
    <!-- 小红书 explore 风格历史页 -->
    <div class="min-h-screen bg-background">
        <!-- 全屏进入页面加载状态 -->
        <div
            v-if="isLoading"
            class="flex min-h-screen items-center justify-center"
        >
            <div class="flex flex-col items-center gap-3 text-gray-500">
                <div
                    class="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-[#ff2442]"
                />
                <div class="text-sm">正在打开历史记录...</div>
            </div>
            </div>

        <main
            v-if="!isLoading"
            class="mx-auto w-full max-w-7xl px-4 pb-6 pt-4 md:px-6 lg:px-8"
        >
            <!-- 统一的页面头部 -->
            <PageHeader 
                title="历史记录" 
                back-text="返回首页"
                @back="() => navigateTo('/')"
            />
            
            <!-- 瀑布流容器 -->
            <div class="waterfall-container mx-auto w-full">
                <!-- 瀑布流组件 -->
                <Waterfall
                    v-if="waterfallData.length > 0"
                    ref="waterfallRef"
                    :list="waterfallData"
                    row-key="id"
                    img-selector="src"
                    :width="260"
                    :gutter="WATERFALL_CONFIG.GUTTER"
                    :pos-duration="WATERFALL_CONFIG.ANIMATION_DURATION"
                    :animation-cancel="false"
                    :lazyload="false"
                    align="center"
                    class="waterfall-list"
                    :background-color="'transparent'"
                >
                    <template #default="{ item }">
                        <!-- 任务卡片（小红书风格：图片为主） -->
                        <div
                            class="group w-full cursor-pointer overflow-hidden rounded-2xl transition-transform duration-300 hover:-translate-y-1"
                            @click="openDetailModal(item.task.id)"
                        >
                            <!-- 封面图容器 -->
                            <div
                                class="relative overflow-hidden bg-gray-100 dark:bg-gray-800 rounded-2xl"
                                :style="{
                                    aspectRatio: '3/4',
                                    width: '100%',
                                }"
                            >
                                <img
                                    v-if="item.task.coverImageUrl"
                                    :src="item.task.coverImageUrl"
                                    :alt="item.task.topic || '封面图'"
                                    class="h-full w-full object-cover"
                                />
                                <div
                                    v-else
                                    class="flex h-full w-full items-center justify-center bg-muted"
                                >
                                    <UIcon name="i-lucide-image" class="h-12 w-12 text-muted-foreground" />
                                </div>

                                <!-- 悬浮遮罩和操作按钮：预览 + 编辑 -->
                                <div
                                    class="absolute inset-0 flex items-center justify-center bg-black/0 backdrop-blur-[2px] opacity-0 transition-all duration-300 group-hover:bg-black/25 group-hover:opacity-100"
                                >
                                    <div class="flex flex-col items-center gap-3">
                                        <!-- 预览按钮（白色描边） -->
                                    <button
                                            class="rounded-full border border-white/80 bg-white/10 px-6 py-1.5 text-sm font-medium text-white"
                                        @click.stop="openDetailModal(item.task.id)"
                                    >
                                            预览
                                        </button>
                                        <!-- 编辑按钮（红色实心） -->
                                        <button
                                            class="rounded-full bg-[#ff2442] px-7 py-1.5 text-sm font-medium text-white shadow-md"
                                            @click.stop="handleEditTask(item.task.id)"
                                        >
                                            编辑
                                    </button>
                                    </div>
                                </div>

                                <!-- 状态标签（右上角角标） -->
                                <div
                                    class="absolute top-2 right-2 rounded-full px-2 py-1 text-[11px] font-medium"
                                    :class="getStatusColor(item.task.status)"
                                >
                                    {{ getStatusText(item.task.status) }}
                                </div>
                            </div>

                            <!-- 任务信息（标题 + 简要信息，小红书风格） -->
                            <div class="px-1.5 pt-2">
                                <h3 class="mb-1 line-clamp-2 text-[13px] font-semibold text-white">
                                    {{ item.task.topic || "未命名任务" }}
                                </h3>
                                <div class="flex items-center justify-between text-[11px] text-[#a1a1aa]">
                                    <span>页数 {{ (item.task.pages || []).length || 0 }}</span>
                                    <span>{{ formatDateTime(item.task.createdAt) }}</span>
                                </div>
                            </div>
                        </div>
                    </template>
                </Waterfall>

                <!-- 触底加载指示器 -->
                <div
                    v-if="waterfallData.length > 0 && hasMore"
                    ref="loadMoreTrigger"
                    class="flex items-center justify-center py-8"
                >
                    <div
                        v-if="isLoadingMore"
                        class="flex items-center space-x-2 text-gray-500"
                    >
                        <div
                            class="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500"
                        ></div>
                        <span class="text-sm">加载中...</span>
                    </div>
                    <div v-else class="text-sm text-gray-400">滚动加载更多</div>
                </div>

                <!-- 没有更多数据提示 -->
                <div
                    v-if="waterfallData.length > 0 && !hasMore"
                    class="flex items-center justify-center py-8"
                >
                    <div class="text-sm text-gray-400">没有更多了</div>
                </div>

                <!-- 空状态提示 -->
                <div
                    v-if="!isLoading && tasks.length === 0"
                    class="flex flex-col items-center justify-center py-16 text-center"
                >
                    <UIcon name="i-lucide-inbox" class="mb-4 h-16 w-16 text-muted-foreground" />
                    <p class="text-lg font-medium text-foreground">暂无历史记录</p>
                    <p class="mt-2 text-sm text-muted-foreground">
                        去生成一篇小红书图文内容吧
                    </p>
                </div>
            </div>
        </main>

        <!-- 任务详情弹窗 -->
        <TaskDetailModal
            v-model:open="isDetailModalOpen"
            :task-id="selectedTaskId"
            @close="closeDetailModal"
        />
    </div>
</template>

<style scoped>
/* 瀑布流容器样式 */
.waterfall-container {
    width: 100%;
    min-height: 200px;
}

.waterfall-list {
    width: 100%;
    background-color: transparent !important;
}

/* 响应式瀑布流 */
@media (max-width: 1536px) {
    .waterfall-container {
        padding-left: 1.5rem;
        padding-right: 1.5rem;
        max-width: 90rem;
    }
}

@media (max-width: 1280px) {
    .waterfall-container {
        padding-left: 1rem;
        padding-right: 1rem;
        max-width: 75rem;
    }
}

@media (max-width: 1024px) {
    .waterfall-container {
        padding-left: 1rem;
        padding-right: 1rem;
        max-width: 60rem;
    }
}

@media (max-width: 768px) {
    .waterfall-container {
        padding-left: 0.75rem;
        padding-right: 0.75rem;
        max-width: 55rem;
    }
}
</style>

