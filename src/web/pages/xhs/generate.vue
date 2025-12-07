<script setup lang="ts">
import GenerateStep from "~/components/xhs/GenerateStep.vue";

definePageMeta({
    name: "生成图片",
    auth: true,
});

const handleBack = () => {
    navigateTo("/xhs/outline");
};

const handleCompleted = () => {
    navigateTo("/xhs/result");
};
</script>

<template>
    <div class="bg-background min-h-screen">
        <div class="mx-auto max-w-6xl px-4 py-8 lg:px-8">
            <GenerateStep active @back="handleBack" @completed="handleCompleted" />
        </div>
    </div>
</template>
