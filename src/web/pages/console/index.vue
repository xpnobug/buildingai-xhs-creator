<script setup lang="ts">
import { ref, reactive, onMounted, computed } from "vue";
import {
    apiQueryTasks,
    apiGetTaskDetail,
    apiDeleteTask,
    apiBatchDeleteTasks,
    type Task,
    type TaskDetail,
    type TaskImage,
    type QueryTaskParams,
    TaskStatus,
} from "~/services/console/task";
import VersionComparisonModal from "~/components/xhs/VersionComparisonModal.vue";

const message = useMessage();

// 数据
const tasks = ref<Task[]>([]);
const selectedTasks = ref<string[]>([]);
const loading = ref(false);
const detailModalVisible = ref(false);
const currentTaskDetail = ref<TaskDetail | null>(null);
const currentTaskImages = ref<TaskImage[]>([]);
const loadingDetail = ref(false);
const activeDetailTab = ref<"outline" | "images">("outline");

// 版本对比状态
const showVersionModal = ref(false);
const versionModalPage = ref<{ taskId: string; index: number; label: string } | null>(null);


// 分页
const pagination = reactive({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
});

// 统计信息
const stats = reactive({
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    generatingTasks: 0,
    totalImages: 0,
    successRate: "0.00",
});

// 筛选条件
const filters = reactive<QueryTaskParams>({
    status: undefined,
    userId: undefined,
    keyword: undefined,
    startDate: undefined,
    endDate: undefined,
});

// 状态选项
const statusOptions = [
    { label: "全部", value: undefined },
    { label: "等待中", value: TaskStatus.PENDING },
    { label: "生成大纲中", value: TaskStatus.GENERATING_OUTLINE },
    { label: "大纲就绪", value: TaskStatus.OUTLINE_READY },
    { label: "生成图片中", value: TaskStatus.GENERATING_IMAGES },
    { label: "已完成", value: TaskStatus.COMPLETED },
    { label: "失败", value: TaskStatus.FAILED },
];

// 获取状态颜色
const getStatusColor = (status: TaskStatus): "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral" => {
    const colorMap: Record<TaskStatus, "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral"> = {
        [TaskStatus.PENDING]: "neutral",
        [TaskStatus.GENERATING_OUTLINE]: "info",
        [TaskStatus.OUTLINE_READY]: "info",
        [TaskStatus.GENERATING_IMAGES]: "warning",
        [TaskStatus.COMPLETED]: "success",
        [TaskStatus.FAILED]: "error",
    };
    return colorMap[status] || "neutral";
};

// 加载任务列表
const { lockFn: loadTasks, isLock: isLoading } = useLockFn(async () => {
    try {
        loading.value = true;
        const result = await apiQueryTasks({
            page: pagination.page,
            pageSize: pagination.pageSize,
            ...filters,
        });

        tasks.value = result.tasks;
        pagination.total = result.pagination.total;
        pagination.totalPages = result.pagination.totalPages;
        Object.assign(stats, result.stats);
    } catch (error: any) {
        console.error("加载任务列表失败:", error);
        message.error(error.message || "加载任务列表失败");
    } finally {
        loading.value = false;
    }
});

// 加载任务详情
const { lockFn: loadTaskDetail, isLock: isLoadingDetail } = useLockFn(async (taskId: string) => {
    try {
        loadingDetail.value = true;
        activeDetailTab.value = "outline"; // 重置到第一个tab
        const result = await apiGetTaskDetail(taskId);
        currentTaskDetail.value = result.task;
        currentTaskImages.value = result.images;
        detailModalVisible.value = true;
        
        // 如果没有大纲，默认显示图片tab
        if (!result.task.outline && result.images.length > 0) {
            activeDetailTab.value = "images";
        }
    } catch (error: any) {
        console.error("加载任务详情失败:", error);
        message.error(error.message || "加载任务详情失败");
    } finally {
        loadingDetail.value = false;
    }
});

// 切换tab
const switchDetailTab = (tab: "outline" | "images") => {
    activeDetailTab.value = tab;
};

// 键盘事件处理（左右箭头切换tab）
const handleDetailKeydown = (event: KeyboardEvent) => {
    if (!detailModalVisible.value) return;
    
    if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (activeDetailTab.value === "images") {
            activeDetailTab.value = "outline";
        }
    } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (activeDetailTab.value === "outline") {
            activeDetailTab.value = "images";
        }
    }
};

// 监听键盘事件
watch(detailModalVisible, (visible) => {
    if (visible) {
        document.addEventListener("keydown", handleDetailKeydown);
    } else {
        document.removeEventListener("keydown", handleDetailKeydown);
    }
});

// 删除任务
const { lockFn: handleDelete, isLock: isDeleting } = useLockFn(async (taskId: string) => {
    if (!confirm("确定要删除这个任务吗？删除后无法恢复。")) {
        return;
    }

    try {
        await apiDeleteTask(taskId);
        message.success("删除成功");
        await loadTasks();
    } catch (error: any) {
        console.error("删除任务失败:", error);
        message.error(error.message || "删除任务失败");
    }
});

// 批量删除
const { lockFn: handleBatchDelete, isLock: isBatchDeleting } = useLockFn(async () => {
    if (selectedTasks.value.length === 0) {
        message.warning("请选择要删除的任务");
        return;
    }

    if (!confirm(`确定要删除选中的 ${selectedTasks.value.length} 个任务吗？删除后无法恢复。`)) {
        return;
    }

    try {
        const result = await apiBatchDeleteTasks(selectedTasks.value);
        message.success(`成功删除 ${result.deletedCount} 个任务`);
        selectedTasks.value = [];
        await loadTasks();
    } catch (error: any) {
        console.error("批量删除失败:", error);
        message.error(error.message || "批量删除失败");
    }
});

// 重置筛选
const resetFilters = () => {
    Object.assign(filters, {
        status: undefined,
        userId: undefined,
        keyword: undefined,
        startDate: undefined,
        endDate: undefined,
    });
    pagination.page = 1;
    loadTasks();
};

// 应用筛选
const applyFilters = () => {
    pagination.page = 1;
    loadTasks();
};

// 切换页码
const handlePageChange = (page: number) => {
    pagination.page = page;
    loadTasks();
};

// 切换每页数量
const handlePageSizeChange = (pageSize: number) => {
    pagination.pageSize = pageSize;
    pagination.page = 1;
    loadTasks();
};

// 全选/取消全选
const toggleSelectAll = (checked: boolean) => {
    if (checked) {
        selectedTasks.value = tasks.value.map((task) => task.id);
    } else {
        selectedTasks.value = [];
    }
};

// 计算是否全选
const isAllSelected = computed(() => {
    return tasks.value.length > 0 && selectedTasks.value.length === tasks.value.length;
});

// 计算是否部分选中
const isIndeterminate = computed(() => {
    return selectedTasks.value.length > 0 && selectedTasks.value.length < tasks.value.length;
});

// 打开版本对比弹窗
const openVersionModal = (taskId: string, pageIndex: number, pageType: string) => {
    versionModalPage.value = {
        taskId,
        index: pageIndex,
        label: `第${pageIndex + 1}页 (${pageType === "cover" ? "封面" : pageType === "summary" ? "总结" : "内容"})`
    };
    showVersionModal.value = true;
};

// 版本切换后刷新详情
const handleVersionSwitched = async () => {
    if (currentTaskDetail.value) {
        await loadTaskDetail(currentTaskDetail.value.id);
    }
};

onMounted(() => {
    loadTasks();
});
</script>

<template>
    <div class="space-y-6">
        <!-- 统计卡片 -->
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div class="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-sm">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm text-muted-foreground">总任务数</p>
                        <p class="mt-1 text-2xl font-bold text-foreground">{{ stats.totalTasks }}</p>
                    </div>
                    <div class="rounded-full bg-primary/10 p-3">
                        <Icon name="i-lucide-list" class="h-6 w-6 text-primary" />
                    </div>
                </div>
            </div>

            <div class="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-sm">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm text-muted-foreground">已完成</p>
                        <p class="mt-1 text-2xl font-bold text-success">{{ stats.completedTasks }}</p>
                    </div>
                    <div class="rounded-full bg-success/10 p-3">
                        <Icon name="i-lucide-check-circle" class="h-6 w-6 text-success" />
                    </div>
                </div>
            </div>

            <div class="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-sm">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm text-muted-foreground">失败任务</p>
                        <p class="mt-1 text-2xl font-bold text-error">{{ stats.failedTasks }}</p>
                    </div>
                    <div class="rounded-full bg-error/10 p-3">
                        <Icon name="i-lucide-x-circle" class="h-6 w-6 text-error" />
                    </div>
                </div>
            </div>

            <div class="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-sm">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm text-muted-foreground">成功率</p>
                        <p class="mt-1 text-2xl font-bold text-primary">{{ stats.successRate }}%</p>
                    </div>
                    <div class="rounded-full bg-primary/10 p-3">
                        <Icon name="i-lucide-trending-up" class="h-6 w-6 text-primary" />
                    </div>
                </div>
            </div>
        </div>

        <!-- 筛选区域 -->
        <div class="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-sm">
            <div class="mb-4 flex items-center justify-between">
                <h2 class="text-lg font-semibold text-foreground">筛选条件</h2>
                <UButton variant="ghost" size="sm" @click="resetFilters">重置</UButton>
            </div>

            <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <UFormField label="关键词搜索" name="keyword">
                    <UInput
                        v-model="filters.keyword"
                        placeholder="搜索主题..."
                        clearable
                        @keyup.enter="applyFilters"
                    />
                </UFormField>

                <UFormField label="状态筛选" name="status">
                    <USelectMenu
                        v-model="filters.status"
                        :items="statusOptions"
                        value-key="value"
                        label-key="label"
                        placeholder="选择状态"
                    />
                </UFormField>

                <UFormField label="开始时间" name="startDate">
                    <UInput v-model="filters.startDate" type="date" />
                </UFormField>

                <UFormField label="结束时间" name="endDate">
                    <UInput v-model="filters.endDate" type="date" />
                </UFormField>
            </div>

            <div class="mt-4 flex gap-3">
                <UButton color="primary" @click="applyFilters">应用筛选</UButton>
            </div>
        </div>

        <!-- 操作栏 -->
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
                <UCheckbox
                    :model-value="isAllSelected"
                    :indeterminate="isIndeterminate"
                    @update:model-value="(val: boolean | 'indeterminate') => toggleSelectAll(val === true)"
                >
                    全选
                </UCheckbox>
                <UButton
                    v-if="selectedTasks.length > 0"
                    color="error"
                    variant="soft"
                    size="sm"
                    :loading="isBatchDeleting"
                    @click="handleBatchDelete"
                >
                    批量删除 ({{ selectedTasks.length }})
                </UButton>
            </div>
            <div class="text-sm text-muted-foreground">
                共 {{ pagination.total }} 条记录
            </div>
        </div>

        <!-- 任务列表 -->
        <div class="rounded-3xl border border-border/60 bg-card/80 shadow-sm">
            <div v-if="loading" class="flex items-center justify-center p-12">
                <Icon name="i-lucide-loader-2" class="h-8 w-8 animate-spin text-primary" />
            </div>

            <div v-else-if="tasks.length === 0" class="flex flex-col items-center justify-center p-12">
                <Icon name="i-lucide-inbox" class="mb-4 h-12 w-12 text-muted-foreground" />
                <p class="text-muted-foreground">暂无任务记录</p>
            </div>

            <div v-else class="divide-y divide-border/60">
                <div
                    v-for="task in tasks"
                    :key="task.id"
                    class="flex items-center gap-4 p-4 transition-colors hover:bg-background/60"
                >
                    <UCheckbox
                        :model-value="selectedTasks.includes(task.id)"
                        @update:model-value="
                            (val) => {
                                if (val) {
                                    selectedTasks.push(task.id);
                                } else {
                                    selectedTasks = selectedTasks.filter((id) => id !== task.id);
                                }
                            }
                        "
                    />

                    <div
                        v-if="task.coverImageUrl"
                        class="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-border/60"
                    >
                        <img
                            :src="task.coverImageUrl"
                            :alt="task.topic"
                            class="h-full w-full object-cover"
                        />
                    </div>
                    <div
                        v-else
                        class="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted"
                    >
                        <Icon name="i-lucide-image" class="h-6 w-6 text-muted-foreground" />
                    </div>

                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                            <h3 class="truncate font-semibold text-foreground">{{ task.topic }}</h3>
                            <UBadge :color="getStatusColor(task.status)" variant="soft" size="sm">
                                {{ task.statusText }}
                            </UBadge>
                        </div>
                        <div class="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
                            <span>进度: {{ task.generatedPages }}/{{ task.totalPages }}</span>
                            <span>图片: {{ task.imageCount }} 张</span>
                            <span>{{ new Date(task.createdAt).toLocaleString() }}</span>
                        </div>
                        <div v-if="task.errorMessage" class="mt-1 text-sm text-error">
                            {{ task.errorMessage }}
                        </div>
                    </div>

                    <div class="flex items-center gap-2">
                        <UButton
                            variant="ghost"
                            size="sm"
                            :loading="loadingDetail && currentTaskDetail?.id === task.id"
                            @click="loadTaskDetail(task.id)"
                        >
                            查看详情
                        </UButton>
                        <UButton
                            variant="ghost"
                            color="error"
                            size="sm"
                            :loading="isDeleting"
                            @click="handleDelete(task.id)"
                        >
                            删除
                        </UButton>
                    </div>
                </div>
            </div>
        </div>

        <!-- 分页 -->
        <div v-if="pagination.totalPages > 1" class="flex items-center justify-between">
            <div class="flex items-center gap-2">
                <span class="text-sm text-muted-foreground">每页显示:</span>
                <USelectMenu
                    :model-value="pagination.pageSize"
                    :items="[
                        { label: '10', value: 10 },
                        { label: '20', value: 20 },
                        { label: '50', value: 50 },
                        { label: '100', value: 100 },
                    ]"
                    value-key="value"
                    label-key="label"
                    @update:model-value="handlePageSizeChange"
                />
            </div>
            <UPagination
                v-model="pagination.page"
                :total="pagination.total"
                :page-size="pagination.pageSize"
                @update:model-value="handlePageChange"
            />
        </div>

        <!-- 详情弹窗 -->
        <Teleport to="body">
            <Transition name="modal">
                <div
                    v-if="detailModalVisible"
                    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    @click.self="detailModalVisible = false"
                >
                    <div
                        class="relative max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-background shadow-2xl"
                    >
                        <!-- 关闭按钮 -->
                        <button
                            @click="detailModalVisible = false"
                            class="absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-white backdrop-blur-sm transition-all hover:bg-black/40"
                        >
                            <Icon name="i-lucide-x" class="h-5 w-5" />
                        </button>

                        <!-- 弹窗内容 -->
                        <div class="max-h-[90vh] overflow-y-auto">
                            <div class="border-b border-border/60 bg-card/80 p-6">
                                <div class="flex items-center justify-between">
                                    <div class="flex-1">
                                        <h3 class="text-xl font-semibold text-foreground">任务详情</h3>
                                        <p v-if="currentTaskDetail" class="mt-1 text-sm text-muted-foreground">
                                            {{ currentTaskDetail.topic }}
                                        </p>
                                    </div>
                                    <div class="text-xs text-muted-foreground">
                                        <span class="flex items-center gap-1">
                                            <Icon name="i-lucide-arrow-left" class="h-3 w-3" />
                                            <Icon name="i-lucide-arrow-right" class="h-3 w-3" />
                                            <span>切换</span>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div v-if="loadingDetail" class="flex items-center justify-center p-12">
                                <Icon name="i-lucide-loader-2" class="h-8 w-8 animate-spin text-primary" />
                            </div>

                            <div v-else-if="currentTaskDetail" class="space-y-6 p-6">
                                <!-- 基本信息卡片 -->
                                <div class="rounded-2xl border border-border/60 bg-card/80 p-6 shadow-sm">
                                    <h4 class="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                                        <Icon name="i-lucide-info" class="h-5 w-5" />
                                        基本信息
                                    </h4>
                                    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                                        <div class="space-y-1">
                                            <p class="text-xs font-medium text-muted-foreground">状态</p>
                                            <UBadge
                                                :color="getStatusColor(currentTaskDetail.status)"
                                                variant="soft"
                                                size="sm"
                                            >
                                                {{ currentTaskDetail.statusText }}
                                            </UBadge>
                                        </div>
                                        <div class="space-y-1">
                                            <p class="text-xs font-medium text-muted-foreground">进度</p>
                                            <p class="text-sm font-medium">
                                                {{ currentTaskDetail.generatedPages }}/{{ currentTaskDetail.totalPages }} 页
                                            </p>
                                        </div>
                                        <div class="space-y-1">
                                            <p class="text-xs font-medium text-muted-foreground">图片数量</p>
                                            <p class="text-sm font-medium">{{ currentTaskImages.length }} 张</p>
                                        </div>
                                        <div class="space-y-1">
                                            <p class="text-xs font-medium text-muted-foreground">创建时间</p>
                                            <p class="text-sm font-medium">{{ new Date(currentTaskDetail.createdAt).toLocaleString() }}</p>
                                        </div>
                                    </div>
                                    <div v-if="currentTaskDetail.errorMessage" class="mt-4 rounded-lg border border-error/20 bg-error/10 p-3">
                                        <p class="flex items-center gap-2 text-sm text-error">
                                            <Icon name="i-lucide-alert-circle" class="h-4 w-4" />
                                            <span class="font-medium">错误信息：</span>
                                            <span>{{ currentTaskDetail.errorMessage }}</span>
                                        </p>
                                    </div>
                                </div>

                                <!-- Tab 切换 -->
                                <div class="rounded-2xl border border-border/60 bg-card/80 shadow-sm">
                                    <!-- Tab 头部 -->
                                    <div class="flex items-center border-b border-border/60">
                                        <button
                                            :class="[
                                                'flex-1 px-6 py-4 text-center font-medium transition-all',
                                                activeDetailTab === 'outline'
                                                    ? 'border-b-2 border-primary text-primary bg-primary/5'
                                                    : 'text-muted-foreground hover:text-foreground hover:bg-background/60',
                                                !currentTaskDetail.outline && 'opacity-50 cursor-not-allowed'
                                            ]"
                                            :disabled="!currentTaskDetail.outline"
                                            @click="switchDetailTab('outline')"
                                        >
                                            <div class="flex items-center justify-center gap-2">
                                                <Icon name="i-lucide-file-text" class="h-4 w-4" />
                                                <span>生成大纲</span>
                                            </div>
                                        </button>
                                        <button
                                            :class="[
                                                'flex-1 px-6 py-4 text-center font-medium transition-all',
                                                activeDetailTab === 'images'
                                                    ? 'border-b-2 border-primary text-primary bg-primary/5'
                                                    : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
                                            ]"
                                            @click="switchDetailTab('images')"
                                        >
                                            <div class="flex items-center justify-center gap-2">
                                                <Icon name="i-lucide-images" class="h-4 w-4" />
                                                <span>生成图片</span>
                                                <UBadge variant="soft" size="sm" class="ml-1">
                                                    {{ currentTaskImages.length }}
                                                </UBadge>
                                            </div>
                                        </button>
                                    </div>

                                    <!-- Tab 内容 -->
                                    <div class="p-6">
                                        <!-- 大纲 Tab -->
                                        <div v-show="activeDetailTab === 'outline'">
                                            <div v-if="currentTaskDetail.outline" class="rounded-lg border border-border/60 bg-background/60 p-4">
                                                <pre class="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{{ currentTaskDetail.outline }}</pre>
                                            </div>
                                            <div v-else class="flex flex-col items-center justify-center py-12">
                                                <Icon name="i-lucide-file-x" class="mb-4 h-12 w-12 text-muted-foreground" />
                                                <p class="text-muted-foreground">暂无大纲内容</p>
                                            </div>
                                        </div>

                                        <!-- 图片 Tab -->
                                        <div v-show="activeDetailTab === 'images'">
                                            <div v-if="currentTaskImages.length === 0" class="flex flex-col items-center justify-center py-12">
                                                <Icon name="i-lucide-image-off" class="mb-4 h-12 w-12 text-muted-foreground" />
                                                <p class="text-muted-foreground">暂无图片</p>
                                            </div>
                                            <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                                <div
                                                    v-for="image in currentTaskImages"
                                                    :key="image.id"
                                                    class="group relative overflow-hidden rounded-xl border border-border/60 bg-background/60 transition-all hover:border-primary/50 hover:shadow-lg"
                                                >
                                                    <!-- 图片状态标签 -->
                                                    <div class="absolute top-2 right-2 z-10 flex items-center gap-2">
                                                        <UBadge
                                                            :color="image.status === 'completed' ? 'success' : image.status === 'failed' ? 'error' : 'warning'"
                                                            variant="soft"
                                                            size="sm"
                                                        >
                                                            {{ image.status === "completed" ? "已完成" : image.status === "failed" ? "失败" : "处理中" }}
                                                        </UBadge>
                                                    </div>

                                                    <!-- 页面信息标签 -->
                                                    <div class="absolute top-2 left-2 z-10 flex items-center gap-2">
                                                        <UBadge variant="soft" size="sm" class="bg-black/60 text-white backdrop-blur-sm">
                                                            第{{ image.pageIndex + 1 }}页
                                                        </UBadge>
                                                        <UBadge variant="soft" size="sm" class="bg-black/60 text-white backdrop-blur-sm">
                                                            {{ image.pageType === "cover" ? "封面" : image.pageType === "summary" ? "总结" : "内容" }}
                                                        </UBadge>
                                                    </div>

                                                    <!-- 图片展示 -->
                                                    <div v-if="image.imageUrl" class="relative aspect-square overflow-hidden bg-muted">
                                                        <img
                                                            :src="image.imageUrl"
                                                            :alt="image.prompt"
                                                            class="h-full w-full object-cover transition-transform group-hover:scale-105"
                                                        />
                                                    </div>
                                                    <div v-else class="flex aspect-square items-center justify-center bg-muted">
                                                        <Icon name="i-lucide-image" class="h-12 w-12 text-muted-foreground" />
                                                    </div>

                                                    <!-- 图片信息 -->
                                                    <div class="p-4">
                                                        <p class="line-clamp-2 text-sm text-foreground">{{ image.prompt }}</p>
                                                        
                                                        <!-- 版本信息和历史按钮 -->
                                                        <div class="mt-3 flex items-center justify-between border-t border-border/40 pt-3">
                                                            <span class="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                                                                <Icon name="i-lucide-layers" class="h-3.5 w-3.5" />
                                                                v{{ image.currentVersion || 1 }}
                                                            </span>
                                                            <button
                                                                v-if="(image.currentVersion || 1) > 1"
                                                                type="button"
                                                                class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                                                                @click="openVersionModal(image.taskId, image.pageIndex, image.pageType)"
                                                            >
                                                                <Icon name="i-lucide-history" class="h-3.5 w-3.5" />
                                                                版本历史
                                                            </button>
                                                        </div>
                                                        
                                                        <div v-if="image.errorMessage" class="mt-2 rounded-lg bg-error/10 p-2">
                                                            <p class="flex items-start gap-2 text-xs text-error">
                                                                <Icon name="i-lucide-alert-circle" class="mt-0.5 h-3 w-3 flex-shrink-0" />
                                                                <span>{{ image.errorMessage }}</span>
                                                            </p>
                                                        </div>
                                                        <div v-if="image.retryCount > 0" class="mt-2 text-xs text-muted-foreground">
                                                            重试次数: {{ image.retryCount }}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 底部操作栏 -->
                        <div class="border-t border-border/60 bg-card/80 p-4">
                            <div class="flex justify-end gap-3">
                                <UButton variant="ghost" @click="detailModalVisible = false">关闭</UButton>
                            </div>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>

        <!-- 版本对比弹窗 -->
        <VersionComparisonModal
            v-model:open="showVersionModal"
            :task-id="versionModalPage?.taskId || null"
            :page-index="versionModalPage?.index ?? null"
            :page-label="versionModalPage?.label"
            @version-switched="handleVersionSwitched"
        />
    </div>
</template>

<style scoped>
/* 弹窗动画 */
.modal-enter-active,
.modal-leave-active {
    transition: opacity 0.3s ease;
}

.modal-enter-active > div,
.modal-leave-active > div {
    transition: transform 0.3s ease, opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
    opacity: 0;
}

.modal-enter-from > div,
.modal-leave-to > div {
    transform: scale(0.95);
    opacity: 0;
}
</style>
