import { FireSimulate } from "./FireSimulateNew";
import { SimPalette } from "./theme";
import { getRGBAFromStr, RGBA } from "./tools";

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
    private tempRGBA: RGBA;
    private cellNumX: number;
    private cellNumY: number;

    constructor(
        context: CanvasRenderingContext2D | null,
        dataSource: FireSimulate,
        palette: SimPalette
    ) {
        if (context === null) {
            throw new Error("SimulatorDrawer:context is null");
        }
        this.tempRGBA = { r: 0, g: 0, b: 0, a: 0 };
        this.ctx = context;
        this.cellNumX = dataSource.getCellNumX();
        this.cellNumY = dataSource.getCellNumY();
        // 后备存储 = 网格尺寸，由 CSS 负责放大到视口
        context.canvas.width = this.cellNumX;
        context.canvas.height = this.cellNumY;
        this.cellGrid = dataSource.getCellGrid();
        this.palette = palette;
        this.oldGrid = new Uint8Array(this.cellGrid.length);
        this.pixelBuffer = new ImageData(this.cellNumX, this.cellNumY);
        this.fillBufferWithDead();
        this.ctx.putImageData(this.pixelBuffer, 0, 0);
    }

    /** 把整张缓冲填成背景色 */
    private fillBufferWithDead() {
        getRGBAFromStr(this.palette.dead, this.tempRGBA, { r: 7, g: 9, b: 11, a: 255 });
        const data = this.pixelBuffer.data;
        const { r, g, b, a } = this.tempRGBA;
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

    private getAliveColor(x: number, y: number) {
        const alive = this.palette.alive;
        if (alive.length === 1) {
            return alive[0];
        }
        const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        return alive[hash % alive.length];
    }

    /**
     * 绘制一帧图像。只有发生变化的细胞会写入像素缓冲；
     * 整帧没有任何变化时直接跳过上传。
     */
    draw() {
        const cellGrid = this.cellGrid;
        const oldGrid = this.oldGrid;
        const palette = this.palette;
        const data = this.pixelBuffer.data;
        const width = this.cellNumX;
        const height = this.cellNumY;
        const tempRGBA = this.tempRGBA;
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
                switch (this.getColorStateID(state)) {
                    case 0:
                        getRGBAFromStr(palette.dead, tempRGBA, { r: 7, g: 9, b: 11, a: 255 });
                        break;
                    case 1:
                        getRGBAFromStr(this.getAliveColor(x, y), tempRGBA, { r: 34, g: 184, b: 95, a: 255 });
                        break;
                    case 2:
                        getRGBAFromStr(palette.burn[0], tempRGBA, { r: 255, g: 209, b: 102, a: 255 });
                        break;
                    case 3:
                        getRGBAFromStr(palette.burn[1], tempRGBA, { r: 255, g: 138, b: 61, a: 255 });
                        break;
                    case 4:
                        getRGBAFromStr(palette.burn[2], tempRGBA, { r: 255, g: 77, b: 109, a: 255 });
                        break;
                    default:
                        tempRGBA.r = 255;
                        tempRGBA.g = 0;
                        tempRGBA.b = 255;
                        tempRGBA.a = 255;
                        break;
                }
                const offset = idx << 2;
                data[offset] = tempRGBA.r;
                data[offset + 1] = tempRGBA.g;
                data[offset + 2] = tempRGBA.b;
                data[offset + 3] = tempRGBA.a;
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
        this.repaint();
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
