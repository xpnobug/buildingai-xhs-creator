<script setup lang="ts">
import { onMounted, ref } from "vue";
import PageHeader from "~/components/common/PageHeader.vue";
import ResultStep from "~/components/xhs/ResultStep.vue";
import { useXhsCreatorStore } from "~/stores/xhs-creator";

definePageMeta({
    name: "生成结果",
    auth: true,
});

const route = useRoute();
const store = useXhsCreatorStore();
const isRecovering = ref(false);

// sessionStorage key for taskId persistence
const TASK_ID_KEY = "xhs-creator-current-taskId";

// 从 sessionStorage 获取 taskId
const getSavedTaskId = (): string | null => {
    if (typeof window !== "undefined") {
        return sessionStorage.getItem(TASK_ID_KEY);
    }
    return null;
};

// 清除 sessionStorage 中的 taskId
const clearSavedTaskId = () => {
    if (typeof window !== "undefined") {
        sessionStorage.removeItem(TASK_ID_KEY);
    }
};

// 页面加载时检查是否需要恢复状态
onMounted(async () => {
    // 优先从 URL query 获取，其次从 sessionStorage 获取
    const taskIdFromQuery = route.query.taskId as string;
    const taskIdFromStorage = getSavedTaskId();
    const taskId = taskIdFromQuery || taskIdFromStorage;
    
    if (taskId && !store.taskId) {
        isRecovering.value = true;
        try {
            await store.loadTask(taskId);
        } catch (error) {
            console.error("恢复任务数据失败:", error);
            // 恢复失败则返回首页
            navigateTo("/");
        } finally {
            isRecovering.value = false;
        }
    }
});

const handleBack = () => {
    navigateTo("/");
};

const handleRestart = () => {
    // 重新开始时清除 sessionStorage 中的 taskId
    clearSavedTaskId();
    navigateTo("/");
};
</script>

<template>
    <div class="bg-background min-h-screen">
        <div class="mx-auto max-w-6xl px-4 py-4 lg:px-8">
            <!-- 统一的页面头部 -->
            <PageHeader 
                title="生成结果" 
                back-text="返回首页"
                @back="handleBack"
            />
            
            <ResultStep @restart="handleRestart" />
        </div>
    </div>
</template>
