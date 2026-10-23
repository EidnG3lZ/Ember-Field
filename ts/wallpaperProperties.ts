import type { Settings } from "./settings";
import { isThemeId } from "./theme";

export interface WallpaperProperty {
    value: unknown;
}

export type WallpaperProperties = Record<string, WallpaperProperty | undefined>;

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
