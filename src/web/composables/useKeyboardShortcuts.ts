import { onMounted, onUnmounted } from "vue";

/**
 * 键盘快捷键定义
 */
export interface KeyboardShortcut {
    /** 按键（如 'Escape', 'Enter', 's'） */
    key: string;
    /** 是否需要 Ctrl/Cmd */
    ctrl?: boolean;
    /** 是否需要 Shift */
    shift?: boolean;
    /** 是否需要 Alt */
    alt?: boolean;
    /** 回调函数 */
    handler: (event: KeyboardEvent) => void;
    /** 描述（用于帮助提示） */
    description?: string;
}

/**
 * 键盘快捷键 Composable
 * 提供统一的键盘事件处理
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
    function handleKeydown(event: KeyboardEvent) {
        for (const shortcut of shortcuts) {
            const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
            const ctrlMatch = shortcut.ctrl ? (event.ctrlKey || event.metaKey) : true;
            const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
            const altMatch = shortcut.alt ? event.altKey : !event.altKey;

            if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
                event.preventDefault();
                shortcut.handler(event);
                return;
            }
        }
    }

    onMounted(() => {
        document.addEventListener("keydown", handleKeydown);
    });

    onUnmounted(() => {
        document.removeEventListener("keydown", handleKeydown);
    });

    return {
        /** 获取快捷键描述列表 */
        getShortcutDescriptions: () =>
            shortcuts
                .filter((s) => s.description)
                .map((s) => ({
                    keys: formatShortcutKeys(s),
                    description: s.description!,
                })),
    };
}

/**
 * 格式化快捷键显示
 */
function formatShortcutKeys(shortcut: KeyboardShortcut): string {
    const parts: string[] = [];
    if (shortcut.ctrl) parts.push("⌘");
    if (shortcut.shift) parts.push("⇧");
    if (shortcut.alt) parts.push("⌥");
    parts.push(formatKey(shortcut.key));
    return parts.join(" + ");
}

/**
 * 格式化单个按键显示
 */
function formatKey(key: string): string {
    const keyMap: Record<string, string> = {
        escape: "Esc",
        enter: "↵",
        arrowup: "↑",
        arrowdown: "↓",
        arrowleft: "←",
        arrowright: "→",
        backspace: "⌫",
        delete: "⌦",
        tab: "⇥",
        space: "Space",
    };
    return keyMap[key.toLowerCase()] || key.toUpperCase();
}

/**
 * 常用快捷键预设
 */
export const CommonShortcuts = {
    /** ESC 关闭 */
    escape: (handler: () => void): KeyboardShortcut => ({
        key: "Escape",
        handler,
        description: "关闭",
    }),

    /** Ctrl+S 保存 */
    save: (handler: () => void): KeyboardShortcut => ({
        key: "s",
        ctrl: true,
        handler,
        description: "保存",
    }),

    /** Ctrl+Enter 提交 */
    submit: (handler: () => void): KeyboardShortcut => ({
        key: "Enter",
        ctrl: true,
        handler,
        description: "提交",
    }),

    /** Ctrl+Shift+R 重新生成 */
    regenerate: (handler: () => void): KeyboardShortcut => ({
        key: "r",
        ctrl: true,
        shift: true,
        handler,
        description: "重新生成",
    }),
};
