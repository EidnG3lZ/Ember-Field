import type { Settings } from "./settings";
import { isThemeId } from "./theme";

export interface WallpaperProperty {
    value: unknown;
}

export type WallpaperProperties = Record<string, WallpaperProperty | undefined>;

/** applyGeneralProperties 回调的参数：全局设置，值是裸值而不是 { value } */
export interface GeneralProperties {
    fps?: unknown;
}

/**
 * 读取 Wallpaper Engine「性能」标签页里的全局帧率上限。
 * 官方推荐壁纸沿用这个全局上限，而不是自己另设一个 FPS。
 * 返回值 0 表示用户未设上限；返回 undefined 表示本次事件没带可用值（保持原值）。
 */
export function fpsLimitFromGeneralProperties(properties: GeneralProperties): number | undefined {
    const fps = properties.fps;
    if (typeof fps !== "number" || !Number.isFinite(fps)) {
        return undefined;
    }
    return fps > 0 ? fps : 0;
}

function numberValue(properties: WallpaperProperties, key: string): number | undefined {
    const value = properties[key]?.value;
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(properties: WallpaperProperties, key: string): boolean | undefined {
    const value = properties[key]?.value;
    return typeof value === "boolean" ? value : undefined;
}

/** 编辑器里用「尾数 × 10^指数」两个滑块表示一个概率 */
interface ScientificPair {
    mantissa: number;
    exponent: number;
}

/**
 * 只有一半属性到达时的补全值，对应 project.json 里的默认配置。
 * 正常情况下壁纸启动时 WE 会一次性下发全部属性，这里只作为兜底。
 */
const SCIENTIFIC_DEFAULTS = {
    revive: { mantissa: 1, exponent: -3 },
    ignite: { mantissa: 1, exponent: -7 }
} as const satisfies Record<string, ScientificPair>;

type ScientificKey = keyof typeof SCIENTIFIC_DEFAULTS;

/** 上一次生效的尾数/指数，用于回调只带其中一个属性时补全另一个 */
const scientificCache = new Map<ScientificKey, ScientificPair>();

/**
 * 把编辑器的两个滑块合成概率值：mantissa × 10^exponent。
 * WE 的 applyUserProperties 只保证带上本次变化的属性，所以两个滑块分开缓存、分开更新。
 */
function scientificValue(
    properties: WallpaperProperties,
    key: ScientificKey,
    mantissaKey: string,
    exponentKey: string
): number | undefined {
    const mantissa = numberValue(properties, mantissaKey);
    const exponent = numberValue(properties, exponentKey);
    if (mantissa === undefined && exponent === undefined) {
        return undefined;
    }
    const previous = scientificCache.get(key) ?? SCIENTIFIC_DEFAULTS[key];
    const next: ScientificPair = {
        mantissa: mantissa ?? previous.mantissa,
        exponent: exponent ?? previous.exponent
    };
    scientificCache.set(key, next);
    return next.mantissa * Math.pow(10, next.exponent);
}

/**
 * 把 Wallpaper Engine 的 applyUserProperties 回调转换成 Settings 补丁。
 * 只读取存在且类型正确的属性，便于在浏览器中安全运行，也方便单独测试。
 */
export function settingsPatchFromWallpaperProperties(properties: WallpaperProperties): Partial<Settings> {
    const patch: Partial<Settings> = {};

    const theme = properties.theme?.value;
    if (isThemeId(theme)) {
        patch.theme = theme;
    }

    const showClock = booleanValue(properties, "show_clock");
    if (showClock !== undefined) {
        patch.showClock = showClock;
    }
    const mouseIgnite = booleanValue(properties, "mouse_ignite");
    if (mouseIgnite !== undefined) {
        patch.mouseIgnite = mouseIgnite;
    }
    const isSkipSpread = booleanValue(properties, "skip_spread");
    if (isSkipSpread !== undefined) {
        patch.isSkipSpread = isSkipSpread;
    }
    // 循环边界：WE 编辑器里的 loop_map 开关 → Settings.loopMap
    const loopMap = booleanValue(properties, "loop_map");
    if (loopMap !== undefined) {
        patch.loopMap = loopMap;
    }
    const chartHistogram = booleanValue(properties, "chart_histogram");
    if (chartHistogram !== undefined) {
        patch.chartHistogram = chartHistogram;
    }
    // 存活细胞配色：柏林噪声色块 / 坐标哈希散点
    const perlinAliveColor = booleanValue(properties, "perlin_color");
    if (perlinAliveColor !== undefined) {
        patch.perlinAliveColor = perlinAliveColor;
    }

    // 生长率 / 起火率：编辑器拆成「尾数」+「指数」两个滑块，乘回去再交给 Settings
    const pRevive = scientificValue(properties, "revive", "p_revive_m", "p_revive_e");
    if (pRevive !== undefined) {
        patch.pRevive = pRevive;
    }
    const pIgnite = scientificValue(properties, "ignite", "p_ignite_m", "p_ignite_e");
    if (pIgnite !== undefined) {
        patch.pIgnite = pIgnite;
    }

    const numericProperties: Array<[string, keyof Pick<Settings,
        "cellSize" | "fireSpreadSpeed" | "burnStatusTime" | "tickTime" | "chartScale">]> = [
        ["cell_size", "cellSize"],
        ["fire_spread_speed", "fireSpreadSpeed"],
        ["burn_status_time", "burnStatusTime"],
        ["tick_time", "tickTime"],
        ["chart_scale", "chartScale"]
    ];
    for (const [propertyKey, settingsKey] of numericProperties) {
        const value = numberValue(properties, propertyKey);
        if (value !== undefined) {
            patch[settingsKey] = value;
        }
    }

    return patch;
}
