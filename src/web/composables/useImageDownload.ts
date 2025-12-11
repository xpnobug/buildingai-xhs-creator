import { ref } from "vue";

/**
 * 图片下载工具 Composable
 * 提供统一的图片下载逻辑
 */
export function useImageDownload() {
    /** 正在下载的图片 URL 集合 */
    const downloadingImages = ref<Set<string>>(new Set());

    /** 正在下载 ZIP */
    const isDownloadingZip = ref(false);

    /**
     * 检查某个图片是否正在下载
     */
    function isImageDownloading(url: string): boolean {
        return downloadingImages.value.has(url);
    }

    /**
     * 下载单张图片
     */
    async function downloadImage(
        url: string,
        filename: string,
        onSuccess?: () => void,
        onError?: (error: Error) => void,
    ): Promise<void> {
        if (downloadingImages.value.has(url)) {
            return;
        }

        downloadingImages.value.add(url);

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`下载失败: ${response.status}`);
            }

            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);

            const link = document.createElement("a");
            link.href = blobUrl;
            link.download = filename;
            link.style.display = "none";
            document.body.appendChild(link);
            link.click();

            // 清理
            setTimeout(() => {
                URL.revokeObjectURL(blobUrl);
                document.body.removeChild(link);
            }, 100);

            onSuccess?.();
        } catch (error) {
            console.error("下载失败:", error);
            onError?.(error as Error);
        } finally {
            downloadingImages.value.delete(url);
        }
    }

    /**
     * 下载 ZIP 文件
     */
    async function downloadZip(
        url: string,
        filename: string,
        onSuccess?: () => void,
        onError?: (error: Error) => void,
    ): Promise<void> {
        if (isDownloadingZip.value) {
            return;
        }

        isDownloadingZip.value = true;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`下载失败: ${response.status}`);
            }

            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);

            const link = document.createElement("a");
            link.href = blobUrl;
            link.download = filename;
            link.style.display = "none";
            document.body.appendChild(link);
            link.click();

            setTimeout(() => {
                URL.revokeObjectURL(blobUrl);
                document.body.removeChild(link);
            }, 100);

            onSuccess?.();
        } catch (error) {
            console.error("ZIP 下载失败:", error);
            onError?.(error as Error);
        } finally {
            isDownloadingZip.value = false;
        }
    }

    return {
        downloadingImages,
        isDownloadingZip,
        isImageDownloading,
        downloadImage,
        downloadZip,
    };
}

/**
 * 日期格式化工具
 */
export function formatDateTime(value?: string): string {
    if (!value) return "-";
    try {
        return new Date(value).toLocaleString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return value;
    }
}

/**
 * 页面类型标签
 */
export function getPageTypeLabel(type: "cover" | "content" | "summary", index?: number): string {
    switch (type) {
        case "cover":
            return "封面";
        case "summary":
            return "总结";
        default:
            return index !== undefined ? `内容页 ${index}` : "内容页";
    }
}
