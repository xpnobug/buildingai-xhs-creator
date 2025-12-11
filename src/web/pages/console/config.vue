<script setup lang="ts">
import { defineAsyncComponent, onMounted, reactive } from "vue";

import type { AiModel } from "@buildingai/service/webapi/ai-conversation";
import { apiUploadFiles } from "@buildingai/service/common";

import type { XhsConfig } from "~/models";
import { apiGetXhsConfig, apiUpdateXhsConfig } from "~/services/console/config";

const message = useMessage();
const fileInputs = ref<(HTMLInputElement | null)[]>([]);
const uploadLoading = ref<Record<number, boolean>>({});

const triggerFileInput = (index: number) => {
    fileInputs.value[index]?.click();
};

const handleImageUpload = async (event: Event, index: number) => {
    const target = event.target as HTMLInputElement;
    const files = target.files;
    if (!files || !files.length) return;

    const file = files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        message.warning("请上传图片文件");
        return;
    }

    try {
        uploadLoading.value[index] = true;
        const result = await apiUploadFiles({
            files: [file],
            extensionId: "buildingai-xhs-creator",
        });

        if (result && result[0]) {
            if (!formData.quickStartTemplates) {
                formData.quickStartTemplates = [];
            }
            if (formData.quickStartTemplates[index]) {
                formData.quickStartTemplates[index].image = result[0].url;
                message.success("上传成功");
            }
        }
    } catch (error) {
        console.error("Upload failed:", error);
        message.error("上传失败");
    } finally {
        uploadLoading.value[index] = false;
        if (target) target.value = "";
    }
};

const POWER_LIMITS = {
    MIN: 1,
    MAX: 10000,
} as const;

type XhsConfigForm = Omit<XhsConfig, "textModelId" | "imageModelId"> & {
    textModelId: string;
    imageModelId: string;
    imageEndpointType: "images" | "chat" | "custom";
};

const formData = reactive<XhsConfigForm>({
    id: "",
    pluginName: "小红书图文生成",
    coverImagePower: 80,
    contentImagePower: 40,
    outlinePower: 10,
    freeUsageLimit: 5,
    textModel: "",
    textModelId: "",
    imageModel: "",
    imageModelId: "",
    imageEndpointType: "images",
    imageEndpointUrl: null,
    highConcurrency: false,
    homeTitle: "今天想在无限画布创作什么？",
    quickStartTemplates: [],
    outlinePrompt: null,
    imagePrompt: null,
    createdAt: "",
    updatedAt: "",
});

// @ts-ignore: 路径在 Nuxt 层合并后可解析
const ModelSelect = defineAsyncComponent(
    () => import("../../../../../../packages/web/buildingai-ui/app/components/model-select.vue"),
);

const { lockFn: loadConfig, isLock: loading } = useLockFn(async () => {
    try {
        const config = await apiGetXhsConfig();
        Object.assign(formData, {
            ...config,
            textModelId: config.textModelId || "",
            imageModelId: config.imageModelId || "",
            imageEndpointType: config.imageEndpointType || "images",
            imageEndpointUrl: config.imageEndpointUrl || null,
            highConcurrency: config.highConcurrency ?? false,
            outlinePower: config.outlinePower ?? 10,
            freeUsageLimit: config.freeUsageLimit ?? 5,
            homeTitle: config.homeTitle || "今天想在无限画布创作什么？",
            quickStartTemplates: config.quickStartTemplates || [],
            outlinePrompt: config.outlinePrompt || null,
            imagePrompt: config.imagePrompt || null,
        });
    } catch (error) {
        console.error("加载配置失败:", error);
        message.error("加载配置失败");
    }
});

const { lockFn: saveConfig, isLock: saving } = useLockFn(async () => {
    if (!formData.pluginName.trim()) {
        message.error("插件名称不能为空");
        return;
    }

    if (!formData.textModelId?.trim()) {
        message.error("请选择文本生成模型");
        return;
    }

    if (!formData.imageModelId?.trim()) {
        message.error("请选择图片生成模型");
        return;
    }

    const outOfRange = (value: number) =>
        !value || value < POWER_LIMITS.MIN || value > POWER_LIMITS.MAX;

    if (outOfRange(formData.coverImagePower) || outOfRange(formData.contentImagePower)) {
        message.error(`积分配置需在 ${POWER_LIMITS.MIN}-${POWER_LIMITS.MAX} 范围内`);
        return;
    }

    if (formData.imageEndpointType === "custom" && !formData.imageEndpointUrl?.trim()) {
        message.error("自定义端点类型需要填写端点URL");
        return;
    }

    try {
        await apiUpdateXhsConfig(formData.id, {
            pluginName: formData.pluginName,
            coverImagePower: formData.coverImagePower,
            contentImagePower: formData.contentImagePower,
            textModel: formData.textModel,
            textModelId: formData.textModelId || null,
            imageModel: formData.imageModel,
            imageModelId: formData.imageModelId || null,
            imageEndpointType: formData.imageEndpointType,
            imageEndpointUrl: formData.imageEndpointUrl || null,
            highConcurrency: formData.highConcurrency,
            outlinePower: formData.outlinePower,
            freeUsageLimit: formData.freeUsageLimit,
            homeTitle: formData.homeTitle,
            quickStartTemplates: formData.quickStartTemplates,
            outlinePrompt: formData.outlinePrompt,
            imagePrompt: formData.imagePrompt,
        });
        message.success("保存成功");
        await loadConfig();
    } catch (error) {
        console.error("保存配置失败:", error);
        message.error("保存失败");
    }
});

const handleTextModelChange = (model: AiModel | null) => {
    formData.textModel = model?.model || "";
};

const handleImageModelChange = (model: AiModel | null) => {
    formData.imageModel = model?.model || "";
};

onMounted(() => {
    loadConfig();
});
</script>

<template>
    <div class="space-y-6">
        <UForm :state="formData" class="space-y-6" @submit="saveConfig">
            <!-- Tab Navigation -->
            <UTabs
                :items="[
                    { label: '模型配置', slot: 'model', icon: 'i-lucide-cpu' },
                    { label: '积分配置', slot: 'billing', icon: 'i-lucide-coins' },
                    { label: '首页配置', slot: 'home', icon: 'i-lucide-home' },
                    { label: '高级设置', slot: 'advanced', icon: 'i-lucide-settings' },
                ]"
                variant="link"
                class="w-full"
            >
                <!-- Tab 1: 模型配置 -->
                <template #model>
                    <div class="pt-6 space-y-6">
                        <!-- Basic Info Card -->
                        <section class="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-sm">
                            <div class="mb-4">
                                <h2 class="text-lg font-semibold text-foreground">基本设置</h2>
                                <p class="text-sm text-muted-foreground">设置插件的基础显示信息</p>
                            </div>

                            <div class="max-w-md">
                                <UFormField label="插件名称" name="pluginName" required>
                                    <UInput v-model="formData.pluginName" placeholder="小红书图文生成" />
                                </UFormField>
                            </div>
                        </section>

                        <!-- Model Parameters Card -->
                        <section class="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-sm">
                            <div class="mb-4">
                                <h2 class="text-lg font-semibold text-foreground">模型参数</h2>
                                <p class="text-sm text-muted-foreground">配置文本和图片生成的 AI 模型及端点</p>
                            </div>

                            <div class="grid gap-6 md:grid-cols-2">
                                <UFormField label="文本生成模型" name="textModel" required class="md:col-span-2">
                                    <div class="space-y-3">
                                        <ModelSelect
                                            v-model="formData.textModelId"
                                            :supportedModelTypes="['llm']"
                                            :show-billingRule="true"
                                            :defaultSelected="false"
                                            placeholder="选择文本生成模型"
                                            @change="handleTextModelChange"
                                        />
                                        <p class="text-xs text-muted-foreground">与首页对话页共用模型列表与计费信息</p>
                                    </div>
                                </UFormField>

                                <UFormField label="图片生成模型" name="imageModel" required class="md:col-span-2">
                                    <div class="space-y-3">
                                        <ModelSelect
                                            v-model="formData.imageModelId"
                                            :supportedModelTypes="['llm']"
                                            :show-billingRule="true"
                                            :defaultSelected="false"
                                            placeholder="选择图片生成模型"
                                            @change="handleImageModelChange"
                                        />
                                        <p class="text-xs text-muted-foreground">建议选择支持多模态/图像生成功能的模型</p>
                                    </div>
                                </UFormField>

                                <UFormField label="图片生成端点类型" name="imageEndpointType" required class="md:col-span-2">
                                    <div class="space-y-3">
                                        <USelectMenu
                                            v-model="formData.imageEndpointType"
                                            :items="[
                                                { label: 'OpenAI Images API (/v1/images/generations)', value: 'images' },
                                                { label: 'Chat Completions API (/v1/chat/completions)', value: 'chat' },
                                                { label: '自定义端点', value: 'custom' },
                                            ]"
                                            value-key="value"
                                            label-key="label"
                                            placeholder="选择端点类型"
                                        />
                                        <p class="text-xs text-muted-foreground">
                                            <strong>images:</strong> 适用于 DALL-E 等专门的图片生成模型<br />
                                            <strong>chat:</strong> 适用于 Gemini、Claude 等支持图片生成的多模态模型<br />
                                            <strong>custom:</strong> 适用于其他非标准 API
                                        </p>
                                    </div>
                                </UFormField>

                                <UFormField
                                    v-if="formData.imageEndpointType === 'custom'"
                                    label="自定义端点URL"
                                    name="imageEndpointUrl"
                                    required
                                    class="md:col-span-2"
                                >
                                    <UInput
                                        v-model="formData.imageEndpointUrl"
                                        placeholder="https://api.example.com/v1/generate-image"
                                        type="url"
                                    />
                                </UFormField>
                            </div>
                        </section>
                    </div>
                </template>

                <!-- Tab 2: 积分配置 -->
                <template #billing>
                    <div class="pt-6 space-y-6">
                        <section class="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-sm">
                            <div class="mb-4">
                                <h2 class="text-lg font-semibold text-foreground">计费配置</h2>
                                <p class="text-sm text-muted-foreground">设置积分消耗，单位：积分/次</p>
                            </div>

                            <div class="grid gap-4 md:grid-cols-3">
                                <div class="rounded-2xl border border-border/60 bg-background/60 p-4">
                                    <h3 class="text-base font-semibold text-foreground">封面图</h3>
                                    <p class="mb-3 text-sm text-muted-foreground">建议设置为内容图的 1.5~2 倍</p>
                                    <UInput
                                        v-model.number="formData.coverImagePower"
                                        type="number"
                                        :min="POWER_LIMITS.MIN"
                                        :max="POWER_LIMITS.MAX"
                                        size="lg"
                                    >
                                        <template #trailing><span class="text-xs text-muted-foreground">积分</span></template>
                                    </UInput>
                                </div>

                                <div class="rounded-2xl border border-border/60 bg-background/60 p-4">
                                    <h3 class="text-base font-semibold text-foreground">内容图</h3>
                                    <p class="mb-3 text-sm text-muted-foreground">每张内容页图片消耗</p>
                                    <UInput
                                        v-model.number="formData.contentImagePower"
                                        type="number"
                                        :min="POWER_LIMITS.MIN"
                                        :max="POWER_LIMITS.MAX"
                                        size="lg"
                                    >
                                        <template #trailing><span class="text-xs text-muted-foreground">积分</span></template>
                                    </UInput>
                                </div>

                                <div class="rounded-2xl border border-border/60 bg-background/60 p-4">
                                    <h3 class="text-base font-semibold text-foreground">大纲生成</h3>
                                    <p class="mb-3 text-sm text-muted-foreground">每次生成大纲消耗</p>
                                    <UInput
                                        v-model.number="formData.outlinePower"
                                        type="number"
                                        :min="0"
                                        :max="POWER_LIMITS.MAX"
                                        size="lg"
                                    >
                                        <template #trailing><span class="text-xs text-muted-foreground">积分</span></template>
                                    </UInput>
                                </div>
                            </div>

                            <UAlert
                                class="mt-4"
                                icon="i-lucide-info"
                                title="当前计费标准"
                                :description="`大纲：${formData.outlinePower} 积分/次，封面图：${formData.coverImagePower} 积分/张，内容图：${formData.contentImagePower} 积分/张`"
                            />
                        </section>

                        <section class="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-sm">
                            <div class="mb-4">
                                <h2 class="text-lg font-semibold text-foreground">免费使用配置</h2>
                                <p class="text-sm text-muted-foreground">设置每位用户的免费使用次数</p>
                            </div>

                            <div class="rounded-2xl border border-border/60 bg-background/60 p-4 max-w-md">
                                <h3 class="text-base font-semibold text-foreground">免费使用次数</h3>
                                <p class="mb-3 text-sm text-muted-foreground">每位用户可免费使用的次数（大纲+图片共用）</p>
                                <UInput
                                    v-model.number="formData.freeUsageLimit"
                                    type="number"
                                    :min="0"
                                    :max="1000"
                                    size="lg"
                                >
                                    <template #trailing><span class="text-xs text-muted-foreground">次</span></template>
                                </UInput>
                            </div>

                            <UAlert
                                class="mt-4"
                                icon="i-lucide-gift"
                                color="success"
                                title="免费额度说明"
                                :description="`每位新用户可免费使用 ${formData.freeUsageLimit} 次`"
                            />
                        </section>
                    </div>
                </template>

                <!-- Tab 3: 首页配置 -->
                <template #home>
                    <div class="pt-6 space-y-6">
                        <!-- Title Config Card -->
                        <section class="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-sm">
                            <div class="mb-4">
                                <h2 class="text-lg font-semibold text-foreground">文案配置</h2>
                                <p class="text-sm text-muted-foreground">设置用户端首页的显示文案</p>
                            </div>

                            <div class="max-w-2xl">
                                <UFormField label="首页标题" name="homeTitle">
                                    <UInput v-model="formData.homeTitle" placeholder="今天想在无限画布创作什么？" size="lg" />
                                    <p class="mt-2 text-xs text-muted-foreground">用户端首页显示的主标题文案</p>
                                </UFormField>
                            </div>
                        </section>

                        <!-- Template Config Card -->
                        <section class="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-sm">
                            <div class="mb-4 flex items-center justify-between">
                                <div>
                                    <h2 class="text-lg font-semibold text-foreground">推荐模板</h2>
                                    <p class="text-sm text-muted-foreground">配置用户端首页的快速开始模板</p>
                                </div>
                                <UButton
                                    size="xs"
                                    variant="ghost"
                                    @click="formData.quickStartTemplates = [...(formData.quickStartTemplates || []), { title: '', image: '' }]"
                                >
                                    <UIcon name="i-lucide-plus" class="w-4 h-4 mr-1" />
                                    添加模板
                                </UButton>
                            </div>

                            <div v-if="formData.quickStartTemplates && formData.quickStartTemplates.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div
                                    v-for="(template, index) in formData.quickStartTemplates"
                                    :key="index"
                                    class="group relative flex flex-col gap-3 p-4 rounded-xl border border-border/60 bg-background/60 hover:border-primary/50 transition-colors"
                                >
                                    <div class="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <UButton
                                            size="xs"
                                            variant="ghost"
                                            color="error"
                                            @click="formData.quickStartTemplates?.splice(index, 1)"
                                        >
                                            <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
                                        </UButton>
                                    </div>

                                    <div class="space-y-3">
                                        <div
                                            class="relative w-full aspect-video rounded-lg overflow-hidden bg-muted flex items-center justify-center border border-border/40 shrink-0 cursor-pointer group/image"
                                            @click="triggerFileInput(index)"
                                        >
                                            <img v-if="template.image" :src="template.image" class="w-full h-full object-cover" alt="Preview" />
                                            <div v-else class="text-muted-foreground/40">
                                                <UIcon name="i-lucide-image" class="w-8 h-8" />
                                            </div>
                                            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover/image:opacity-100 transition-opacity flex items-center justify-center">
                                                <UIcon v-if="uploadLoading[index]" name="i-lucide-loader-2" class="w-6 h-6 text-white animate-spin" />
                                                <UIcon v-else name="i-lucide-upload" class="w-6 h-6 text-white" />
                                            </div>
                                            <input
                                                ref="fileInputs"
                                                type="file"
                                                accept="image/*"
                                                class="hidden"
                                                @change="handleImageUpload($event, index)"
                                            />
                                        </div>

                                        <div class="space-y-3">
                                            <UFormField label="标题" class="w-full">
                                                <UInput v-model="template.title" placeholder="输入模板标题" size="sm" />
                                            </UFormField>
                                            <UFormField label="图片链接" class="w-full">
                                                <UInput v-model="template.image" placeholder="https://..." size="sm" icon="i-lucide-link" />
                                            </UFormField>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div v-else class="text-center py-12 text-muted-foreground text-sm border border-dashed border-border/60 rounded-xl">
                                <UIcon name="i-lucide-layout-template" class="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p>暂无推荐模板</p>
                                <p class="text-xs opacity-70 mt-1">将使用系统默认模板，点击上方按钮添加自定义模板</p>
                            </div>
                        </section>
                    </div>
                </template>

                <!-- Tab 4: 高级设置 -->
                <template #advanced>
                    <div class="pt-6 space-y-6">
                        <!-- 提示词配置 -->
                        <section class="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-sm">
                            <div class="mb-4">
                                <h2 class="text-lg font-semibold text-foreground">提示词配置</h2>
                                <p class="text-sm text-muted-foreground">自定义大纲和图片生成的提示词模板，留空使用默认</p>
                            </div>

                            <div class="space-y-6">
                                <div class="space-y-2">
                                    <div class="flex items-center justify-between">
                                        <label class="text-sm font-medium text-foreground">大纲生成提示词</label>
                                        <UButton v-if="formData.outlinePrompt" variant="ghost" size="xs" color="neutral" @click="formData.outlinePrompt = null">
                                            恢复默认
                                        </UButton>
                                    </div>
                                    <UTextarea v-model="formData.outlinePrompt" placeholder="留空使用默认提示词。支持占位符：{topic}" :rows="6" class="font-mono text-xs" />
                                    <p class="text-xs text-muted-foreground">占位符：<code class="bg-muted px-1 rounded">{topic}</code> 用户输入的主题</p>
                                </div>

                                <div class="space-y-2">
                                    <div class="flex items-center justify-between">
                                        <label class="text-sm font-medium text-foreground">图片生成提示词</label>
                                        <UButton v-if="formData.imagePrompt" variant="ghost" size="xs" color="neutral" @click="formData.imagePrompt = null">
                                            恢复默认
                                        </UButton>
                                    </div>
                                    <UTextarea v-model="formData.imagePrompt" placeholder="留空使用默认提示词。支持占位符：{page_content}, {page_type}, {user_topic}, {full_outline}" :rows="6" class="font-mono text-xs" />
                                    <p class="text-xs text-muted-foreground">
                                        占位符：<code class="bg-muted px-1 rounded">{page_content}</code> 页面内容，
                                        <code class="bg-muted px-1 rounded">{page_type}</code> 页面类型，
                                        <code class="bg-muted px-1 rounded">{user_topic}</code> 用户主题，
                                        <code class="bg-muted px-1 rounded">{full_outline}</code> 完整大纲
                                    </p>
                                </div>
                            </div>
                        </section>

                        <!-- 性能配置 -->
                        <section class="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-sm">
                            <div class="mb-4">
                                <h2 class="text-lg font-semibold text-foreground">性能与开发</h2>
                                <p class="text-sm text-muted-foreground">高并发模式速度更快，但对 API 配额要求更高</p>
                            </div>

                            <div class="space-y-4">
                                <h3 class="text-base font-semibold text-foreground">图片生成模式</h3>

                                <div class="grid gap-3 md:grid-cols-2">
                                    <div
                                        class="relative cursor-pointer rounded-2xl border-2 p-4 transition-all"
                                        :class="!formData.highConcurrency ? 'border-primary bg-primary/5' : 'border-border/60 bg-background/60 hover:border-border'"
                                        @click="formData.highConcurrency = false"
                                    >
                                        <div class="flex items-start gap-3">
                                            <div
                                                class="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all"
                                                :class="!formData.highConcurrency ? 'border-primary bg-primary' : 'border-border'"
                                            >
                                                <div v-if="!formData.highConcurrency" class="h-2 w-2 rounded-full bg-white"></div>
                                            </div>
                                            <div class="flex-1">
                                                <h4 class="font-semibold text-foreground">顺序生成</h4>
                                                <p class="mt-1 text-sm text-muted-foreground">依次生成内容页，对 QPS 要求较低</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div
                                        class="relative cursor-pointer rounded-2xl border-2 p-4 transition-all"
                                        :class="formData.highConcurrency ? 'border-primary bg-primary/5' : 'border-border/60 bg-background/60 hover:border-border'"
                                        @click="formData.highConcurrency = true"
                                    >
                                        <div class="flex items-start gap-3">
                                            <div
                                                class="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all"
                                                :class="formData.highConcurrency ? 'border-primary bg-primary' : 'border-border'"
                                            >
                                                <div v-if="formData.highConcurrency" class="h-2 w-2 rounded-full bg-white"></div>
                                            </div>
                                            <div class="flex-1">
                                                <h4 class="font-semibold text-foreground">
                                                    高并发生成
                                                    <span class="ml-2 text-xs text-primary">⚡ 推荐</span>
                                                </h4>
                                                <p class="mt-1 text-sm text-muted-foreground">并行生成所有内容页，速度更快</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <UAlert
                                    v-if="formData.highConcurrency"
                                    icon="i-lucide-zap"
                                    color="warning"
                                    title="高并发模式已启用"
                                    description="图片将并行生成，请确保 API 配额充足"
                                />
                                <UAlert
                                    v-else
                                    icon="i-lucide-clock"
                                    color="info"
                                    title="顺序生成模式"
                                    description="图片将依次生成，生成时间较长但对资源要求较低"
                                />
                            </div>
                        </section>
                    </div>
                </template>
            </UTabs>

            <!-- Save Button (always visible) -->
            <div class="flex gap-3 pt-4 border-t border-border/40">
                <UButton type="submit" color="primary" size="lg" :loading="saving" :disabled="loading">
                    {{ saving ? "保存中..." : "保存配置" }}
                </UButton>
            </div>
        </UForm>
    </div>
</template>
