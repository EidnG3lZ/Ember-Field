import { FireSimulate } from "./FireSimulate";
import { SimPalette } from "./theme";

/**
 * 主画面绘制器。利用 oldGrid 做差分绘制，只重绘颜色发生变化的细胞。
 */
export class SimulatorDrawer {
    private context: CanvasRenderingContext2D;
    private blockSize: number;
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
        blockNumX: number,
        blockNumY: number,
        dataSource: FireSimulate,
        palette: SimPalette
    ) {
        if (context == null) {
            throw new Error("context is null");
        }
        this.context = context;
        this.blockSize = blockSize;
        this.blockNumX = blockNumX;
        this.blockNumY = blockNumY;
        this.drawWidth = blockSize * blockNumX;
        this.drawHeight = blockSize * blockNumY;
        this.cellGrid = dataSource.getCellGrid();
        this.palette = palette;
        this.oldGrid = new Uint8Array(this.cellGrid.length);
        context.fillStyle = palette.dead;
        context.fillRect(0, 0, this.drawWidth, this.drawHeight);
    }

    private getCellIndex(x: number, y: number) {
        return y * this.blockNumX + x;
    }

    private isSameColor(state1: number, state2: number) {
        if (state1 === state2) {
            return true;
        }
        if ((state1 === 0 || state1 === 1) || (state2 === 0 || state2 === 1)) {
            return false;
        }
        return (state1 >> 1) === (state2 >> 1);
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

    draw() {
        const context = this.context;
        const grid = this.cellGrid;
        const oldGrid = this.oldGrid;
        const blockSize = this.blockSize;
        const palette = this.palette;
        for (let y = 0; y < this.blockNumY; y++) {
            const rowOffset = y * this.blockNumX;
            for (let x = 0; x < this.blockNumX; x++) {
                const index = rowOffset + x;
                const cellState = grid[index];
                const cellStateOld = oldGrid[index];
                if (this.isSameColor(cellState, cellStateOld)) {
                    continue;
                }
                const colorStateID = this.getColorStateID(cellState);
                if (colorStateID === 0) {
                    context.fillStyle = palette.dead;
                } else if (colorStateID === 1) {
                    context.fillStyle = this.getAliveColor(x, y);
                } else if (colorStateID === 2) {
                    context.fillStyle = palette.burn[0];
                } else if (colorStateID === 3) {
                    context.fillStyle = palette.burn[1];
                } else if (colorStateID === 4) {
                    context.fillStyle = palette.burn[2];
                } else {
                    context.fillStyle = "#ff00ff";
                }
                context.fillRect(x * blockSize, y * blockSize, blockSize, blockSize);
                oldGrid[index] = cellState;
            }
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
        this.context.fillStyle = this.palette.dead;
        this.context.fillRect(0, 0, this.drawWidth, this.drawHeight);
        this.oldGrid.fill(255);
        this.draw();
    }
}
