<script setup lang="ts">
/**
 * 延迟渲染组件（原 LazyLoad）
 * 延迟加载重型组件，优化首屏性能
 * 注意：避免使用 "Lazy" 前缀，因为 Nuxt 将其保留用于动态导入
 */
import { defineAsyncComponent, ref, onMounted } from "vue";

interface Props {
    /** 延迟加载时间（毫秒） */
    delay?: number;
    /** 是否立即加载 */
    immediate?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    delay: 100,
    immediate: false,
});

const shouldLoad = ref(props.immediate);

onMounted(() => {
    if (!props.immediate) {
        setTimeout(() => {
            shouldLoad.value = true;
        }, props.delay);
    }
});
</script>

<template>
    <template v-if="shouldLoad">
        <slot />
    </template>
    <template v-else>
        <slot name="loading">
            <div class="flex items-center justify-center p-8">
                <div class="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
        </slot>
    </template>
</template>
