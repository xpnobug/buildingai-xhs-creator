<script setup lang="ts">
import OutlineStep from "~/components/xhs/OutlineStep.vue";

definePageMeta({
    name: "编辑大纲",
    auth: true,
});

const handleBack = () => {
    navigateTo("/");
};

const handleStartGeneration = () => {
    // 保留此方法以兼容旧逻辑，但新的生成在 OutlineStep 中直接处理
    navigateTo("/xhs/generate");
};

const handleCompleted = () => {
    navigateTo("/xhs/result");
};
</script>

<template>
    <div class="bg-background min-h-screen">
        <div class="mx-auto max-w-6xl px-4 py-8 lg:px-8">
            <OutlineStep 
                @back="handleBack" 
                @start-generate="handleStartGeneration" 
                @completed="handleCompleted"
            />
        </div>
    </div>
</template>
