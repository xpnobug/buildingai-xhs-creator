/**
 * 生成时间预估工具
 * 基于历史数据估算生成时间
 */

/** 每张图片平均生成时间（毫秒） */
const AVERAGE_IMAGE_GENERATION_TIME = 30 * 1000; // 30 秒

/** 大纲生成平均时间（毫秒） */
const AVERAGE_OUTLINE_GENERATION_TIME = 15 * 1000; // 15 秒

/** 统计数据存储 */
interface GenerationStats {
    totalGenerations: number;
    totalTimeMs: number;
    lastUpdated: number;
}

/** 本地存储 key */
const STATS_KEY = "xhs_generation_stats";

/**
 * 获取统计数据
 */
function getStats(): GenerationStats {
    try {
        const stored = localStorage.getItem(STATS_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch {}
    return {
        totalGenerations: 0,
        totalTimeMs: 0,
        lastUpdated: Date.now(),
    };
}

/**
 * 更新统计数据
 */
export function recordGenerationTime(timeMs: number): void {
    try {
        const stats = getStats();
        stats.totalGenerations++;
        stats.totalTimeMs += timeMs;
        stats.lastUpdated = Date.now();
        localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch {}
}

/**
 * 估算单张图片生成时间
 */
export function estimateSingleImageTime(): number {
    const stats = getStats();
    if (stats.totalGenerations >= 3) {
        // 使用历史数据
        return Math.round(stats.totalTimeMs / stats.totalGenerations);
    }
    return AVERAGE_IMAGE_GENERATION_TIME;
}

/**
 * 估算批量生成总时间
 * @param pageCount 页面数量
 * @param isHighConcurrency 是否高并发模式
 */
export function estimateTotalTime(pageCount: number, isHighConcurrency: boolean = false): number {
    const singleTime = estimateSingleImageTime();

    if (isHighConcurrency) {
        // 高并发模式：MAX_CONCURRENCY=3，所以时间约为 pageCount/3 * singleTime
        return Math.ceil(pageCount / 3) * singleTime;
    }

    // 顺序模式
    return pageCount * singleTime;
}

/**
 * 格式化时间显示
 */
export function formatEstimatedTime(ms: number): string {
    const seconds = Math.ceil(ms / 1000);

    if (seconds < 60) {
        return `约 ${seconds} 秒`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (remainingSeconds === 0) {
        return `约 ${minutes} 分钟`;
    }

    return `约 ${minutes} 分 ${remainingSeconds} 秒`;
}

/**
 * 获取预估时间文本
 */
export function getEstimatedTimeText(pageCount: number, isHighConcurrency: boolean = false): string {
    const timeMs = estimateTotalTime(pageCount, isHighConcurrency);
    return formatEstimatedTime(timeMs);
}

/**
 * 计算剩余时间
 */
export function getRemainingTime(
    completedCount: number,
    totalCount: number,
    elapsedMs: number,
): string {
    if (completedCount === 0) {
        return getEstimatedTimeText(totalCount);
    }

    const avgTimePerItem = elapsedMs / completedCount;
    const remainingCount = totalCount - completedCount;
    const remainingMs = avgTimePerItem * remainingCount;

    return formatEstimatedTime(remainingMs);
}
