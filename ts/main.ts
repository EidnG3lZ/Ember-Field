import { Clock } from "./Clock";
import { ControlPanel } from "./ControlPanel";
import { createFireStatistics, FireSimulate, FireStatistics } from "./FireSimulate";
import { formatNumber, loadSettings, normalizeSettings, saveSettings, Settings } from "./settings";
import { SimulatorDrawer } from "./SimulatorDrawer";
import { PowerLawFit, StatisticsDrawer } from "./StatisticsDrawer";
import { applyTheme, isThemeId, THEMES, ThemeId } from "./theme";
import { settingsPatchFromWallpaperProperties } from "./wallpaperProperties";
import type { WallpaperProperties } from "./wallpaperProperties";

const simCanvas = document.getElementById("sim-canvas") as HTMLCanvasElement;
const statsCanvas = document.getElementById("stats-canvas") as HTMLCanvasElement;
const statsChips = document.getElementById("stats-chips") as HTMLElement;
const chartEmpty = document.getElementById("chart-empty") as HTMLElement;
const clockRoot = document.getElementById("clock") as HTMLElement;
const panelRoot = document.getElementById("panel") as HTMLElement;
const panelToggle = document.getElementById("panel-toggle") as HTMLButtonElement;
const controlsRoot = document.getElementById("controls") as HTMLElement;
const fxLayer = document.getElementById("fx-layer") as HTMLElement;

let settings: Settings = loadSettings();

// 用于本地预览 / 截图的轻量覆盖，不影响 Wallpaper Engine 中的正常运行
const searchParams = new URLSearchParams(location.search);
const themeOverride = searchParams.get("theme");
if (isThemeId(themeOverride)) {
    settings.theme = themeOverride;
}
const forcePanelOpen = searchParams.get("panel") === "1" || location.hash === "#panel";

applyTheme(settings.theme);
document.documentElement.style.setProperty("--chart-scale", String(settings.chartScale));

const statistics: FireStatistics = createFireStatistics();
// 这两个实例在 buildSimulation() 里赋值，主循环 IIFE 在其之后才启动；
// 加 ! 是因为 tsc 不做跨函数控制流分析，无法看出赋值一定先于使用。
let fireSimulate!: FireSimulate;
let simulatorDrawer!: SimulatorDrawer;
let statisticsDrawer: StatisticsDrawer;
let clock: Clock;
let controlPanel: ControlPanel;
let cellNumberX = 1;
let cellNumberY = 1;
let lastIgnitionRipple = 0;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function themeDefinition() {
    return THEMES[settings.theme];
}

function buildSimulation(preserveGrid = false) {
    // 使用画布的 CSS 尺寸而不是 window.innerWidth/Height，
    // 避免浏览器窗口尺寸变化时画布与视口不同步而留下黑边。
    const width = Math.max(1, simCanvas.clientWidth || window.innerWidth);
    const height = Math.max(1, simCanvas.clientHeight || window.innerHeight);
    const previousGrid = preserveGrid && fireSimulate ? fireSimulate.getCellGrid() : null;
    const previousCellNumX = cellNumberX;
    const previousCellNumY = cellNumberY;
    cellNumberX = Math.ceil(width / settings.cellSize);
    cellNumberY = Math.ceil(height / settings.cellSize);

    fireSimulate = new FireSimulate({
        cellNumX: cellNumberX,
        cellNumY: cellNumberY,
        pRevive: settings.pRevive,
        pIgnite: settings.pIgnite,
        fireSpreadSpeed: settings.fireSpreadSpeed,
        burnStatusTime: settings.burnStatusTime,
        isSkipSpread: settings.isSkipSpread,
        statistics
    });

    // 窗口尺寸变化时尽量保留已有细胞的生/死状态，避免整片森林被清空
    if (previousGrid) {
        const grid = fireSimulate.getCellGrid();
        const copyWidth = Math.min(previousCellNumX, cellNumberX);
        const copyHeight = Math.min(previousCellNumY, cellNumberY);
        for (let y = 0; y < copyHeight; y++) {
            const sourceOffset = y * previousCellNumX;
            const targetOffset = y * cellNumberX;
            for (let x = 0; x < copyWidth; x++) {
                grid[targetOffset + x] = previousGrid[sourceOffset + x] & 0b00000001;
            }
        }
    }

    // 画布后备存储由绘制器设成网格尺寸，放大交给 CSS（image-rendering: pixelated）
    const simulatorContext = simCanvas.getContext("2d");
    simulatorDrawer = new SimulatorDrawer(
        simulatorContext,
        fireSimulate,
        themeDefinition().sim
    );
}

function updateStatisticsChips(fit: PowerLawFit) {
    statsChips.innerHTML = "";
    if (fit.totalFires === 0) {
        const chip = document.createElement("span");
        chip.className = "chip chip-muted";
        chip.textContent = "等待数据";
        statsChips.appendChild(chip);
        return;
    }

    const addChip = (text: string, className = "", title = "") => {
        const chip = document.createElement("span");
        chip.className = "chip " + className;
        chip.textContent = text;
        if (title) {
            chip.title = title;
        }
        statsChips.appendChild(chip);
    };

    const alphaText = fit.alpha === null ? "α —" : "α " + fit.alpha.toFixed(2);
    addChip(alphaText, "chip-accent", "幂律指数 P(s) ∝ s^-α；拟合区间 x ≥ " + fit.fitFrom + "，" + fit.bins + " 个 1.5× 对数分箱");
    addChip("R² " + (fit.r2 === null ? "—" : fit.r2.toFixed(2)), "", "对数密度上的无加权拟合优度");
    addChip("样本 " + formatNumber(fit.totalFires));
    addChip("最大 " + formatNumber(fit.maxSize));
}

function applyThemeChange(theme: ThemeId) {
    applyTheme(theme);
    if (simulatorDrawer) {
        simulatorDrawer.setPalette(THEMES[theme].sim);
    }
    if (statisticsDrawer) {
        statisticsDrawer.setPalette(THEMES[theme].chart);
    }
}

interface ApplyOptions {
    syncPanel?: boolean;
    persist?: boolean;
}

function applySettings(patch: Partial<Settings>, options: ApplyOptions = {}) {
    const previous = settings;
    settings = normalizeSettings({ ...settings, ...patch });

    if (settings.theme !== previous.theme) {
        applyThemeChange(settings.theme);
    }
    if (settings.showClock !== previous.showClock && clock) {
        clock.setVisible(settings.showClock);
    }
    if (settings.chartScale !== previous.chartScale) {
        document.documentElement.style.setProperty("--chart-scale", String(settings.chartScale));
    }
    if (settings.chartHistogram !== previous.chartHistogram && statisticsDrawer) {
        statisticsDrawer.setHistogramMode(settings.chartHistogram);
    }
    if (settings.cellSize !== previous.cellSize) {
        // 细胞尺寸改变后，火灾规模的绝对数值不再可比，重置统计
        statistics.data.clear();
        statistics.version++;
        buildSimulation();
    } else if (settings.pRevive !== previous.pRevive && fireSimulate) {
        fireSimulate.setPRevive(settings.pRevive);
    }
    if (settings.pIgnite !== previous.pIgnite && fireSimulate) {
        fireSimulate.setPIgnite(settings.pIgnite);
    }
    if (settings.fireSpreadSpeed !== previous.fireSpreadSpeed && fireSimulate) {
        fireSimulate.setFireSpreadSpeed(settings.fireSpreadSpeed);
    }
    if (settings.burnStatusTime !== previous.burnStatusTime && fireSimulate) {
        fireSimulate.setBurnStatusTime(settings.burnStatusTime);
    }
    if (settings.isSkipSpread !== previous.isSkipSpread && fireSimulate) {
        fireSimulate.setSkipSpread(settings.isSkipSpread);
    }
    if (options.syncPanel !== false && controlPanel) {
        controlPanel.setSettings(settings);
    }
    if (options.persist !== false) {
        saveSettings(settings);
    }
}

function setPanelOpen(open: boolean) {
    panelRoot.classList.toggle("show", open);
    panelToggle.classList.toggle("is-open", open);
    document.body.classList.toggle("panel-open", open);
    panelToggle.setAttribute("aria-expanded", String(open));
    panelToggle.setAttribute("aria-label", open ? "收起统计面板" : "展开统计面板");
}

function spawnIgnitionRipple(clientX: number, clientY: number) {
    const now = performance.now();
    if (now - lastIgnitionRipple < 90) {
        return;
    }
    lastIgnitionRipple = now;
    const ripple = document.createElement("i");
    ripple.className = "ignite-ripple";
    ripple.style.left = clientX + "px";
    ripple.style.top = clientY + "px";
    fxLayer.appendChild(ripple);
    window.setTimeout(() => ripple.remove(), 720);
}

let isPointerDown = false;
let lastIgniteTime = 0;

function igniteFromPointer(event: PointerEvent) {
    if (!settings.mouseIgnite || !fireSimulate) {
        return;
    }
    const now = performance.now();
    if (now - lastIgniteTime < 45) {
        return;
    }
    lastIgniteTime = now;
    // 画布后备存储是网格尺寸、由 CSS 放大，所以按 CSS 盒子的实际尺寸换算格坐标
    const rect = simCanvas.getBoundingClientRect();
    const cellX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * cellNumberX;
    const cellY = ((event.clientY - rect.top) / Math.max(1, rect.height)) * cellNumberY;
    const radius = Math.max(2, Math.round(5 / settings.cellSize));
    fireSimulate.igniteAt(cellX, cellY, radius);
    spawnIgnitionRipple(event.clientX, event.clientY);
}

simCanvas.addEventListener("pointerdown", (event) => {
    if (!settings.mouseIgnite) {
        return;
    }
    isPointerDown = true;
    simCanvas.setPointerCapture?.(event.pointerId);
    igniteFromPointer(event);
});
simCanvas.addEventListener("pointermove", (event) => {
    if (isPointerDown) {
        igniteFromPointer(event);
    }
});
simCanvas.addEventListener("pointerup", () => {
    isPointerDown = false;
});
simCanvas.addEventListener("pointercancel", () => {
    isPointerDown = false;
});

panelToggle.addEventListener("click", () => {
    setPanelOpen(!panelRoot.classList.contains("show"));
});

function handleResize() {
    if (!fireSimulate) {
        return;
    }
    buildSimulation(true);
}

let resizeTimer = 0;
const scheduleResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(handleResize, 120);
};
const simulationResizeObserver = new ResizeObserver(scheduleResize);
simulationResizeObserver.observe(simCanvas);
window.addEventListener("resize", scheduleResize);

// —— 初始化 ——
clock = new Clock(clockRoot);
clock.setVisible(settings.showClock);

controlPanel = new ControlPanel({
    container: controlsRoot,
    settings,
    onChange: (patch) => applySettings(patch, { syncPanel: patch.theme !== undefined }),
    onResetStatistics: () => {
        statistics.data.clear();
        statistics.version++;
        statisticsDrawer?.requestRender();
    },
    onRebuild: () => {
        buildSimulation();
    }
});

statisticsDrawer = new StatisticsDrawer(
    statsCanvas,
    statistics,
    themeDefinition().chart,
    updateStatisticsChips,
    chartEmpty
);
statisticsDrawer.setHistogramMode(settings.chartHistogram);

buildSimulation();
updateStatisticsChips({
    totalFires: 0,
    maxSize: 0,
    maxFrequency: 0,
    distinctSizes: 0,
    alpha: null,
    r2: null,
    fitFrom: 0,
    fitTo: 0,
    bins: 0
});
setPanelOpen(forcePanelOpen);

document.fonts.ready.then(() => {
    statisticsDrawer?.requestRender();
});

// 主循环：读取实时设置，因此帧间隔可以动态调整
(async function doTickLoop() {
    while (true) {
        if (document.hidden) {
            await sleep(200);
            continue;
        }
        const startTime = performance.now();
        try {
            fireSimulate.tick();
            simulatorDrawer.draw();
            statisticsDrawer.draw();
        } catch (error) {
            // 避免一次偶发异常让壁纸永久停帧
            console.error(error);
            await sleep(120);
            continue;
        }
        const usedTime = performance.now() - startTime;
        const sleepTime = Math.max(2, settings.tickTime - usedTime);
        console.debug(`mspt:${Math.floor(usedTime)};tps:${Math.floor(1000/(sleepTime+usedTime))}`);
        await sleep(sleepTime);
    }
})();

// Wallpaper Engine 用户属性（在浏览器中不存在，监听器会被忽略）
(function setupWallpaperEngineProperties() {
    const apply = (properties: WallpaperProperties) => {
        const patch = settingsPatchFromWallpaperProperties(properties);
        if (Object.keys(patch).length > 0) {
            applySettings(patch, { syncPanel: true });
        }
    };
    (window as unknown as { wallpaperPropertyListener: unknown }).wallpaperPropertyListener = {
        applyUserProperties: apply
    };
})();

// 调试入口：仅在 ?debug=1 时暴露，便于本地检查和截图验证
if (searchParams.get("debug") === "1") {
    (window as unknown as { __emberField: unknown }).__emberField = {
        getSettings: () => settings,
        getStatistics: () => statistics,
        getBurningCount: () => fireSimulate.getBurningCount(),
        applySettings: (patch: Partial<Settings>) => applySettings(patch),
        openPanel: (open = true) => setPanelOpen(open),
        igniteAt: (x: number, y: number, radius = 4) => fireSimulate.igniteAt(x, y, radius),
        injectStatistics: (values: Array<[number, number]>) => {
            statistics.data.clear();
            for (const [size, count] of values) {
                statistics.data.set(size, count);
            }
            statistics.version++;
            statisticsDrawer.requestRender();
        }
    };
}
