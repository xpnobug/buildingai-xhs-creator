<script lang="ts" setup>
import { ref } from "vue";

const emit = defineEmits<{
    (e: "next", topic: string, images: File[]): void;
}>();

const topic = ref("");
const selectedFiles = ref<File[]>([]);

const handleFileChange = (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (target.files) {
        selectedFiles.value = Array.from(target.files);
    }
};

const submit = () => {
    if (!topic.value.trim()) return;
    emit("next", topic.value, selectedFiles.value);
};
</script>

<template>
    <div class="home-view">
        <h1>RedInk 小红书图文生成</h1>
        <div class="input-group">
            <label>输入主题</label>
            <input v-model="topic" placeholder="请输入想要生成的主题..." />
        </div>
        
        <div class="input-group">
            <label>参考图片 (可选)</label>
            <input type="file" multiple @change="handleFileChange" accept="image/*" />
        </div>

        <button @click="submit" :disabled="!topic.trim()">生成大纲</button>
    </div>
</template>

<style scoped>
.home-view {
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-width: 600px;
    margin: 0 auto;
    padding-top: 50px;
}

.input-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

input {
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
}

button {
    padding: 12px;
    background-color: #ff2442;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

button:disabled {
    background-color: #ccc;
    cursor: not-allowed;
}
</style>
