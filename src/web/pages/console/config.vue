<script setup lang="ts">
import { defineAsyncComponent, onMounted, reactive } from "vue";

import type { AiModel } from "@buildingai/service/webapi/ai-conversation";

import type { XhsConfig } from "~/models";
import { apiGetXhsConfig, apiUpdateXhsConfig } from "~/services/console/config";

const message = useMessage();

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
    createdAt: "",
    updatedAt: "",
});

// 与主页对话页面保持一致的模型选择交互
// 使用相对路径引入主应用下的 ModelSelect 组件
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
            <section class="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-sm">
                <div class="mb-4 flex items-center justify-between">
                    <div>
                        <h2 class="text-lg font-semibold text-foreground">基础信息</h2>
                        <p class="text-sm text-muted-foreground">
                            设置插件名称与密钥池，方便在用户端展示
                        </p>
                    </div>
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                    <UFormField label="插件名称" name="pluginName" required>
                        <UInput v-model="formData.pluginName" placeholder="小红书图文生成" />
                    </UFormField>

                    <UFormField
                        label="文本生成模型"
                        name="textModel"
                        required
                        class="md:col-span-2"
                    >
                        <div class="space-y-3">
                            <ModelSelect
                                v-model="formData.textModelId"
                                :supportedModelTypes="['llm']"
                                :show-billingRule="true"
                                :defaultSelected="false"
                                placeholder="选择文本生成模型"
                                @change="handleTextModelChange"
                            />
                            <p class="text-xs text-muted-foreground">
                                与首页对话页共用模型列表与计费信息，来源于系统 AI 供应商配置
                            </p>
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
                            <p class="text-xs text-muted-foreground">
                                建议选择支持多模态/图像生成功能的模型，交互体验与对话页保持一致
                            </p>
                        </div>
                    </UFormField>

                    <UFormField
                        label="图片生成端点类型"
                        name="imageEndpointType"
                        required
                        class="md:col-span-2"
                    >
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
                                <strong>images:</strong> 适用于 DALL-E 等专门的图片生成模型（默认）<br />
                                <strong>chat:</strong> 适用于 Gemini、Claude 等支持图片生成的多模态模型<br />
                                <strong>custom:</strong> 适用于其他非标准 API，需要填写自定义端点URL
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
                        <p class="mt-2 text-xs text-muted-foreground">
                            填写完整的图片生成API端点URL，系统将使用 POST 方法发送请求
                        </p>
                    </UFormField>
                </div>
            </section>

            <section class="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-sm">
                <div class="mb-4 flex items-center justify-between">
                    <div>
                        <h2 class="text-lg font-semibold text-foreground">计费配置</h2>
                        <p class="text-sm text-muted-foreground">
                            设置封面图与内容图的积分消耗，单位：积分/张
                        </p>
                    </div>
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                    <div class="rounded-2xl border border-border/60 bg-background/60 p-4">
                        <h3 class="text-base font-semibold text-foreground">封面图</h3>
                        <p class="mb-3 text-sm text-muted-foreground">
                            建议设置为内容图的 1.5~2 倍，体现封面设计成本
                        </p>
                        <UInput
                            v-model.number="formData.coverImagePower"
                            type="number"
                            :min="POWER_LIMITS.MIN"
                            :max="POWER_LIMITS.MAX"
                            placeholder="积分/张"
                            size="lg"
                        >
                            <template #trailing>
                                <span class="text-xs text-muted-foreground">积分</span>
                            </template>
                        </UInput>
                    </div>

                    <div class="rounded-2xl border border-border/60 bg-background/60 p-4">
                        <h3 class="text-base font-semibold text-foreground">内容图</h3>
                        <p class="mb-3 text-sm text-muted-foreground">
                            建议保持合理区间，避免用户一次生成过多页面
                        </p>
                        <UInput
                            v-model.number="formData.contentImagePower"
                            type="number"
                            :min="POWER_LIMITS.MIN"
                            :max="POWER_LIMITS.MAX"
                            placeholder="积分/张"
                            size="lg"
                        >
                            <template #trailing>
                                <span class="text-xs text-muted-foreground">积分</span>
                            </template>
                        </UInput>
                    </div>
                </div>

                <UAlert
                    class="mt-4"
                    icon="i-lucide-info"
                    title="当前计费标准"
                    :description="`大纲生成：${formData.outlinePower} 积分/次，封面图：${formData.coverImagePower} 积分/张，内容图：${formData.contentImagePower} 积分/张`"
                />
            </section>

            <section class="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-sm">
                <div class="mb-4 flex items-center justify-between">
                    <div>
                        <h2 class="text-lg font-semibold text-foreground">免费使用配置</h2>
                        <p class="text-sm text-muted-foreground">
                            设置每位用户的免费使用次数，大纲生成和图片生成共用免费额度
                        </p>
                    </div>
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                    <div class="rounded-2xl border border-border/60 bg-background/60 p-4">
                        <h3 class="text-base font-semibold text-foreground">大纲生成积分</h3>
                        <p class="mb-3 text-sm text-muted-foreground">
                            每次生成大纲消耗的积分
                        </p>
                        <UInput
                            v-model.number="formData.outlinePower"
                            type="number"
                            :min="0"
                            :max="POWER_LIMITS.MAX"
                            placeholder="积分/次"
                            size="lg"
                        >
                            <template #trailing>
                                <span class="text-xs text-muted-foreground">积分</span>
                            </template>
                        </UInput>
                    </div>

                    <div class="rounded-2xl border border-border/60 bg-background/60 p-4">
                        <h3 class="text-base font-semibold text-foreground">免费使用次数</h3>
                        <p class="mb-3 text-sm text-muted-foreground">
                            每位用户免费使用的次数（大纲+图片共用）
                        </p>
                        <UInput
                            v-model.number="formData.freeUsageLimit"
                            type="number"
                            :min="0"
                            :max="1000"
                            placeholder="免费次数"
                            size="lg"
                        >
                            <template #trailing>
                                <span class="text-xs text-muted-foreground">次</span>
                            </template>
                        </UInput>
                    </div>
                </div>

                <UAlert
                    class="mt-4"
                    icon="i-lucide-gift"
                    color="success"
                    title="免费额度说明"
                    :description="`每位新用户可免费使用 ${formData.freeUsageLimit} 次，大纲生成和图片生成共用此额度`"
                />
            </section>

            <section class="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-sm">
                <div class="mb-4 flex items-center justify-between">
                    <div>
                        <h2 class="text-lg font-semibold text-foreground">性能与开发</h2>
                        <p class="text-sm text-muted-foreground">
                            可选择顺序生成或高并发生成图片,高并发模式速度更快,但对模型 QPS 和配额要求更高
                        </p>
                    </div>
                </div>

                <div class="space-y-4">
                    <h3 class="text-base font-semibold text-foreground">图片生成模式</h3>
                    
                    <div class="grid gap-3 md:grid-cols-2">
                        <!-- 顺序生成模式 -->
                        <div
                            class="relative cursor-pointer rounded-2xl border-2 p-4 transition-all"
                            :class="
                                !formData.highConcurrency
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border/60 bg-background/60 hover:border-border'
                            "
                            @click="formData.highConcurrency = false"
                        >
                            <div class="flex items-start gap-3">
                                <div
                                    class="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all"
                                    :class="
                                        !formData.highConcurrency
                                            ? 'border-primary bg-primary'
                                            : 'border-border'
                                    "
                                >
                                    <div
                                        v-if="!formData.highConcurrency"
                                        class="h-2 w-2 rounded-full bg-white"
                                    ></div>
                                </div>
                                <div class="flex-1">
                                    <h4 class="font-semibold text-foreground">顺序生成</h4>
                                    <p class="mt-1 text-sm text-muted-foreground">
                                        封面生成后，依次生成内容页图片。适合 API 配额有限的场景，对 QPS
                                        要求较低。
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- 高并发生成模式 -->
                        <div
                            class="relative cursor-pointer rounded-2xl border-2 p-4 transition-all"
                            :class="
                                formData.highConcurrency
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border/60 bg-background/60 hover:border-border'
                            "
                            @click="formData.highConcurrency = true"
                        >
                            <div class="flex items-start gap-3">
                                <div
                                    class="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all"
                                    :class="
                                        formData.highConcurrency
                                            ? 'border-primary bg-primary'
                                            : 'border-border'
                                    "
                                >
                                    <div
                                        v-if="formData.highConcurrency"
                                        class="h-2 w-2 rounded-full bg-white"
                                    ></div>
                                </div>
                                <div class="flex-1">
                                    <h4 class="font-semibold text-foreground">
                                        高并发生成
                                        <span class="ml-2 text-xs text-primary">⚡ 推荐</span>
                                    </h4>
                                    <p class="mt-1 text-sm text-muted-foreground">
                                        封面生成后，<b>并行</b>生成所有内容页图片。速度更快，需要充足的
                                        QPS 配额和后端资源。
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <UAlert
                        v-if="formData.highConcurrency"
                        icon="i-lucide-zap"
                        color="warning"
                        title="高并发模式已启用"
                        description="图片将并行生成,请确保 API 配额充足"
                    />
                    <UAlert
                        v-else
                        icon="i-lucide-clock"
                        color="info"
                        title="顺序生成模式"
                        description="图片将依次生成,生成时间较长但对资源要求较低"
                    />
                </div>
            </section>

            <div class="flex gap-3">
                <UButton
                    type="submit"
                    color="primary"
                    size="lg"
                    :loading="saving"
                    :disabled="loading"
                >
                    {{ saving ? "保存中..." : "保存配置" }}
                </UButton>
            </div>
        </UForm>
    </div>
</template>
