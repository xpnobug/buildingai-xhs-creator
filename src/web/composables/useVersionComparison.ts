import { ref, computed } from "vue";

import { imageApi } from "~/services/xhs/api";

/**
 * 图片版本信息
 */
export interface ImageVersion {
    version: number;
    imageUrl: string;
    createdAt: string;
    isCurrent: boolean;
    source?: string;
}

/**
 * 版本对比 Composable
 * 提取自 VersionComparisonModal，便于复用
 */
export function useVersionComparison() {
    /** 版本列表 */
    const versions = ref<ImageVersion[]>([]);

    /** 加载中 */
    const loading = ref(false);

    /** 错误信息 */
    const error = ref<string | null>(null);

    /** 选中的版本用于对比 */
    const selectedVersions = ref<number[]>([]);

    /** 当前版本 */
    const currentVersion = computed(() => 
        versions.value.find(v => v.isCurrent)
    );

    /** 是否可以对比 */
    const canCompare = computed(() => 
        selectedVersions.value.length === 2
    );

    /**
     * 加载版本列表
     */
    async function loadVersions(taskId: string, pageIndex: number): Promise<void> {
        loading.value = true;
        error.value = null;

        try {
            const result = await imageApi.getImageVersions(taskId, pageIndex);
            versions.value = result.versions || [];
        } catch (e) {
            error.value = (e as Error).message || "加载版本失败";
            versions.value = [];
        } finally {
            loading.value = false;
        }
    }

    /**
     * 切换版本选择
     */
    function toggleVersionSelection(version: number): void {
        const index = selectedVersions.value.indexOf(version);
        if (index === -1) {
            if (selectedVersions.value.length >= 2) {
                selectedVersions.value.shift();
            }
            selectedVersions.value.push(version);
        } else {
            selectedVersions.value.splice(index, 1);
        }
    }

    /**
     * 恢复到指定版本
     */
    async function restoreVersion(
        taskId: string, 
        pageIndex: number, 
        version: number
    ): Promise<string> {
        loading.value = true;
        error.value = null;

        try {
            const result = await imageApi.restoreImageVersion(taskId, pageIndex, version);
            // 刷新版本列表
            await loadVersions(taskId, pageIndex);
            return result.imageUrl || "";
        } catch (e) {
            error.value = (e as Error).message || "恢复版本失败";
            throw e;
        } finally {
            loading.value = false;
        }
    }

    /**
     * 清空状态
     */
    function reset(): void {
        versions.value = [];
        selectedVersions.value = [];
        error.value = null;
        loading.value = false;
    }

    return {
        versions,
        loading,
        error,
        selectedVersions,
        currentVersion,
        canCompare,
        loadVersions,
        toggleVersionSelection,
        restoreVersion,
        reset,
    };
}
