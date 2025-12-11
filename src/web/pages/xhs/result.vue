<script setup lang="ts">
import ResultStep from "~/components/xhs/ResultStep.vue";

definePageMeta({
    name: "生成结果",
    auth: true,
});

const handleRestart = () => {
    navigateTo("/xhs");
};
</script>

<template>
    <div class="bg-background min-h-screen">
        <div class="mx-auto max-w-6xl px-4 py-8 lg:px-8">
            <ResultStep @restart="handleRestart" />
        </div>
    </div>
</template>
