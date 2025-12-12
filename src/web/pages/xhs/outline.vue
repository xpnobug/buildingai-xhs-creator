<script setup lang="ts">
import { onMounted, ref } from "vue";
import PageHeader from "~/components/common/PageHeader.vue";
import OutlineStep from "~/components/xhs/OutlineStep.vue";
import { useXhsCreatorStore } from "~/stores/xhs-creator";

definePageMeta({
    name: "编辑大纲",
    auth: true,
});

const route = useRoute();
const store = useXhsCreatorStore();
const isRecovering = ref(false);

// sessionStorage key for taskId persistence
const TASK_ID_KEY = "xhs-creator-current-taskId";

// 保存 taskId 到 sessionStorage
const saveTaskId = (taskId: string) => {
    if (typeof window !== "undefined") {
        sessionStorage.setItem(TASK_ID_KEY, taskId);
    }
};

// 从 sessionStorage 获取 taskId
const getSavedTaskId = (): string | null => {
    if (typeof window !== "undefined") {
        return sessionStorage.getItem(TASK_ID_KEY);
    }
    return null;
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
            // 恢复成功后保存到 sessionStorage
            saveTaskId(taskId);
        } catch (error) {
            console.error("恢复任务数据失败:", error);
            // 恢复失败则返回首页
            navigateTo("/");
        } finally {
            isRecovering.value = false;
        }
    } else if (store.taskId) {
        // 如果 store 中已有 taskId，保存到 sessionStorage
        saveTaskId(store.taskId);
    }
});

const handleBack = () => {
    navigateTo("/");
};

const handleStartGeneration = () => {
    // 保存 taskId 到 sessionStorage
    if (store.taskId) {
        saveTaskId(store.taskId);
    }
    navigateTo("/xhs/generate");
};

const handleCompleted = () => {
    // 保存 taskId 到 sessionStorage
    if (store.taskId) {
        saveTaskId(store.taskId);
    }
    navigateTo("/xhs/result");
};
</script>

<template>
    <div class="bg-background min-h-screen">
        <div class="mx-auto max-w-6xl px-4 py-4 lg:px-8">
            <!-- 统一的页面头部 -->
            <PageHeader 
                title="编辑大纲" 
                back-text="返回首页"
                @back="handleBack"
            />
            
            <OutlineStep 
                @back="handleBack" 
                @start-generate="handleStartGeneration" 
                @completed="handleCompleted"
            />
        </div>
    </div>
</template>
