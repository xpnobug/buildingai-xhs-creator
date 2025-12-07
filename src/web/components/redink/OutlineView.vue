<script lang="ts" setup>
import { ref, onMounted, nextTick } from "vue";
import type { OutlineState, Page } from "../../models";

const props = defineProps<{
    topic: string;
    initialOutline: OutlineState;
}>();

const emit = defineEmits<{
    (e: "next", outline: OutlineState): void;
    (e: "back"): void;
}>();

const pages = ref<Page[]>([]);
const dragOverIndex = ref<number | null>(null);
const draggedIndex = ref<number | null>(null);

// 如果有初始大纲，使用它
onMounted(() => {
    if (props.initialOutline && props.initialOutline.pages.length > 0) {
        pages.value = JSON.parse(JSON.stringify(props.initialOutline.pages));
    } else {
        // 默认大纲
        pages.value = [
            { index: 0, type: 'cover', content: '封面：展示主题核心' },
            { index: 1, type: 'content', content: '内容页1：介绍背景' },
            { index: 2, type: 'content', content: '内容页2：详细说明' },
            { index: 3, type: 'summary', content: '总结页：呼吁关注' },
        ];
    }
});

const getPageTypeName = (type: string) => {
    const names = {
        cover: '封面',
        content: '内容',
        summary: '总结'
    };
    return names[type as keyof typeof names] || '内容';
};

// 拖拽逻辑
const onDragStart = (e: DragEvent, index: number) => {
    draggedIndex.value = index;
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.dropEffect = 'move';
    }
};

const onDragOver = (e: DragEvent, index: number) => {
    if (draggedIndex.value === index) return;
    dragOverIndex.value = index;
};

const onDrop = (e: DragEvent, index: number) => {
    dragOverIndex.value = null;
    if (draggedIndex.value !== null && draggedIndex.value !== index) {
        const item = pages.value.splice(draggedIndex.value, 1)[0];
        if (item) {
            pages.value.splice(index, 0, item);
            // 更新索引
            pages.value.forEach((p, i) => p.index = i);
        }
    }
    draggedIndex.value = null;
};

const deletePage = (index: number) => {
    if (confirm('确定要删除这一页吗？')) {
        pages.value.splice(index, 1);
        pages.value.forEach((p, i) => p.index = i);
    }
};

const addPage = (type: 'cover' | 'content' | 'summary') => {
    pages.value.push({
        index: pages.value.length,
        type,
        content: ''
    });
    // 滚动到底部
    nextTick(() => {
        const container = document.querySelector('.outline-grid');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    });
};

const submit = () => {
    emit("next", { outline: JSON.stringify(pages.value), pages: pages.value });
};
</script>

<template>
    <div class="outline-view">
        <div class="header mb-6 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-900 z-10 py-4 border-b border-gray-100 dark:border-gray-800">
            <div>
                <h2 class="text-xl font-bold text-gray-800 dark:text-white">编辑大纲</h2>
                <p class="text-sm text-gray-500 mt-1">调整页面顺序，修改文案，打造完美内容</p>
            </div>
            <div class="flex gap-3">
                <button @click="$emit('back')" class="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-300">
                    上一步
                </button>
                <button @click="submit" class="px-4 py-2 bg-[#ff2442] hover:bg-[#e01f3a] text-white rounded-lg transition-colors flex items-center gap-2">
                    <UIcon name="i-lucide-sparkles" class="w-4 h-4" />
                    开始生成图片
                </button>
            </div>
        </div>

        <div class="outline-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
            <div 
                v-for="(page, idx) in pages" 
                :key="page.index"
                class="outline-card group bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm hover:shadow-md transition-all min-h-[300px] flex flex-col relative"
                :draggable="true"
                @dragstart="onDragStart($event, idx)"
                @dragover.prevent="onDragOver($event, idx)"
                @drop="onDrop($event, idx)"
                :class="{ 'border-dashed border-2 border-[#ff2442] opacity-80': dragOverIndex === idx }"
            >
                <!-- 顶部栏 -->
                <div class="flex justify-between items-center mb-3 pb-2 border-b border-gray-50 dark:border-gray-700">
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-bold text-gray-300">P{{ idx + 1 }}</span>
                        <span 
                            class="text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider"
                            :class="{
                                'text-red-500 bg-red-50 dark:bg-red-900/20': page.type === 'cover',
                                'text-gray-500 bg-gray-100 dark:bg-gray-700': page.type === 'content',
                                'text-green-500 bg-green-50 dark:bg-green-900/20': page.type === 'summary'
                            }"
                        >
                            {{ getPageTypeName(page.type) }}
                        </span>
                    </div>
                    
                    <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div class="cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" title="拖拽排序">
                            <UIcon name="i-lucide-grip-vertical" class="w-4 h-4" />
                        </div>
                        <button class="p-1 text-gray-400 hover:text-red-500 transition-colors" @click="deletePage(idx)" title="删除此页">
                            <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <textarea
                    v-model="page.content"
                    class="flex-1 w-full bg-transparent border-none resize-none focus:ring-0 p-0 text-gray-700 dark:text-gray-200 text-base leading-relaxed"
                    placeholder="在此输入文案..."
                ></textarea>
                
                <div class="text-right text-xs text-gray-300 mt-2">{{ page.content.length }} 字</div>
            </div>

            <!-- 添加按钮卡片 -->
            <div class="outline-card border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-center cursor-pointer hover:border-[#ff2442] hover:text-[#ff2442] hover:bg-red-50/50 dark:hover:bg-red-900/10 transition-all text-gray-300 min-h-[300px]" @click="addPage('content')">
                <div class="text-center">
                    <div class="text-4xl font-light mb-2">+</div>
                    <span class="text-sm">添加页面</span>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.outline-view {
    height: 100%;
}
</style>
