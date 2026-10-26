import { FireSimulate } from "./FireSimulate";
import { SimPalette } from "./theme";
import { getRGBAFromStr } from "./tools";

export class SimulatorDrawer {
    private ctx: CanvasRenderingContext2D;
    private zoomCanvas: HTMLCanvasElement;
    private zoomCanvasCtx: CanvasRenderingContext2D;
    private pixelBuffer: ImageData;
    private blockNumX: number;
    private blockNumY: number;
    private drawWidth: number;
    private drawHeight: number;
    private cellGrid: Uint8Array;
    private palette: SimPalette;
    private oldGrid: Uint8Array;

    constructor(
        context: CanvasRenderingContext2D | null,
        blockSize: number,
        dataSource: FireSimulate,
        palette: SimPalette
    ) {
        if (context === null) {
            throw new Error("SimulatorDrawer:context is null");
        }
        this.ctx = context;
        this.blockNumX = dataSource.getCellNumX();
        this.blockNumY = dataSource.getCellNumY();
        this.drawWidth = blockSize * this.blockNumX;
        this.drawHeight = blockSize * this.blockNumY;
        this.cellGrid = dataSource.getCellGrid();
        this.palette = palette;
        this.oldGrid = new Uint8Array(this.cellGrid.length);
        this.pixelBuffer = new ImageData(this.blockNumX, this.blockNumY);
        this.zoomCanvas = document.createElement("canvas");
        this.zoomCanvas.width = this.blockNumX;
        this.zoomCanvas.height = this.blockNumY;
        const tempCtx = this.zoomCanvas.getContext("2d");
        if (tempCtx === null) {
            throw new Error("SimulatorDrawer init fail:zoom canvas creation failed or its context acquisition failed");
        }
        this.zoomCanvasCtx = tempCtx;
        context.fillStyle = palette.dead;
        context.fillRect(0, 0, this.drawWidth, this.drawHeight);
    }

    private setBufferPixel(pixelIndex: number, color: { r: number, g: number, b: number, a?: number }) {
        const pixelBuffer = this.pixelBuffer;
        const bufferDataOffset = 4 * pixelIndex;
        pixelBuffer.data[bufferDataOffset + 0] = color.r;
        pixelBuffer.data[bufferDataOffset + 1] = color.g;
        pixelBuffer.data[bufferDataOffset + 2] = color.b;
        pixelBuffer.data[bufferDataOffset + 3] = color.a ?? 255;
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
     * 绘制一帧图像
     */
    draw() {
        //使用编辑ImageData后绘制再缩放的方式减少单次绘制的canvas调用次数
        //据说能够提升性能
        const cellGrid = this.cellGrid;
        const oldGrid = this.oldGrid;
        const palette = this.palette;
        const width = this.pixelBuffer.width;
        const height = this.pixelBuffer.height;
        const drawWidth = this.drawWidth;
        const drawHeight = this.drawHeight;
        const ctx = this.ctx;
        const zoomCanvas = this.zoomCanvas;
        const zoomCanvasCtx = this.zoomCanvasCtx;
        for (let y = 0; y < height; y += 1) {
            let idxOffset = y * width;
            for (let x = 0; x < width; x += 1) {
                const idx = idxOffset + x;
                if (cellGrid[idx] === oldGrid[idx]) {
                    continue;
                }
                const colorStateID = this.getColorStateID(cellGrid[idx]);
                switch (colorStateID) {
                    case 0:
                        this.setBufferPixel(idx, getRGBAFromStr(palette.dead) ?? { r: 7, g: 9, b: 11 });
                        break;
                    case 1:
                        this.setBufferPixel(idx, getRGBAFromStr(this.getAliveColor(x, y)) ?? { r: 34, g: 184, b: 95 });
                        break;
                    case 2:
                        this.setBufferPixel(idx, getRGBAFromStr(palette.burn[0]) ?? { r: 255, g: 209, b: 102 });
                        break;
                    case 3:
                        this.setBufferPixel(idx, getRGBAFromStr(palette.burn[1]) ?? { r: 255, g: 138, b: 61 });
                        break;
                    case 4:
                        this.setBufferPixel(idx, getRGBAFromStr(palette.burn[2]) ?? { r: 255, g: 77, b: 109 });
                        break;
                    default:
                        this.setBufferPixel(idx, { r: 255, g: 0, b: 255 })
                        break;
                }
                oldGrid[idx] = cellGrid[idx];
            }
        }
        zoomCanvasCtx.putImageData(this.pixelBuffer, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(zoomCanvas, 0, 0, drawWidth, drawHeight);
    }

    setPalette(palette: SimPalette) {
        this.palette = palette;
        this.repaint();
    }

    /**
     * 主题切换或重新构建后全量重绘。
     */
    repaint() {
        this.ctx.fillStyle = this.palette.dead;
        this.ctx.fillRect(0, 0, this.drawWidth, this.drawHeight);
        this.oldGrid.fill(255);
        this.draw();
    }
}