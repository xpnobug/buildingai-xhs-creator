<script setup lang="ts">
/**
 * 重试确认组件
 * 提供统一的失败重试交互体验
 */
import { computed } from "vue";

interface Props {
    /** 是否显示 */
    visible: boolean;
    /** 失败项数量 */
    failedCount: number;
    /** 总项数 */
    totalCount: number;
    /** 重试所需积分 */
    retryPower?: number;
    /** 是否正在重试 */
    isRetrying?: boolean;
    /** 错误信息列表 */
    errors?: Array<{ index: number; message: string }>;
}

interface Emits {
    (e: "retry"): void;
    (e: "retry-all"): void;
    (e: "skip"): void;
    (e: "close"): void;
}

const props = withDefaults(defineProps<Props>(), {
    retryPower: 0,
    isRetrying: false,
    errors: () => [],
});

const emit = defineEmits<Emits>();

const successCount = computed(() => props.totalCount - props.failedCount);
const successRate = computed(() => 
    Math.round((successCount.value / props.totalCount) * 100)
);
</script>

<template>
    <div
        v-if="visible"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        @click.self="$emit('close')"
    >
        <div class="mx-4 w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl">
            <!-- 标题 -->
            <div class="mb-4 flex items-center gap-3">
                <div class="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#ff2442]/20 to-[#ff6b81]/20">
                    <svg class="h-6 w-6 text-[#ff2442]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <div>
                    <h3 class="text-lg font-semibold text-foreground">部分生成失败</h3>
                    <p class="text-sm text-muted-foreground">
                        成功 {{ successCount }}/{{ totalCount }} ({{ successRate }}%)
                    </p>
                </div>
            </div>

            <!-- 失败详情 -->
            <div v-if="errors.length > 0" class="mb-4 max-h-32 overflow-auto rounded-lg bg-muted/50 p-3">
                <div v-for="error in errors" :key="error.index" class="mb-1 text-sm">
                    <span class="text-red-400">页面 {{ error.index + 1 }}:</span>
                    <span class="text-muted-foreground">{{ error.message }}</span>
                </div>
            </div>

            <!-- 积分提示 -->
            <div v-if="retryPower > 0" class="mb-4 rounded-lg bg-primary/10 p-3 text-center text-sm">
                重试失败项需消耗 <span class="font-semibold text-primary">{{ retryPower }}</span> 积分
            </div>

            <!-- 操作按钮 -->
            <div class="flex flex-col gap-2">
                <button
                    class="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    :disabled="isRetrying"
                    @click="$emit('retry')"
                >
                    <svg v-if="isRetrying" class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    {{ isRetrying ? "重试中..." : `重试失败项 (${failedCount}张)` }}
                </button>

                <button
                    class="w-full rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-muted"
                    :disabled="isRetrying"
                    @click="$emit('skip')"
                >
                    跳过，继续使用
                </button>
            </div>
        </div>
    </div>
</template>
