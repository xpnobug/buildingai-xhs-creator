<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

import { apiUploadFiles } from "@buildingai/service/common";

import ComposerInput from "~/components/redink/ComposerInput.vue";
import GenerateStep from "~/components/xhs/GenerateStep.vue";
import OutlineStep from "~/components/xhs/OutlineStep.vue";
import ResultStep from "~/components/xhs/ResultStep.vue";
import type { XhsPluginConfig } from "~/models";
import { apiGetXhsPluginConfig } from "~/services/xhs/config";
import { balanceApi } from "~/services/xhs/api";
import { useXhsCreatorStore } from "~/stores/xhs-creator";
import { useUserStore } from "@buildingai/stores/user";

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

const pluginConfig = ref<XhsPluginConfig>({
    pluginName: "小红书图文生成",
    coverImagePower: 80,
    contentImagePower: 40,
});

// 免费使用次数
const freeUsageInfo = ref<{
    remainingFreeCount: number;
    freeUsageLimit: number;
} | null>(null);

const highlights = computed(() => [
    {
        title: "智能大纲",
        description: "自动生成 6-9 页结构化内容，可随时编辑微调。",
        icon: "i-lucide-wand-2",
    },
    {
        title: "风格一致",
        description: "可上传参考图，保持封面与内容视觉统一。",
        icon: "i-lucide-images",
    },
    {
        title: "一键导出",
        description: "生成完成后支持批量下载，方便投放与交付。",
        icon: "i-lucide-download",
    },
]);

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

onMounted(async () => {
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

const inspirationTopics = [
    "夏季护肤",
    "杭州探店",
    "减脂食谱",
    "极简装修",
];

const handleInspirationClick = (t: string) => {
    topic.value = t;
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
</style>

<template>
    <div class="bg-background min-h-screen">
        <main class="mx-auto max-w-6xl px-4 py-10 md:py-14 lg:px-8">
            <div
                class="flex flex-wrap gap-2 md:gap-3 rounded-[24px] md:rounded-[32px] border border-border/60 bg-card/60 p-2 md:p-3 shadow-sm"
            >
                <button
                    v-for="(step, index) in steps"
                    :key="step.key"
                    class="group flex-1 min-w-[90px] md:min-w-[140px] rounded-xl md:rounded-2xl px-3 py-2 md:px-4 md:py-3 text-left transition relative overflow-hidden"
                    :class="[
                        activeTab === step.key ? 'bg-primary/10 text-primary ring-1 ring-primary/20' : 'text-muted-foreground hover:bg-muted/50',
                        !step.enabled && step.key !== 'compose' ? 'opacity-50 cursor-not-allowed' : '',
                    ]"
                    :disabled="!step.enabled && step.key !== 'compose'"
                    @click="setActiveTab(step.key as StepKey)"
                >
                    <div class="flex items-center gap-2 justify-center md:justify-start">
                        <span class="flex h-5 w-5 md:h-6 md:w-6 items-center justify-center rounded-full text-[10px] md:text-xs font-bold transition-colors"
                            :class="activeTab === step.key ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/20 text-muted-foreground group-hover:bg-muted-foreground/30'">
                            {{ index + 1 }}
                        </span>
                        <p class="text-sm font-semibold truncate">{{ step.title }}</p>
                    </div>
                    <p class="mt-1 text-xs opacity-80 hidden md:block pl-8 truncate">{{ step.description }}</p>
                </button>
            </div>

            <div class="mt-10">
                <Transition mode="out-in" name="fade">
                    <div v-if="activeTab === 'compose'" key="compose" class="space-y-10">
                    <section
                        class="relative overflow-hidden rounded-[32px] border border-border/60 bg-card/80 p-6 shadow-[0px_35px_120px_rgba(15,23,42,0.12)] lg:p-10"
                    >
                        <div class="grid gap-8 lg:grid-cols-[1.1fr,0.9fr]">
                            <div class="flex flex-col gap-4 text-center lg:text-left">
                                <p class="text-xs font-semibold uppercase tracking-[0.3em] text-primary/80">
                                    AI 图文助手
                                </p>
                                <h1 class="text-3xl font-bold text-foreground md:text-4xl">
                                    {{ pluginConfig.pluginName }}
                                </h1>
                                <p class="text-base text-muted-foreground">
                                    输入主题、上传参考图，AI 即可生成统一风格的标题、正文和封面图。适用品牌营销、内容创作与种草分享。
                                </p>
                                <div class="flex flex-wrap items-center gap-4">
                                <div class="flex flex-wrap gap-4 text-sm text-muted-foreground">
                                    <div class="rounded-2xl border border-border/60 bg-background/60 px-4 py-2">
                                        支持封面+内容多页图文
                                    </div>
                                    <div class="rounded-2xl border border-border/60 bg-background/60 px-4 py-2">
                                        并发生成，实时可视进度
                                    </div>
                                </div>
                                <button
                                    @click="navigateTo('/history')"
                                    class="ml-auto inline-flex items-center gap-2 rounded-2xl border border-border/60 bg-background/60 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-primary/10 hover:border-primary/60"
                                >
                                    <UIcon name="i-lucide-history" class="h-4 w-4" />
                                    历史记录
                                </button>
                            </div>
                            </div>
                            <div class="space-y-4">
                                <ComposerInput
                                    ref="composerRef"
                                    v-model="topic"
                                    :loading="loading"
                                    @generate="handleGenerate"
                                    @imagesChange="handleImagesChange"
                                />
                                
                                <!-- 灵感示例 -->
                                <div class="flex flex-wrap items-center gap-2">
                                    <span class="text-xs text-muted-foreground">灵感示例：</span>
                                    <button
                                        v-for="t in inspirationTopics"
                                        :key="t"
                                        @click="handleInspirationClick(t)"
                                        class="text-xs px-2.5 py-1 rounded-full bg-muted/50 border border-transparent hover:border-primary/20 hover:bg-primary/5 hover:text-primary transition-all text-muted-foreground"
                                    >
                                        {{ t }}
                                    </button>
                                </div>

                                <UAlert
                                    icon="i-lucide-info"
                                    :description="`封面图 ${pluginConfig.coverImagePower} 积分/张 · 内容图 ${pluginConfig.contentImagePower} 积分/张 · 当前余额：${userPower} 积分` + (freeUsageInfo ? ` · 免费次数：${freeUsageInfo.remainingFreeCount}/${freeUsageInfo.freeUsageLimit}` : '')"
                                    title="计费标准"
                                />
                            </div>
                        </div>
                    </section>

                    <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <article
                            v-for="card in highlights"
                            :key="card.title"
                            class="rounded-2xl border border-border/50 bg-card/80 p-5 shadow-sm"
                        >
                            <div
                                class="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"
                        >
                                <UIcon :name="card.icon" class="h-5 w-5" />
                    </div>
                            <h3 class="mb-1 text-base font-semibold text-foreground">{{ card.title }}</h3>
                            <p class="text-sm text-muted-foreground">
                                {{ card.description }}
                        </p>
                        </article>
                    </section>

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
            class="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-gradient-to-r from-[#ff2442] to-[#ff6b81] px-5 py-3 text-sm font-medium text-white shadow-xl"
        >
            <UIcon name="i-lucide-alert-circle" class="h-4 w-4" />
            {{ errorMessage }}
        </div>
    </div>
</template>
