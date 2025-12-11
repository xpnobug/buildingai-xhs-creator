<script lang="ts" setup>
import { ref } from "vue";
import type { HistoryRecord } from "../../models";

const props = defineProps<{
    record: HistoryRecord;
}>();

const emit = defineEmits<{
    (e: "restart"): void;
}>();

const regeneratingIndex = ref<number | null>(null);

const viewImage = (url: string) => {
    window.open(url, '_blank');
};

const downloadOne = (url: string, index: number) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `rednote_page_${index + 1}.png`;
    link.click();
};

const downloadAll = () => {
    // 模拟批量下载
    props.record.images.generated.forEach((url, index) => {
        setTimeout(() => {
            downloadOne(url, index);
        }, index * 300);
    });
};

const handleRegenerate = (index: number) => {
    // 模拟重绘
    regeneratingIndex.value = index;
    setTimeout(() => {
        regeneratingIndex.value = null;
        // 这里应该调用 API 更新图片
        console.log("Regenerated image at index", index);
    }, 2000);
};
</script>

<template>
    <div class="result-view h-full flex flex-col">
        <div class="header mb-6 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-900 z-10 py-4 border-b border-gray-100 dark:border-gray-800">
            <div>
                <h2 class="text-xl font-bold text-gray-800 dark:text-white">创作完成</h2>
                <p class="text-sm text-gray-500 mt-1">恭喜！你的小红书图文已生成完毕，共 {{ record.images.generated.length }} 张</p>
            </div>
            <div class="flex gap-3">
                <button @click="$emit('restart')" class="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-300">
                    再来一篇
                </button>
                <button @click="downloadAll" class="px-4 py-2 bg-[#ff2442] hover:bg-[#e01f3a] text-white rounded-lg transition-colors flex items-center gap-2">
                    <UIcon name="i-lucide-download" class="w-4 h-4" />
                    一键下载
                </button>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
            <div 
                v-for="(url, index) in record.images.generated" 
                :key="index"
                class="image-card group bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm hover:shadow-md transition-all"
            >
                <!-- Image Area -->
                <div 
                    class="relative aspect-[3/4] overflow-hidden cursor-pointer" 
                    @click="viewImage(url)"
                >
                    <img
                        :src="url"
                        :alt="`第 ${index + 1} 页`"
                        class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    
                    <!-- Regenerating Overlay -->
                    <div v-if="regeneratingIndex === index" class="absolute inset-0 bg-white/80 dark:bg-gray-900/80 flex flex-col items-center justify-center z-10">
                        <UIcon name="i-lucide-loader-2" class="w-6 h-6 text-[#ff2442] animate-spin mb-2" />
                        <span class="text-xs text-[#ff2442] font-medium">重绘中...</span>
                    </div>
                    
                    <!-- Hover Overlay -->
                    <div v-else class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-medium">
                        预览大图
                    </div>
                </div>
                
                <!-- Action Bar -->
                <div class="p-3 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-gray-800">
                    <span class="text-xs text-gray-400">Page {{ index + 1 }}</span>
                    <div class="flex gap-2">
                        <button 
                            class="text-gray-400 hover:text-[#ff2442] transition-colors p-1"
                            title="重新生成此图"
                            @click.stop="handleRegenerate(index)"
                            :disabled="regeneratingIndex === index"
                        >
                            <UIcon name="i-lucide-refresh-cw" class="w-4 h-4" :class="{ 'animate-spin': regeneratingIndex === index }" />
                        </button>
                        <button 
                            class="text-gray-400 hover:text-[#ff2442] transition-colors p-1"
                            title="下载"
                            @click.stop="downloadOne(url, index)"
                        >
                            <UIcon name="i-lucide-download" class="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Scoped styles if needed */
</style>
