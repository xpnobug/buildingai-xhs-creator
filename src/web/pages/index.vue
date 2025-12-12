<script setup lang="ts">
import "vue-waterfall-plugin-next/dist/style.css";

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Waterfall } from "vue-waterfall-plugin-next";

import { apiUploadFiles } from "@buildingai/service/common";
import { useUserStore } from "@buildingai/stores/user";

import ComposerInput from "~/components/redink/ComposerInput.vue";
import GenerateStep from "~/components/xhs/GenerateStep.vue";
import OutlineStep from "~/components/xhs/OutlineStep.vue";
import ResultStep from "~/components/xhs/ResultStep.vue";
import TaskDetailModal from "~/components/xhs/TaskDetailModal.vue";
import type { XhsPluginConfig, XhsTask } from "~/models";
import { apiGetXhsPluginConfig } from "~/services/xhs/config";
import { balanceApi, taskApi } from "~/services/xhs/api";
import { useXhsCreatorStore } from "~/stores/xhs-creator";

definePageMeta({
    name: "小红书图文生成",
    auth: true,
    inLinkSelector: true,
});

type StepKey = "compose" | "outline" | "generate" | "result";

const store = useXhsCreatorStore();
const topic = ref(store.topic || "");
const loading = ref(false);
const errorMessage = ref("");
const composerRef = ref<InstanceType<typeof ComposerInput> | null>(null);
const selectedImages = ref<File[]>([]);
const activeTab = ref<StepKey>("compose");

// 项目列表（瀑布流）
const tasks = ref<XhsTask[]>([]);
const waterfallRef = ref();
const loadMoreTrigger = ref<HTMLElement>();
const isLoadingTasks = ref(false);
const isLoadingMore = ref(false);
const hasMore = ref(true);
const currentPage = ref(1);
const pageSize = ref(12);
let loadMoreObserver: IntersectionObserver | null = null;

// 瀑布流配置
const WATERFALL_CONFIG = {
    BREAKPOINTS: {
        1400: { rowPerView: 4 },
        1200: { rowPerView: 3 },
        900: { rowPerView: 2 },
        600: { rowPerView: 2 },
    },
    GUTTER: 16,
    ANIMATION_DURATION: 300,
    DEFAULT_ROW_PER_VIEW: 5,
} as const;

// 占位图 URL（使用简单的 SVG data URL）
const PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"%3E%3Crect fill="%23f3f4f6" width="400" height="300"/%3E%3Cpath d="M180 120h40v60h-40z M160 180h80v20H160z" fill="%23d1d5db"/%3E%3Ccircle cx="200" cy="140" r="25" fill="%23d1d5db"/%3E%3C/svg%3E';

// 记录加载失败的图片
const failedImages = ref<Set<string>>(new Set());

// 图片加载失败处理
const handleImageError = (taskId: string, event: Event) => {
    failedImages.value.add(taskId);
    const img = event.target as HTMLImageElement;
    if (img) {
        img.style.display = 'none';
    }
};

// 检查图片是否失败
const isImageFailed = (taskId: string) => failedImages.value.has(taskId);

// 瀑布流数据（按更新时间倒序排列）
const waterfallData = computed(() => {
    // 先按更新时间排序（最新的在前面）
    const sortedTasks = [...tasks.value].sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return timeB - timeA; // 倒序，最新的在前
    });
    
    return sortedTasks.map((task) => ({
        id: task.id,
        task,
        // 使用占位图确保瀑布流能正确计算高度
        src: task.coverImageUrl || PLACEHOLDER_IMAGE,
    }));
});

// 预览弹窗
const isPreviewModalOpen = ref(false);
const previewTaskId = ref<string | null>(null);

const openPreviewModal = (taskId: string) => {
    previewTaskId.value = taskId;
    isPreviewModalOpen.value = true;
};

const closePreviewModal = () => {
    isPreviewModalOpen.value = false;
    previewTaskId.value = null;
};

const pluginConfig = ref<XhsPluginConfig>({
    pluginName: "小红书图文生成",
    coverImagePower: 80,
    contentImagePower: 40,
    homeTitle: "今天的主题是什么？",
    quickStartTemplates: null,
});

// 免费使用次数
const freeUsageInfo = ref<{
    remainingFreeCount: number;
    freeUsageLimit: number;
} | null>(null);

const stepAvailability = computed(() => ({
    compose: true,
    outline: store.pages.length > 0,
    generate: store.pages.length > 0,
    result: store.pages.some((page) => page.imageUrl),
}));

const steps = computed(() => [
    {
        key: "compose",
        title: "输入需求",
        description: "填写主题与参考图",
        enabled: stepAvailability.value.compose,
    },
    {
        key: "outline",
        title: "编辑大纲",
        description: "排序与润色文案",
        enabled: stepAvailability.value.outline,
    },
    {
        key: "generate",
        title: "生成图片",
        description: "实时查看进度",
        enabled: stepAvailability.value.generate,
    },
    {
        key: "result",
        title: "导出结果",
        description: "批量下载图文",
        enabled: stepAvailability.value.result,
    },
]);

const setActiveTab = (key: StepKey) => {
    const target = steps.value.find((step) => step.key === key);
    if (!target?.enabled) return;
    activeTab.value = key;
};

watch(
    steps,
    () => {
        const current = steps.value.find((step) => step.key === activeTab.value);
        if (!current?.enabled) {
            activeTab.value = "compose";
        }
    },
    { deep: true },
);

const handleImagesChange = (files: File[]) => {
    selectedImages.value = files;
};

const uploadReferenceImages = async () => {
    if (!selectedImages.value.length) {
        store.userImages = [];
        return;
    }

    const uploadResults = await apiUploadFiles({
        files: selectedImages.value,
        extensionId: "buildingai-xhs-creator",
    });

    store.userImages = uploadResults.map((file) =>
        file.url.replace(/^https?:\/\/[^/]+\//, "/"),
    );
};

const handleGenerate = async () => {
    if (!topic.value.trim()) return;
    loading.value = true;
    errorMessage.value = "";

    try {
        store.topic = topic.value.trim();
        await uploadReferenceImages();
        await store.generateOutline();
        composerRef.value?.clearPreviews?.();
        selectedImages.value = [];
        activeTab.value = "outline";
    } catch (error: unknown) {
        console.error("生成大纲失败:", error);
        errorMessage.value =
            error instanceof Error ? error.message : "生成大纲失败，请稍后再试";
    } finally {
        loading.value = false;
    }
};

const handleOutlineBack = () => {
    activeTab.value = "compose";
};

const handleOutlineGenerate = () => {
    activeTab.value = "generate";
};

// 大纲页直接生成完成后，切换到结果页
const handleOutlineCompleted = () => {
    activeTab.value = "result";
};

const handleGenerationBack = () => {
    activeTab.value = "outline";
};

const handleGenerationCompleted = () => {
    activeTab.value = "result";
};

const handleResultRestart = () => {
    topic.value = "";
    activeTab.value = "compose";
};

// 编辑任务（与历史记录页一致，跳转到大纲编辑页）
const handleEditTask = async (taskId: string) => {
    try {
        await store.loadTask(taskId);
        // 保存 taskId 到 sessionStorage 以便页面刷新后恢复
        if (typeof window !== "undefined") {
            sessionStorage.setItem("xhs-creator-current-taskId", taskId);
        }
        navigateTo("/xhs/outline");
    } catch (error) {
        console.error("跳转编辑大纲失败:", error);
        errorMessage.value = "打开项目失败";
    }
};

// 加载项目列表（支持分页）
const loadTasks = async (reset = false) => {
    if (reset) {
        currentPage.value = 1;
        hasMore.value = true;
        tasks.value = [];
    }

    if (!hasMore.value) return;
    if (isLoadingTasks.value || isLoadingMore.value) return;

    try {
        if (currentPage.value === 1) {
            isLoadingTasks.value = true;
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

        // 设置观察器
        if (currentPage.value === 2) {
            setTimeout(() => {
                setupLoadMoreObserver();
            }, 500);
        }
    } catch (error) {
        console.error("加载项目列表失败:", error);
    } finally {
        isLoadingTasks.value = false;
        isLoadingMore.value = false;
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
                    !isLoadingTasks.value
                ) {
                    loadTasks();
                }
            },
            {
                root: null,
                rootMargin: "100px",
                threshold: 0.1,
            },
        );

        loadMoreObserver.observe(loadMoreTrigger.value);
    }, 500);
};

// 清理观察器
const cleanupLoadMoreObserver = () => {
    if (loadMoreObserver) {
        loadMoreObserver.disconnect();
        loadMoreObserver = null;
    }
};

onBeforeUnmount(() => {
    cleanupLoadMoreObserver();
});

onMounted(async () => {
    loadTasks();
    try {
        const [config, usageResult] = await Promise.all([
            apiGetXhsPluginConfig(),
            balanceApi.getUserUsage(),
        ]);
        pluginConfig.value = config;
        
        if (usageResult.success && usageResult.data) {
            freeUsageInfo.value = {
                remainingFreeCount: usageResult.data.remainingFreeCount,
                freeUsageLimit: usageResult.data.freeUsageLimit,
            };
        }
    } catch (error) {
        console.error("获取配置失败:", error);
    }
});

watch(
    () => store.topic,
    (value) => {
        if (value) {
            topic.value = value;
        }
    },
);

const userStore = useUserStore();
const userPower = computed(() => userStore.userInfo?.power || 0);

const defaultQuickStartTemplates = [
    {
        title: "中式茶饮品牌VI设计",
        image: "https://images.unsplash.com/photo-1563822249548-9a72b6353cd1?q=80&w=300&auto=format&fit=crop",
    },
    {
        title: "IP潮玩人物设定及表情包",
        image: "https://images.unsplash.com/photo-1618331835717-801e976710b2?q=80&w=300&auto=format&fit=crop",
    },
    {
        title: "宇宙漫航短片分镜",
        image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=300&auto=format&fit=crop",
    },
    {
        title: "香水产品系列海报",
        image: "https://images.unsplash.com/photo-1594035910387-fea47794261f?q=80&w=300&auto=format&fit=crop",
    },
    {
        title: "治愈系插画故事绘本",
        image: "https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=300&auto=format&fit=crop",
    },
];

// 使用后台配置的模板，如果为空则使用默认值
const quickStartTemplates = computed(() => {
    const templates = pluginConfig.value.quickStartTemplates;
    return templates && templates.length > 0 ? templates : defaultQuickStartTemplates;
});

const handleTemplateClick = (t: string) => {
    topic.value = t;
};

const handleNewProject = () => {
    store.reset();
    topic.value = "";
    composerRef.value?.clearPreviews?.();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

const handleOpenTask = async (taskId: string) => {
    try {
        await store.loadTask(taskId);
        if (store.allImagesGenerated) {
             activeTab.value = "result";
        } else if (store.pages.length > 0) {
             activeTab.value = "outline"; // Or generate if in progress, but outline is safer entry
        } else {
             activeTab.value = "compose"; // Should not happen for existing task usually
        }
    } catch (error) {
        console.error("Failed to open task:", error);
        errorMessage.value = "打开项目失败";
    }
};

const getRelativeTime = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚修改';
    if (minutes < 60) return `${minutes}分钟前修改`;
    if (hours < 24) return `${hours}小时前修改`;
    return `${days}天前修改`;
};
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

/* 移除瀑布流组件的白色背景 */
:deep(.waterfall-item) {
    background: transparent !important;
}

:deep(.vue-waterfall-easy) {
    background: transparent !important;
}
</style>

<template>
    <div class="min-h-screen bg-gray-50 dark:bg-[#09090b] text-foreground font-sans">
        <main class="relative z-10 mx-auto min-h-screen flex flex-col">
            <!-- Navigation Stepper (Hidden on Home) -->
            <div 
                v-if="activeTab !== 'compose'"
                class="mx-auto max-w-6xl w-full px-4 py-6 md:py-8 lg:px-8"
            >
                <div
                    class="flex flex-wrap gap-2 md:gap-3 rounded-[24px] md:rounded-[32px] border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-2 md:p-3 shadow-lg backdrop-blur-md"
                >
                    <button
                        v-for="(step, index) in steps"
                        :key="step.key"
                        class="group flex-1 min-w-[90px] md:min-w-[140px] rounded-xl md:rounded-2xl px-3 py-2 md:px-4 md:py-3 text-left transition relative overflow-hidden"
                        :class="[
                            activeTab === step.key ? 'bg-primary/20 text-primary ring-1 ring-primary/30' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5',
                            !step.enabled && step.key !== 'compose' ? 'opacity-50 cursor-not-allowed' : '',
                        ]"
                        :disabled="!step.enabled && step.key !== 'compose'"
                        @click="setActiveTab(step.key as StepKey)"
                    >
                        <div class="flex items-center gap-2 justify-center md:justify-start">
                            <span class="flex h-5 w-5 md:h-6 md:w-6 items-center justify-center rounded-full text-[10px] md:text-xs font-bold transition-colors"
                                :class="activeTab === step.key ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-gray-400 group-hover:bg-gray-300 dark:group-hover:bg-white/20'">
                                {{ index + 1 }}
                            </span>
                            <p class="text-sm font-semibold truncate">{{ step.title }}</p>
                        </div>
                        <p class="mt-1 text-xs opacity-60 hidden md:block pl-8 truncate">{{ step.description }}</p>
                    </button>
                </div>
            </div>

            <!-- Content Area -->
            <div :class="activeTab === 'compose' ? 'flex-1 flex flex-col' : 'mx-auto max-w-6xl w-full px-4 pb-10 lg:px-8'">
                <Transition mode="out-in" name="fade">
                    <!-- Home / Compose Step -->
                    <div 
                        v-if="activeTab === 'compose'" 
                        key="compose" 
                        class="flex-1 flex flex-col items-center justify-center relative w-full px-4 py-20"
                    >
                        <!-- Background Glow -->
                         <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 dark:bg-primary/20 rounded-full blur-[120px] pointer-events-none opacity-50"></div>

                         <div class="relative z-10 w-full max-w-7xl mx-auto flex flex-col items-center gap-12">
                             <h1 class="text-4xl md:text-5xl font-medium text-gray-900 dark:text-white tracking-tight text-center">
                                 {{ pluginConfig.homeTitle }}
                             </h1>

                             <ComposerInput
                                ref="composerRef"
                                v-model="topic"
                                :loading="loading"
                                @generate="handleGenerate"
                                @imagesChange="handleImagesChange"
                            />

                            <!-- Quick Start Section -->
                            <div class="w-full space-y-4">
                                <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">快速开始</h3>
                                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                                    <button
                                        v-for="template in quickStartTemplates"
                                        :key="template.title"
                                        @click="handleTemplateClick(template.title)"
                                        class="group relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-gray-200 dark:border-white/10 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/20"
                                    >
                                        <img 
                                            :src="template.image" 
                                            class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110 opacity-60 group-hover:opacity-80"
                                        />
                                        <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 flex items-end">
                                            <div class="flex items-center gap-1 w-full">
                                                <span class="text-xs font-medium text-white truncate flex-1 text-left">{{ template.title }}</span>
                                                <UIcon name="i-lucide-arrow-right" class="w-3.5 h-3.5 text-white/0 -translate-x-2 transition-all group-hover:translate-x-0 group-hover:text-white/70" />
                                            </div>
                                        </div>
                                    </button>
                                </div>
                            </div>

                             <!-- 我的项目（瀑布流） -->
                            <div v-if="tasks.length > 0 || isLoadingTasks" class="w-full space-y-4">
                                <div class="flex items-center justify-between">
                                    <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">我的项目</h3>
                                    <button 
                                        @click="handleNewProject"
                                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                                    >
                                        <UIcon name="i-lucide-plus" class="w-3.5 h-3.5" />
                                        新建项目
                                    </button>
                                </div>
                                
                                <!-- 瀑布流 -->
                                <Waterfall
                                    v-if="waterfallData.length > 0"
                                    ref="waterfallRef"
                                    :list="waterfallData"
                                    row-key="id"
                                    img-selector="src"
                                    :gutter="WATERFALL_CONFIG.GUTTER"
                                    :has-around-gutter="false"
                                    :animation-duration="WATERFALL_CONFIG.ANIMATION_DURATION"
                                    :breakpoints="WATERFALL_CONFIG.BREAKPOINTS"
                                    :row-per-view="WATERFALL_CONFIG.DEFAULT_ROW_PER_VIEW"
                                    align="left"
                                    cross-origin
                                    background-color="transparent"
                                >
                                    <template #item="{ item }">
                                        <div class="group flex flex-col gap-2 pb-4">
                                            <!-- Cover Image Container -->
                                            <div class="relative w-full overflow-hidden rounded-xl border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-black/20 transition-all group-hover:border-primary/50 group-hover:shadow-lg group-hover:shadow-primary/10">
                                                <!-- Image with error handling -->
                                                <img
                                                    v-if="item.task.coverImageUrl && !isImageFailed(item.task.id)"
                                                    :src="item.task.coverImageUrl"
                                                    class="w-full object-cover opacity-90 dark:opacity-80 transition-opacity group-hover:opacity-100"
                                                    @error="handleImageError(item.task.id, $event)"
                                                />
                                                <!-- Placeholder for missing/failed images -->
                                                <div 
                                                    v-if="!item.task.coverImageUrl || isImageFailed(item.task.id)" 
                                                    class="aspect-[4/3] w-full bg-gradient-to-br from-gray-100 dark:from-gray-800 to-gray-50 dark:to-gray-900 flex flex-col items-center justify-center gap-2"
                                                >
                                                    <UIcon name="i-lucide-image" class="w-10 h-10 text-gray-300 dark:text-gray-600" />
                                                    <span class="text-xs text-gray-400 dark:text-gray-500">暂无封面</span>
                                                </div>

                                                <!-- Status Badge (inside image) -->
                                                <div v-if="item.task.status === 'generating_images'" class="absolute top-2 right-2">
                                                    <span class="px-2 py-0.5 rounded-full bg-primary/90 text-white text-[10px] shadow-sm backdrop-blur-sm">生成中</span>
                                                </div>

                                                <!-- Hover Overlay with Actions -->
                                                <div class="absolute inset-0 flex items-center justify-center bg-black/0 backdrop-blur-[2px] opacity-0 transition-all duration-300 group-hover:bg-black/25 group-hover:opacity-100">
                                                    <div class="flex flex-col items-center gap-3">
                                                        <!-- 预览按钮（白色描边） -->
                                                        <button
                                                            class="rounded-full border border-white/80 bg-white/10 px-6 py-1.5 text-sm font-medium text-white"
                                                            @click.stop="openPreviewModal(item.task.id)"
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
                                            </div>

                                            <!-- Text Info (Outside) -->
                                            <div class="flex flex-col gap-0.5 px-1">
                                                <h4 class="text-xs font-medium text-gray-700 dark:text-gray-300 line-clamp-1 group-hover:text-primary transition-colors">
                                                    {{ item.task.topic || '未命名项目' }}
                                                </h4>
                                                <p class="text-[10px] text-gray-400 dark:text-gray-500">
                                                    {{ getRelativeTime(item.task.updatedAt) }}
                                                </p>
                                            </div>
                                        </div>
                                    </template>
                                </Waterfall>

                                <!-- 加载更多触发器 -->
                                <div
                                    ref="loadMoreTrigger"
                                    v-if="hasMore && !isLoadingTasks"
                                    class="flex items-center justify-center py-4"
                                >
                                    <span v-if="isLoadingMore" class="text-xs text-gray-400 flex items-center gap-2">
                                        <span class="w-4 h-4 border-2 border-gray-300 border-t-primary rounded-full animate-spin" />
                                        加载更多...
                                    </span>
                                </div>

                                <!-- 没有更多 -->
                                <div v-if="!hasMore && tasks.length > 0" class="flex items-center justify-center py-4">
                                    <span class="text-xs text-gray-400">没有更多了</span>
                                </div>
                            </div>
                            
                            <!-- 空状态 -->
                            <!-- <div v-else-if="!isLoadingTasks" class="w-full py-12 flex flex-col items-center gap-4">
                                <div class="w-16 h-16 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center">
                                    <UIcon name="i-lucide-image" class="w-8 h-8 text-gray-400 dark:text-gray-600" />
                                </div>
                                <p class="text-sm text-gray-500 dark:text-gray-400">还没有项目，开始创建你的第一个吧</p>
                            </div> -->
                         </div>
                    </div>

                    <OutlineStep
                        v-else-if="activeTab === 'outline'"
                        key="outline"
                        @back="handleOutlineBack"
                        @start-generate="handleOutlineGenerate"
                        @completed="handleOutlineCompleted"
                    />

                    <GenerateStep
                        v-else-if="activeTab === 'generate'"
                        key="generate"
                        :active="activeTab === 'generate'"
                        @back="handleGenerationBack"
                        @completed="handleGenerationCompleted"
                    />

                    <ResultStep 
                        v-else-if="activeTab === 'result'"
                        key="result" 
                        @restart="handleResultRestart" 
                    />
                </Transition>
            </div>
        </main>

        <div
            v-if="errorMessage"
            class="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-red-500/90 backdrop-blur px-5 py-3 text-sm font-medium text-white shadow-xl"
        >
            <UIcon name="i-lucide-alert-circle" class="h-4 w-4" />
            {{ errorMessage }}
        </div>

        <!-- 预览弹窗 -->
        <TaskDetailModal
            v-model:open="isPreviewModalOpen"
            :task-id="previewTaskId"
            @close="closePreviewModal"
        />
    </div>
</template>
