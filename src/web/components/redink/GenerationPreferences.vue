<script setup lang="ts">
import { computed } from "vue";

interface Props {
  modelValue: {
    mode: 'auto' | 'image' | 'video';
    aspectRatio: string;
    model: string;
    quality: string;
  }
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: Props['modelValue']): void
}>();

const ratios = [
  { label: '智能', value: 'auto', icon: 'i-lucide-monitor' },
  { label: '21:9', value: '21:9', icon: 'i-lucide-rectangle-horizontal' },
  { label: '16:9', value: '16:9', icon: 'i-lucide-rectangle-horizontal' },
  { label: '3:2', value: '3:2', icon: 'i-lucide-rectangle-horizontal' },
  { label: '4:3', value: '4:3', icon: 'i-lucide-rectangle-horizontal' },
  { label: '1:1', value: '1:1', icon: 'i-lucide-square' },
  { label: '3:4', value: '3:4', icon: 'i-lucide-rectangle-vertical' },
  { label: '2:3', value: '2:3', icon: 'i-lucide-rectangle-vertical' },
  { label: '9:16', value: '9:16', icon: 'i-lucide-rectangle-vertical' },
];

const models = [
    { label: '图片 4.0', value: '4.0' },
    { label: '图片 3.5', value: '3.5' },
];

const qualities = [
    { label: '高清 2K', value: '2k' },
    { label: '标清 1K', value: '1k' },
];

const isAuto = computed({
    get: () => props.modelValue.mode === 'auto',
    set: (val) => {
        emit('update:modelValue', { 
            ...props.modelValue, 
            mode: val ? 'auto' : 'image' // Default to image if turning auto off
        });
    }
});

const updateMode = (mode: 'image' | 'video') => {
    emit('update:modelValue', { ...props.modelValue, mode });
};

const updateRatio = (ratio: string) => {
    emit('update:modelValue', { ...props.modelValue, aspectRatio: ratio });
};

const updateModel = (model: any) => {
     emit('update:modelValue', { ...props.modelValue, model });
};

const updateQuality = (quality: any) => {
     emit('update:modelValue', { ...props.modelValue, quality });
};

</script>

<template>
  <div class="w-[400px] bg-[#1a1a1a] rounded-xl border border-white/10 p-4 text-white shadow-2xl">
    <div class="flex items-center justify-between mb-4">
      <span class="text-sm font-medium text-gray-200">生成偏好</span>
      <div class="flex items-center gap-2">
          <span class="text-xs text-gray-400">自动</span>
          <UToggle v-model="isAuto" size="sm" />
      </div>
    </div>

    <!-- Mode Select (Using Tabs style from image) -->
    <div class="grid grid-cols-2 gap-1 bg-white/5 p-1 rounded-lg mb-4" :class="{ 'opacity-50 pointer-events-none': isAuto }">
        <button 
            class="flex items-center justify-center py-1.5 text-xs rounded-md transition-colors"
            :class="modelValue.mode === 'image' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'"
            @click="updateMode('image')"
        >
            图片
        </button>
        <button 
             class="flex items-center justify-center py-1.5 text-xs rounded-md transition-colors"
            :class="modelValue.mode === 'video' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'"
             @click="updateMode('video')"
        >
            视频
        </button>
    </div>

    <div class="space-y-4" :class="{ 'opacity-50 pointer-events-none': isAuto }">
        <div>
            <div class="text-xs text-gray-500 mb-2">选择比例</div>
            <div class="grid grid-cols-5 gap-2">
                <button
                    v-for="r in ratios"
                    :key="r.value"
                    @click="updateRatio(r.value)"
                    class="flex flex-col items-center justify-center gap-1 p-2 rounded-lg border transition-all"
                    :class="modelValue.aspectRatio === r.value ? 'bg-white/10 border-blue-500/50 text-blue-400' : 'border-transparent hover:bg-white/5 text-gray-400'"
                >
                    <UIcon :name="r.icon" class="w-4 h-4" />
                    <span class="text-[10px]">{{ r.label }}</span>
                </button>
            </div>
        </div>

         <div>
            <div class="text-xs text-gray-500 mb-2">其他设置</div>
            <div class="flex gap-2">
                 <USelectMenu
                    :model-value="modelValue.model"
                    :options="models"
                    option-attribute="label"
                    value-attribute="value"
                    @update:model-value="updateModel"
                    class="flex-1"
                >
                    <template #default="{ open }">
                         <button class="w-full flex items-center justify-between px-3 py-2 bg-white/5 rounded-lg border border-transparent hover:border-white/10 text-xs text-gray-300">
                            <span class="flex items-center gap-2">
                                <UIcon name="i-lucide-box" class="w-3.5 h-3.5" />
                                {{ models.find(m => m.value === modelValue.model)?.label }}
                            </span>
                            <UIcon name="i-lucide-chevron-down" class="w-3.5 h-3.5 text-gray-500 transition-transform" :class="[open && 'rotate-180']" />
                        </button>
                    </template>
                 </USelectMenu>

                 <USelectMenu
                    :model-value="modelValue.quality"
                    :options="qualities"
                    option-attribute="label"
                    value-attribute="value"
                     @update:model-value="updateQuality"
                    class="flex-1"
                >
                    <template #default="{ open }">
                        <button class="w-full flex items-center justify-between px-3 py-2 bg-white/5 rounded-lg border border-transparent hover:border-white/10 text-xs text-gray-300">
                            <span class="flex items-center gap-2">
                                <UIcon name="i-lucide-hd" class="w-3.5 h-3.5" />
                                {{ qualities.find(q => q.value === modelValue.quality)?.label }}
                            </span>
                             <UIcon name="i-lucide-chevron-down" class="w-3.5 h-3.5 text-gray-500 transition-transform" :class="[open && 'rotate-180']" />
                        </button>
                    </template>
                 </USelectMenu>
            </div>
        </div>

    </div>
  </div>
</template>
