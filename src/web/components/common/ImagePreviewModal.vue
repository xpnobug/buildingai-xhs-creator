<script setup lang="ts">
import { computed, watch, ref } from "vue";

interface Props {
    /** 图片URL */
    src: string | null;
    /** 是否显示 */
    open: boolean;
    /** 图片描述/标题 */
    alt?: string;
}

interface Emits {
    (e: "update:open", value: boolean): void;
    (e: "close"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const message = useMessage();

// 缩放比例
const scale = ref(1);
const minScale = 0.5;
const maxScale = 3;

const isModalOpen = computed({
    get: () => props.open,
    set: (value) => emit("update:open", value),
});

// 关闭弹窗
const closeModal = () => {
    isModalOpen.value = false;
    scale.value = 1; // 重置缩放
    emit("close");
};

// 缩放控制
const zoomIn = () => {
    if (scale.value < maxScale) {
        scale.value = Math.min(scale.value + 0.25, maxScale);
    }
};

const zoomOut = () => {
    if (scale.value > minScale) {
        scale.value = Math.max(scale.value - 0.25, minScale);
    }
};

const resetZoom = () => {
    scale.value = 1;
};

// 下载图片
const isDownloading = ref(false);

const downloadImage = async () => {
    if (!props.src || isDownloading.value) return;
    
    try {
        isDownloading.value = true;
        
        const response = await fetch(props.src);
        if (!response.ok) {
            throw new Error(`下载失败: ${response.status}`);
        }
        
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = props.alt || "image.png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(blobUrl);
        message.success("下载成功");
    } catch (error) {
        console.error("下载图片失败:", error);
        message.error("下载失败，请稍后重试");
    } finally {
        isDownloading.value = false;
    }
};

// 键盘事件处理
const handleKeydown = (event: KeyboardEvent) => {
    if (!props.open) return;
    
    switch (event.key) {
        case "Escape":
            closeModal();
            break;
        case "+":
        case "=":
            zoomIn();
            break;
        case "-":
            zoomOut();
            break;
        case "0":
            resetZoom();
            break;
    }
};

// 监听键盘事件
watch(
    () => props.open,
    (visible) => {
        if (visible) {
            document.addEventListener("keydown", handleKeydown);
            // 禁止滚动
            document.body.style.overflow = "hidden";
        } else {
            document.removeEventListener("keydown", handleKeydown);
            document.body.style.overflow = "";
        }
    },
);
</script>

<template>
    <!-- 图片预览弹窗 -->
    <Teleport to="body">
        <Transition name="fade">
            <div
                v-if="isModalOpen && src"
                class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm"
                @click.self="closeModal"
            >
                <!-- 顶部工具栏 -->
                <div class="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4">
                    <!-- 左侧：图片信息 -->
                    <div class="text-white/80 text-sm truncate max-w-[50%]">
                        {{ alt || "图片预览" }}
                    </div>
                    
                    <!-- 右侧：操作按钮 -->
                    <div class="flex items-center gap-2">
                        <!-- 缩放控制 -->
                        <div class="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5">
                            <button
                                @click="zoomOut"
                                :disabled="scale <= minScale"
                                class="p-1 rounded-full hover:bg-white/20 transition-colors disabled:opacity-40"
                                title="缩小 (-)"
                            >
                                <UIcon name="i-lucide-minus" class="h-4 w-4 text-white" />
                            </button>
                            <span class="text-white text-xs min-w-[3rem] text-center">
                                {{ Math.round(scale * 100) }}%
                            </span>
                            <button
                                @click="zoomIn"
                                :disabled="scale >= maxScale"
                                class="p-1 rounded-full hover:bg-white/20 transition-colors disabled:opacity-40"
                                title="放大 (+)"
                            >
                                <UIcon name="i-lucide-plus" class="h-4 w-4 text-white" />
                            </button>
                            <button
                                @click="resetZoom"
                                class="p-1 rounded-full hover:bg-white/20 transition-colors ml-1"
                                title="重置 (0)"
                            >
                                <UIcon name="i-lucide-maximize-2" class="h-4 w-4 text-white" />
                            </button>
                        </div>
                        
                        <!-- 下载按钮 -->
                        <button
                            @click="downloadImage"
                            :disabled="isDownloading"
                            class="flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm text-white hover:bg-white/20 transition-colors disabled:opacity-50"
                        >
                            <UIcon 
                                :name="isDownloading ? 'i-lucide-loader-2' : 'i-lucide-download'" 
                                class="h-4 w-4"
                                :class="{ 'animate-spin': isDownloading }"
                            />
                            {{ isDownloading ? "下载中..." : "下载" }}
                        </button>
                        
                        <!-- 关闭按钮 -->
                        <button
                            @click="closeModal"
                            class="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                            title="关闭 (Esc)"
                        >
                            <UIcon name="i-lucide-x" class="h-5 w-5" />
                        </button>
                    </div>
                </div>

                <!-- 图片容器 -->
                <div class="relative max-h-[85vh] max-w-[90vw] overflow-auto">
                    <img
                        :src="src"
                        :alt="alt || '预览图片'"
                        class="block max-h-[85vh] max-w-[90vw] object-contain transition-transform duration-200"
                        :style="{ transform: `scale(${scale})` }"
                        @click.stop
                    />
                </div>

                <!-- 底部提示 -->
                <div class="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-xs">
                    按 ESC 关闭 · 滚轮缩放 · +/- 调整大小
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

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
