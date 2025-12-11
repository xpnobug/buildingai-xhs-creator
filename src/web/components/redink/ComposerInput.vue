<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import GenerationPreferences from "./GenerationPreferences.vue";

interface UploadedImage {
    file: File;
    preview: string;
}

const props = defineProps<{
    modelValue: string;
    loading: boolean;
}>();

const emit = defineEmits<{
    (e: "update:modelValue", value: string): void;
    (e: "generate"): void;
    (e: "imagesChange", images: File[]): void;
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const uploadedImages = ref<UploadedImage[]>([]);
const showPreferences = ref(false);
const preferences = ref({
    mode: 'auto' as 'auto' | 'image' | 'video',
    aspectRatio: 'auto',
    model: '4.0',
    quality: '2k'
});

const handleInput = (event: Event) => {
    const target = event.target as HTMLTextAreaElement;
    emit("update:modelValue", target.value);
    adjustHeight();
};

const handleEnter = (event: KeyboardEvent) => {
    if (event.shiftKey) return;
    event.preventDefault();
    emit("generate");
};

const adjustHeight = () => {
    const el = textareaRef.value;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.max(64, Math.min(el.scrollHeight, 200));
    el.style.height = `${newHeight}px`;
};

const handleImageUpload = (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (!target.files) return;

    const files = Array.from(target.files);
    files.forEach((file) => {
        if (uploadedImages.value.length >= 5) return;
        const preview = URL.createObjectURL(file);
        uploadedImages.value.push({ file, preview });
    });

    emitImagesChange();
    target.value = "";
};

const removeImage = (index: number) => {
    const img = uploadedImages.value[index];
    if (!img) return;
    URL.revokeObjectURL(img.preview);
    uploadedImages.value.splice(index, 1);
    emitImagesChange();
};

const emitImagesChange = () => {
    const files = uploadedImages.value.map((img) => img.file);
    emit("imagesChange", files);
};

const clearPreviews = () => {
    uploadedImages.value.forEach((img) => URL.revokeObjectURL(img.preview));
    uploadedImages.value = [];
};

onUnmounted(() => {
    clearPreviews();
});

defineExpose({
    clearPreviews,
});
</script>

<template>
    <div class="relative w-full max-w-3xl mx-auto">
        <!-- Main Input Container -->
        <div 
            class="relative flex flex-col min-h-[160px] rounded-[24px] bg-white dark:bg-[#1a1b1e] border border-gray-200 dark:border-white/5 shadow-2xl transition-all focus-within:border-gray-300 dark:focus-within:border-white/10 focus-within:ring-1 focus-within:ring-gray-200 dark:focus-within:ring-white/5"
        >
            <!-- Textarea -->
            <textarea
                ref="textareaRef"
                class="w-full flex-1 bg-transparent p-6 text-lg text-gray-900 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-600 resize-none border-0 focus:ring-0 focus:outline-none scrollbar-hide"
                :value="modelValue"
                :disabled="loading"
                placeholder="说说今天想做点什么"
                rows="1"
                @input="handleInput"
                @keydown.enter.prevent="handleEnter"
            ></textarea>

            <!-- Image Previews -->
            <div v-if="uploadedImages.length > 0" class="px-6 pb-2 flex flex-wrap gap-2">
                <div
                    v-for="(img, idx) in uploadedImages"
                    :key="idx"
                    class="group relative h-12 w-12 overflow-hidden rounded-lg border border-gray-200 dark:border-white/10"
                >
                    <img :src="img.preview" class="h-full w-full object-cover" />
                    <button
                        class="absolute inset-0 hidden items-center justify-center bg-black/50 text-white group-hover:flex"
                        @click="removeImage(idx)"
                    >
                        <UIcon name="i-lucide-x" class="w-4 h-4" />
                    </button>
                </div>
            </div>

            <!-- Bottom Toolbar -->
            <div class="flex items-center justify-between px-4 py-3 mt-auto">
                <div class="flex items-center gap-2">
                    <!-- Attachment Button -->
                    <label class="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 rounded-full cursor-pointer transition-colors">
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            :disabled="loading"
                            class="hidden"
                            @change="handleImageUpload"
                        />
                        <UIcon name="i-lucide-paperclip" class="w-5 h-5" />
                    </label>

                    <!-- Preferences Button -->
                    <UPopover :popper="{ placement: 'top-start' }" v-model:open="showPreferences">
                        <template #default>
                            <button 
                                 class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                                 :class="showPreferences ? 'bg-gray-200 dark:bg-white/10 text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-700 dark:hover:text-white'"
                            >
                                <UIcon name="i-lucide-sliders-horizontal" class="w-4 h-4" />
                                <span>{{ preferences.mode === 'auto' ? '自动' : '自定义' }}</span>
                            </button>
                        </template>

                        <template #panel>
                            <GenerationPreferences v-model="preferences" />
                        </template>
                    </UPopover>
                </div>

                <!-- Submit Button -->
                 <button
                    class="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white hover:bg-gray-300 dark:hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    :disabled="!modelValue.trim() || loading"
                    @click="$emit('generate')"
                >
                    <UIcon v-if="loading" name="i-lucide-loader-2" class="w-5 h-5 animate-spin" />
                    <UIcon v-else name="i-lucide-arrow-up" class="w-5 h-5" />
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.scrollbar-hide::-webkit-scrollbar {
    display: none;
}
.scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
}
</style>


