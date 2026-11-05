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

    const numericProperties: Array<[string, keyof Pick<Settings,
        "pRevive" | "pIgnite" | "cellSize" | "fireSpreadSpeed" |
        "burnStatusTime" | "tickTime" | "chartScale">]> = [
        ["p_revive", "pRevive"],
        ["p_ignite", "pIgnite"],
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
