<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

const showcaseImages = ref<string[]>([]);
const scrollOffset = ref(0);
const isReady = ref(false);

const ASSET_BASE = "/stores/static/redink/assets";
let scrollInterval: ReturnType<typeof setInterval> | null = null;

const preloadImages = (images: string[]) => {
    const promises = images.map(
        (image) =>
            new Promise<void>((resolve) => {
                const img = new Image();
                img.onload = () => resolve();
                img.onerror = () => resolve();
                img.src = `${ASSET_BASE}/showcase/${image}`;
            }),
    );
    return Promise.all(promises);
};

const loadShowcaseImages = async () => {
    try {
        const response = await fetch(`${ASSET_BASE}/showcase_manifest.json`);
        const data = await response.json();
        const originalImages: string[] = data.covers || [];
        const preloadCount = Math.min(originalImages.length, 22);
        await preloadImages(originalImages.slice(0, preloadCount));

        showcaseImages.value = [...originalImages, ...originalImages, ...originalImages];

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                isReady.value = true;
            });
        });

        if (showcaseImages.value.length > 0) {
            startScrollAnimation(originalImages.length);
        }
    } catch (error) {
        console.error("加载展示图片失败:", error);
        isReady.value = true;
    }
};

const startScrollAnimation = (originalCount: number) => {
    const rowHeight = 180;
    const itemsPerRow = 11;
    const totalRows = Math.ceil(originalCount / itemsPerRow);
    const sectionHeight = totalRows * rowHeight;

    scrollInterval = setInterval(() => {
        scrollOffset.value += 1;
        if (scrollOffset.value >= sectionHeight) {
            scrollOffset.value = 0;
        }
    }, 30);
};

onMounted(() => {
    loadShowcaseImages();
});

onUnmounted(() => {
    if (scrollInterval) {
        clearInterval(scrollInterval);
    }
});
</script>

<template>
    <div class="showcase-background" :class="{ 'is-ready': isReady }">
        <div class="showcase-grid" :style="{ transform: `translateY(-${scrollOffset}px)` }">
            <div v-for="(image, index) in showcaseImages" :key="index" class="showcase-item">
                <img :src="`${ASSET_BASE}/showcase/${image}`" :alt="`封面 ${index + 1}`" loading="eager" />
            </div>
        </div>
        <div class="showcase-overlay"></div>
    </div>
</template>

<style scoped>
.showcase-background {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100vh;
    z-index: -1;
    overflow: hidden;
    opacity: 0;
    transition: opacity 0.6s ease-out;
}

.showcase-background.is-ready {
    opacity: 1;
}

.showcase-grid {
    display: grid;
    grid-template-columns: repeat(11, 1fr);
    gap: 16px;
    padding: 20px;
    width: 100%;
    will-change: transform;
}

.showcase-item {
    width: 100%;
    aspect-ratio: 3 / 4;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.showcase-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}

.showcase-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(
        to bottom,
        rgba(255, 255, 255, 0.7) 0%,
        rgba(255, 255, 255, 0.65) 30%,
        rgba(255, 255, 255, 0.6) 100%
    );
    backdrop-filter: blur(2px);
}

@media (max-width: 768px) {
    .showcase-grid {
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        padding: 12px;
    }
}
</style>

