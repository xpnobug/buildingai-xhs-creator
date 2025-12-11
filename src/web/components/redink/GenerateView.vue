<script lang="ts" setup>
import { computed } from "vue";
import type { GenerateState } from "../../models";

const props = defineProps<{
    state: GenerateState;
}>();

const emit = defineEmits<{
    (e: "complete"): void;
}>();

const progressPercent = computed(() => props.state.progress);
const isGenerating = computed(() => props.state.isGenerating);
const hasFailedImages = computed(() => Object.values(props.state.failed).length > 0);
const failedCount = computed(() => Object.values(props.state.failed).length);

const getStatusText = (status: string) => {
    const texts: Record<string, string> = {
        generating: '生成中',
        done: '已完成',
        error: '失败',
        retrying: '重试中',
        starting: '准备中'
    };
    return texts[status] || '等待中';
};
</script>

<template>
    <div class="generate-view h-full flex flex-col items-center justify-center p-8">
        <div class="w-full max-w-2xl text-center">
            <div class="mb-8">
                <h2 class="text-2xl font-bold text-gray-800 dark:text-white mb-2">
                    <span v-if="isGenerating">正在生成图片...</span>
                    <span v-else-if="hasFailedImages">{{ failedCount }} 张图片生成失败</span>
                    <span v-else>生成完成！</span>
                </h2>
                <p class="text-gray-500">AI 正在根据你的大纲绘制精美配图</p>
            </div>

            <!-- 进度条 -->
            <div class="bg-gray-100 dark:bg-gray-800 rounded-full h-4 w-full overflow-hidden mb-4 relative">
                <div 
                    class="h-full bg-[#ff2442] transition-all duration-300 ease-out relative overflow-hidden"
                    :style="{ width: progressPercent + '%' }"
                >
                    <div class="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]"></div>
                </div>
            </div>
            <div class="flex justify-between text-sm text-gray-500 mb-12">
                <span>{{ state.currentStep }}</span>
                <span class="font-medium text-[#ff2442]">{{ Math.round(progressPercent) }}%</span>
            </div>

            <!-- 状态卡片网格 -->
            <div class="grid grid-cols-4 gap-4">
                <div 
                    v-for="(status, pageIdx) in state.images" 
                    :key="pageIdx"
                    class="aspect-[3/4] rounded-lg border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col items-center justify-center p-2 relative overflow-hidden"
                >
                    <template v-if="status === 'done'">
                        <div class="absolute inset-0 bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                            <UIcon name="i-lucide-check-circle" class="w-8 h-8 text-green-500" />
                        </div>
                    </template>
                    <template v-else-if="status === 'error'">
                        <div class="absolute inset-0 bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                            <UIcon name="i-lucide-alert-circle" class="w-8 h-8 text-red-500" />
                        </div>
                    </template>
                    <template v-else>
                        <UIcon name="i-lucide-loader-2" class="w-6 h-6 text-[#ff2442] animate-spin mb-2" />
                        <span class="text-xs text-gray-400">{{ getStatusText(status) }}</span>
                    </template>
                    
                    <div class="absolute bottom-2 left-2 text-[10px] text-gray-400">P{{ Number(pageIdx) + 1 }}</div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
@keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
}
</style>
