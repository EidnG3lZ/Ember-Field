import { isThemeId, ThemeId } from "./theme";

export interface Settings {
    theme: ThemeId;
    /** 每帧每个死亡细胞的生长概率 */
    pRevive: number;
    /** 每帧每个存活细胞的点火概率 */
    pIgnite: number;
    /** 渐进蔓延时每帧推进的层数 */
    fireSpreadSpeed: number;
    /** 每个燃烧阶段持续的帧数 */
    burnStatusTime: number;
    /** 细胞边长（CSS 像素） */
    cellSize: number;
    /** 主循环帧间隔（毫秒） */
    tickTime: number;
    /** 是否瞬间完成蔓延 */
    isSkipSpread: boolean;
    /** 统计图缩放 */
    chartScale: number;
    showClock: boolean;
    mouseIgnite: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
    theme: "neon",
    pRevive: 0.001,
    pIgnite: 0.000001,
    fireSpreadSpeed: 5,
    burnStatusTime: 5,
    cellSize: 3,
    tickTime: 15,
    isSkipSpread: true,
    chartScale: 1,
    showClock: true,
    mouseIgnite: true
};

const STORAGE_KEY = "ember-field.settings.v1";

function clamp(value: number, min: number, max: number, fallback: number) {
    if (!Number.isFinite(value)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, value));
}

export function normalizeSettings(input: Partial<Settings>): Settings {
    const result: Settings = { ...DEFAULT_SETTINGS };
    if (isThemeId(input.theme)) {
        result.theme = input.theme;
    }
    if (typeof input.pRevive === "number") {
        result.pRevive = clamp(input.pRevive, 1e-8, 1, DEFAULT_SETTINGS.pRevive);
    }
    if (typeof input.pIgnite === "number") {
        result.pIgnite = clamp(input.pIgnite, 1e-12, 0.01, DEFAULT_SETTINGS.pIgnite);
    }
    if (typeof input.fireSpreadSpeed === "number") {
        result.fireSpreadSpeed = Math.round(clamp(input.fireSpreadSpeed, 1, 30, DEFAULT_SETTINGS.fireSpreadSpeed));
    }
    if (typeof input.burnStatusTime === "number") {
        result.burnStatusTime = Math.round(clamp(input.burnStatusTime, 1, 30, DEFAULT_SETTINGS.burnStatusTime));
    }
    if (typeof input.cellSize === "number") {
        result.cellSize = Math.round(clamp(input.cellSize, 2, 8, DEFAULT_SETTINGS.cellSize));
    }
    if (typeof input.tickTime === "number") {
        result.tickTime = Math.round(clamp(input.tickTime, 8, 100, DEFAULT_SETTINGS.tickTime));
    }
    if (typeof input.chartScale === "number") {
        result.chartScale = clamp(input.chartScale, 0.5, 1.5, DEFAULT_SETTINGS.chartScale);
    }
    if (typeof input.isSkipSpread === "boolean") {
        result.isSkipSpread = input.isSkipSpread;
    }
    if (typeof input.showClock === "boolean") {
        result.showClock = input.showClock;
    }
    if (typeof input.mouseIgnite === "boolean") {
        result.mouseIgnite = input.mouseIgnite;
    }
    return result;
}

export function loadSettings(): Settings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return { ...DEFAULT_SETTINGS };
        }
        const parsed = JSON.parse(raw) as Partial<Settings>;
        return normalizeSettings(parsed);
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

export function saveSettings(settings: Settings) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
        // 隐私模式或 file:// 限制下静默失败，不影响壁纸运行
    }
}

const SUPERSCRIPT: Record<string, string> = {
    "0": "⁰",
    "1": "¹",
    "2": "²",
    "3": "³",
    "4": "⁴",
    "5": "⁵",
    "6": "⁶",
    "7": "⁷",
    "8": "⁸",
    "9": "⁹",
    "-": "⁻"
};

function superscript(value: number) {
    return String(value)
        .split("")
        .map((char) => SUPERSCRIPT[char] ?? char)
        .join("");
}

export function formatScientific(value: number) {
    if (!Number.isFinite(value) || value === 0) {
        return "0";
    }
    const exponent = Math.floor(Math.log10(value));
    const mantissa = value / Math.pow(10, exponent);
    return mantissa.toFixed(1) + "×10" + superscript(exponent);
}

export function formatPercent(value: number) {
    return Math.round(value * 100) + "%";
}

export function formatNumber(value: number) {
    return value.toLocaleString("zh-CN");
}
