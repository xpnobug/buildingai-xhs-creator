<script setup lang="ts">
/**
 * 任务状态徽章组件
 * 统一显示任务状态
 */
import { computed } from "vue";

interface Props {
    status?: string;
    size?: "sm" | "md" | "lg";
}

const props = withDefaults(defineProps<Props>(), {
    size: "md",
});

/** 状态文本映射 */
const statusText = computed(() => {
    switch (props.status) {
        case "pending":
            return "待处理";
        case "generating_outline":
            return "生成大纲中";
        case "outline_ready":
            return "大纲就绪";
        case "generating_images":
            return "生成图片中";
        case "completed":
            return "已完成";
        case "failed":
            return "失败";
        default:
            return props.status || "未知";
    }
});

/** 状态样式类 */
const statusClass = computed(() => {
    const base = "inline-flex items-center rounded-full font-medium";
    const sizeClass = {
        sm: "px-2 py-0.5 text-xs",
        md: "px-2.5 py-1 text-sm",
        lg: "px-3 py-1.5 text-base",
    }[props.size];

    const colorClass = (() => {
        switch (props.status) {
            case "completed":
                return "bg-green-500/20 text-green-400";
            case "failed":
                return "bg-red-500/20 text-red-400";
            case "generating_outline":
            case "generating_images":
                return "bg-yellow-500/20 text-yellow-400";
            case "outline_ready":
                return "bg-blue-500/20 text-blue-400";
            default:
                return "bg-muted text-muted-foreground";
        }
    })();

    return `${base} ${sizeClass} ${colorClass}`;
});

/** 是否显示加载动画 */
const isLoading = computed(() => {
    return props.status === "generating_outline" || props.status === "generating_images";
});
</script>

<template>
    <span :class="statusClass">
        <svg
            v-if="isLoading"
            class="mr-1.5 h-3 w-3 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
        >
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
        </svg>
        {{ statusText }}
    </span>
</template>
