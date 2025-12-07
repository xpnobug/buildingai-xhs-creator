<script setup lang="ts">
import { onUnmounted, ref } from "vue";

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
    <div
        class="flex flex-col gap-4 rounded-3xl border border-border/50 bg-card/70 p-5 shadow-[0px_35px_120px_rgba(15,23,42,0.12)] backdrop-blur"
    >
        <div class="flex items-center justify-between text-sm">
            <div class="font-semibold text-foreground">描述你想创作的主题</div>
            <div class="text-muted-foreground">{{ modelValue.length }}/500</div>
        </div>

        <div
            class="flex items-start gap-3 rounded-2xl border border-border/60 bg-background/70 px-4 py-3"
        >
            <svg
                class="mt-1 h-5 w-5 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
            >
                <path
                    d="M21 21l-5.2-5.2M17 10A7 7 0 1 1 3 10a7 7 0 0 1 14 0Z"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
            <textarea
                ref="textareaRef"
                class="h-24 flex-1 resize-none border-0 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0"
                :value="modelValue"
                :disabled="loading"
                placeholder="输入主题，例如：秋季显白美甲..."
                rows="1"
                @input="handleInput"
                @keydown.enter.prevent="handleEnter"
            ></textarea>
        </div>

        <div
            v-if="uploadedImages.length > 0"
            class="rounded-2xl border border-dashed border-border/70 bg-background/60 p-3"
        >
            <div class="mb-2 text-xs text-muted-foreground">
                这些图片将作为封面或内容的风格参考
            </div>
            <div class="flex flex-wrap gap-3">
                <div
                    v-for="(img, idx) in uploadedImages"
                    :key="idx"
                    class="group relative h-16 w-16 overflow-hidden rounded-xl border border-border/60"
                >
                    <img :src="img.preview" :alt="`图片 ${idx + 1}`" class="h-full w-full object-cover" />
                    <button
                        class="absolute right-1 top-1 hidden rounded-full bg-black/70 p-1 text-white group-hover:flex"
                        @click="removeImage(idx)"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            </div>
        </div>

        <div
            class="flex flex-col gap-3 border-t border-border/40 pt-3 sm:flex-row sm:items-center sm:justify-between"
        >
            <label
                class="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-primary"
            >
                <input
                    type="file"
                    accept="image/*"
                    multiple
                    :disabled="loading"
                    class="hidden"
                    @change="handleImageUpload"
                />
                <span class="inline-flex items-center gap-2">
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <path d="M21 15l-5-5-4 4-3-3-4 4" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                    上传参考图片
                    <span
                        v-if="uploadedImages.length"
                        class="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                    >
                        {{ uploadedImages.length }}
                    </span>
                </span>
            </label>

            <button
                class="inline-flex items-center justify-center rounded-full bg-primary px-6 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/50"
                :disabled="!modelValue.trim() || loading"
                @click="$emit('generate')"
            >
                <svg
                    v-if="loading"
                    class="mr-2 h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <circle cx="12" cy="12" r="10" opacity="0.25"></circle>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
                </svg>
                {{ loading ? "生成中..." : "生成大纲" }}
            </button>
        </div>
    </div>
</template>

