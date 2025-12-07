<script setup lang="ts">
const props = defineProps<{
    show: boolean;
    title?: string;
    message: string;
    type?: "error" | "warning" | "info";
}>();

const emit = defineEmits<{
    (e: "close"): void;
}>();

const close = () => {
    emit("close");
};

const iconName = () => {
    const iconMap = {
        error: "i-lucide-alert-circle",
        warning: "i-lucide-alert-triangle",
        info: "i-lucide-info",
    };
    return iconMap[props.type || "error"];
};

const colorClass = () => {
    const colorMap = {
        error: "text-red-500",
        warning: "text-yellow-500",
        info: "text-blue-500",
    };
    return colorMap[props.type || "error"];
};
</script>

<template>
    <Teleport to="body">
        <Transition
            enter-active-class="transition-all duration-200 ease-out"
            enter-from-class="opacity-0"
            enter-to-class="opacity-100"
            leave-active-class="transition-all duration-150 ease-in"
            leave-from-class="opacity-100"
            leave-to-class="opacity-0"
        >
            <div
                v-if="show"
                class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                @click.self="close"
            >
                <Transition
                    enter-active-class="transition-all duration-200 ease-out"
                    enter-from-class="opacity-0 scale-95 translate-y-4"
                    enter-to-class="opacity-100 scale-100 translate-y-0"
                    leave-active-class="transition-all duration-150 ease-in"
                    leave-from-class="opacity-100 scale-100 translate-y-0"
                    leave-to-class="opacity-0 scale-95 translate-y-4"
                >
                    <div
                        v-if="show"
                        class="relative mx-4 w-full max-w-md rounded-3xl border border-border/60 bg-card p-6 shadow-2xl"
                        @click.stop
                    >
                        <!-- Icon -->
                        <div class="mb-4 flex justify-center">
                            <div
                                class="rounded-full bg-background/80 p-4"
                                :class="colorClass()"
                            >
                                <UIcon :name="iconName()" class="h-12 w-12" />
                            </div>
                        </div>

                        <!-- Title -->
                        <h3
                            v-if="title"
                            class="mb-3 text-center text-xl font-bold text-foreground"
                        >
                            {{ title }}
                        </h3>

                        <!-- Message -->
                        <p class="mb-6 text-center text-sm text-muted-foreground">
                            {{ message }}
                        </p>

                        <!-- Button -->
                        <button
                            class="w-full rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-lg"
                            @click="close"
                        >
                            我知道了
                        </button>
                    </div>
                </Transition>
            </div>
        </Transition>
    </Teleport>
</template>
