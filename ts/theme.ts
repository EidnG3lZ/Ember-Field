export type ThemeId = "neon" | "terminal";

export interface SimPalette {
    /** 死细胞 / 背景色 */
    dead: string;
    /** 活细胞的多档绿色，用于制造轻微的纹理层次 */
    alive: string[];
    /** 燃烧三个阶段 */
    burn: [string, string, string];
}

export interface ChartPalette {
    grid: string;
    gridMinor: string;
    axis: string;
    tick: string;
    label: string;
    dot: string;
    dotGlow: string;
    line: string;
    lineGlow: string;
    legend: string;
}

export interface Theme {
    id: ThemeId;
    label: string;
    description: string;
    sim: SimPalette;
    chart: ChartPalette;
}

export const THEMES: Record<ThemeId, Theme> = {
    neon: {
        id: "neon",
        label: "霓虹",
        description: "深色霓虹极简",
        sim: {
            dead: "#07090b",
            alive: ["#22b85f", "#2cdb73", "#1aa354"],
            burn: ["#ffd166", "#ff8a3d", "#ff4d6d"]
        },
        chart: {
            grid: "rgba(170, 226, 195, 0.10)",
            gridMinor: "rgba(170, 226, 195, 0.05)",
            axis: "rgba(170, 226, 195, 0.30)",
            tick: "#8fa89b",
            label: "#a9c2b3",
            dot: "#ffb454",
            dotGlow: "rgba(255, 180, 84, 0.55)",
            line: "#4bf58f",
            lineGlow: "rgba(75, 245, 143, 0.55)",
            legend: "#8fa89b"
        }
    },
    terminal: {
        id: "terminal",
        label: "终端",
        description: "暖色复古终端",
        sim: {
            dead: "#010301",
            alive: ["#3ef075", "#62ff96", "#2ed15f"],
            burn: ["#d9ff7a", "#ffd166", "#ff7a3d"]
        },
        chart: {
            grid: "rgba(130, 255, 170, 0.11)",
            gridMinor: "rgba(130, 255, 170, 0.055)",
            axis: "rgba(130, 255, 170, 0.34)",
            tick: "#74b487",
            label: "#9ed8ae",
            dot: "#ffd166",
            dotGlow: "rgba(255, 209, 102, 0.5)",
            line: "#6dff9b",
            lineGlow: "rgba(109, 255, 155, 0.55)",
            legend: "#74b487"
        }
    }
};

export const THEME_LIST: Theme[] = [THEMES.neon, THEMES.terminal];

export function isThemeId(value: unknown): value is ThemeId {
    return value === "neon" || value === "terminal";
}

export function applyTheme(id: ThemeId) {
    document.documentElement.dataset.theme = id;
}
