import { FireSimulate } from "./FireSimulate";
import { SimPalette } from "./theme";
import { getRGBAFromStr, RGBA } from "./tools";

/**
 * 存活细胞的上色方式：
 * - "hash"  按坐标哈希取色，逐格跳变，呈现散点状的细碎纹理（旧行为）
 * - "index" 按颜色索引表取色，索引由柏林噪声在壁纸启动时一次性生成，
 *           同一片区域里的细胞颜色一致，整体呈现大块的"地形"色块
 */
export type AliveColorMode = "hash" | "index";

export interface SimulatorDrawerOptions {
    /** 画布 2D 上下文。构造期就要求非空，免得每帧再判一次 */
    context: CanvasRenderingContext2D | null;
    /** 细胞状态来源，绘制器直接持有它的 cellGrid 引用 */
    dataSource: FireSimulate;
    /** 当前主题的模拟调色板 */
    palette: SimPalette;
    /** 存活细胞上色方式，默认 "hash" */
    aliveColorMode?: AliveColorMode;
    /**
     * 索引模式下使用的颜色索引表，扁平存储，index = y * cellNumX + x，
     * 值域应为 [0, palette.alive.length)。长度与网格不符时会被忽略。
     */
    aliveColorIndex?: Uint8Array | null;
}

/** 颜色解析失败时的兜底色，与旧实现里内联的默认值保持一致 */
const DEAD_FALLBACK: RGBA = { r: 7, g: 9, b: 11, a: 255 };
const ALIVE_FALLBACK: RGBA = { r: 34, g: 184, b: 95, a: 255 };
const BURN_FALLBACK: readonly RGBA[] = [
    { r: 255, g: 209, b: 102, a: 255 },
    { r: 255, g: 138, b: 61, a: 255 },
    { r: 255, g: 77, b: 109, a: 255 }
];
/** 未知状态（理论上不会出现）的兜底色 */
const UNKNOWN_STATE_COLOR: RGBA = { r: 255, g: 0, b: 255, a: 255 };

/** 把 CSS 颜色解析成一个独立的 RGBA；解析失败时落到 fallback */
function parseColor(css: string, fallback: RGBA): RGBA {
    const color: RGBA = { r: fallback.r, g: fallback.g, b: fallback.b, a: fallback.a };
    getRGBAFromStr(css, color, fallback);
    return color;
}

/**
 * 主画面绘制器。
 *
 * 画布的后备存储直接等于网格尺寸（1 细胞 = 1 像素），像素放大交给浏览器合成器完成
 * （CSS `image-rendering: pixelated`）。因此每帧只需要一次 putImageData：
 * 不再需要离屏画布中转，也不需要 drawImage 做全画布缩放。
 *
 * 这样做的关键在于：离屏画布一旦被 drawImage 当作纹理源引用，每次 putImageData
 * 都会触发一次纹理重上传；而直接写显示画布的后备存储只是一次内存拷贝。
 */
export class SimulatorDrawer {
    private ctx: CanvasRenderingContext2D;
    private pixelBuffer: ImageData;
    private cellGrid: Uint8Array;
    private palette: SimPalette;
    private oldGrid: Uint8Array;
    private cellNumX: number;
    private cellNumY: number;
    /** 调色板三组颜色在构造 / 换主题时一次性解析成 RGBA，逐帧取色不再碰字符串 */
    private deadColor: RGBA;
    private aliveColors: RGBA[];
    private burnColors: RGBA[];
    private aliveColorMode: AliveColorMode;
    private aliveColorIndex: Uint8Array | null;

    constructor(options: SimulatorDrawerOptions) {
        const { context, dataSource, palette } = options;
        if (context === null) {
            throw new Error("SimulatorDrawer:context is null");
        }
        this.ctx = context;
        this.cellNumX = dataSource.getCellNumX();
        this.cellNumY = dataSource.getCellNumY();
        // 后备存储 = 网格尺寸，由 CSS 负责放大到视口
        context.canvas.width = this.cellNumX;
        context.canvas.height = this.cellNumY;
        this.cellGrid = dataSource.getCellGrid();
        this.palette = palette;
        // 先占位，紧接着的 rebuildPaletteColors 会填成真正的调色板颜色
        this.deadColor = { ...DEAD_FALLBACK };
        this.aliveColors = [];
        this.burnColors = [];
        this.rebuildPaletteColors();
        this.aliveColorMode = options.aliveColorMode ?? "hash";
        this.aliveColorIndex = this.checkAliveColorIndex(options.aliveColorIndex ?? null);
        this.oldGrid = new Uint8Array(this.cellGrid.length);
        this.pixelBuffer = new ImageData(this.cellNumX, this.cellNumY);
        this.fillBufferWithDead();
        this.ctx.putImageData(this.pixelBuffer, 0, 0);
    }

    /** 把整张缓冲填成背景色 */
    private fillBufferWithDead() {
        const data = this.pixelBuffer.data;
        const { r, g, b, a } = this.deadColor;
        for (let i = 0; i < data.length; i += 4) {
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = a;
        }
    }

    private getColorStateID(state: number) {
        if (state === 0 || state === 1) {
            return state;
        }
        return (state >> 1) + 1;
    }

    /**
     * 把调色板的三组颜色（死亡 / 存活各档 / 燃烧三段）一次性解析成 RGBA。
     * 逐帧绘制时每个变化的细胞都要取一次色，走颜色字符串缓存太浪费，所以只解析这一次。
     */
    private rebuildPaletteColors() {
        const palette = this.palette;
        this.deadColor = parseColor(palette.dead, DEAD_FALLBACK);

        this.aliveColors = palette.alive.map((css) => parseColor(css, ALIVE_FALLBACK));
        // 空调色板时也得留一档，否则存活细胞会取到 undefined
        if (this.aliveColors.length === 0) {
            this.aliveColors.push({ ...ALIVE_FALLBACK });
        }

        // burn 是三元组，但调色板少了某段时也按同一档兜底
        this.burnColors = BURN_FALLBACK.map((fallback, index) =>
            parseColor(palette.burn[index] ?? "", fallback)
        );
    }

    /**
     * 校验颜色索引表是否与当前网格匹配，不匹配时退回 null（即按哈希取色）。
     */
    private checkAliveColorIndex(index: Uint8Array | null): Uint8Array | null {
        if (index === null) {
            return null;
        }
        const size = this.cellNumX * this.cellNumY;
        if (index.length !== size) {
            console.warn(
                `SimulatorDrawer:颜色索引表长度 ${index.length} 与网格 ${size} 不符，已退回哈希取色`
            );
            return null;
        }
        return index;
    }

    /**
     * 取存活细胞的颜色。
     * - index 模式：读启动时生成的颜色索引表，色块成片分布；
     * - hash 模式：按坐标哈希取档，呈现散点状纹理。
     * 拿不到索引表、或调色板档数比索引值少时都会兜底，保证不会取空。
     */
    private getAliveColor(x: number, y: number, idx: number): RGBA {
        const colors = this.aliveColors;
        if (colors.length === 1) {
            return colors[0];
        }
        const indexMap = this.aliveColorIndex;
        if (this.aliveColorMode === "index" && indexMap !== null) {
            const level = indexMap[idx];
            // 主题切换后存活档数可能变少，多出来的索引值折回合法区间
            return colors[level < colors.length ? level : level % colors.length];
        }
        const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        return colors[hash % colors.length];
    }

    /**
     * 颜色状态 → 调色板颜色，全部来自预解析缓存。
     * 存活态（1）要按上色模式选档，其余各态各有一档固定色。
     */
    private getStateColor(stateID: number, x: number, y: number, idx: number): RGBA {
        switch (stateID) {
            case 0:
                return this.deadColor;
            case 1:
                return this.getAliveColor(x, y, idx);
            case 2:
                return this.burnColors[0];
            case 3:
                return this.burnColors[1];
            case 4:
                return this.burnColors[2];
            default:
                return UNKNOWN_STATE_COLOR;
        }
    }

    /**
     * 绘制一帧图像。只有发生变化的细胞会写入像素缓冲；
     * 整帧没有任何变化时直接跳过上传。
     */
    draw() {
        const cellGrid = this.cellGrid;
        const oldGrid = this.oldGrid;
        const data = this.pixelBuffer.data;
        const width = this.cellNumX;
        const height = this.cellNumY;
        let dirty = false;

        for (let y = 0; y < height; y++) {
            let idx = y * width;
            for (let x = 0; x < width; x++, idx++) {
                const state = cellGrid[idx];
                const prev = oldGrid[idx];
                // 绝大多数细胞状态没变，先走最快的一步判断
                if (state === prev) {
                    continue;
                }
                // 燃烧阶段内部推进（如 4→5）渲染出来是同一个色阶，不必重绘。
                // 生死两态（0/1）颜色各不相同，必须精确比较，所以要求两侧都 >1。
                if (state > 1 && prev > 1 && (state >> 1) === (prev >> 1)) {
                    continue;
                }
                // 颜色全部来自预解析缓存，这里只剩一次查表 + 一次写入
                const color = this.getStateColor(this.getColorStateID(state), x, y, idx);
                const offset = idx << 2;
                data[offset] = color.r;
                data[offset + 1] = color.g;
                data[offset + 2] = color.b;
                data[offset + 3] = color.a;
                oldGrid[idx] = state;
                dirty = true;
            }
        }

        if (dirty) {
            this.ctx.putImageData(this.pixelBuffer, 0, 0);
        }
    }

    setPalette(palette: SimPalette) {
        this.palette = palette;
        this.rebuildPaletteColors();
        this.repaint();
    }

    /**
     * 切换存活细胞的上色方式。颜色索引不参与逐帧的状态比较，
     * 所以切换后必须整体重绘。
     * @param colorIndex 索引模式要用的颜色索引表；省略（undefined）表示沿用当前表
     */
    setAliveColorMode(mode: AliveColorMode, colorIndex?: Uint8Array | null) {
        if (colorIndex !== undefined) {
            this.aliveColorIndex = this.checkAliveColorIndex(colorIndex);
        }
        this.aliveColorMode = mode;
        this.repaint();
    }

    getAliveColorMode(): AliveColorMode {
        return this.aliveColorMode;
    }

    /**
     * 主题切换或重新构建后全量重绘。
     */
    repaint() {
        this.fillBufferWithDead();
        // 255 不是任何合法细胞状态，强制所有细胞重新写色
        this.oldGrid.fill(255);
        this.draw();
    }
}
