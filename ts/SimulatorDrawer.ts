import { FireSimulate } from "./FireSimulate";

export class SimulatorDrawer {
    private context;//画布上下文
    private blockSize;//细胞大小
    //细胞在x和y方向上的数量
    private blockNumX;
    private blockNumY;
    //绘制区域宽和高
    private drawWidth;
    private drawHeight;
    private cellGrid;
    deadColor;//死细胞颜色
    aliveColor;//活细胞颜色
    //不同燃烧状态的颜色
    burnColor1;
    burnColor2;
    burnColor3;

    private oldGrid;//保存上一次绘制的内容，用于剔除未改动的部分

    constructor(
        context: CanvasRenderingContext2D | null,
        blockSize: number,
        blockNumX: number,
        blockNumY: number,
        dataSource: FireSimulate,
        deadColor: string,
        aliveColor: string,
        burnColor1: string,
        burnColor2: string,
        burnColor3: string
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
        this.deadColor = deadColor;
        this.aliveColor = aliveColor;
        this.burnColor1 = burnColor1;
        this.burnColor2 = burnColor2;
        this.burnColor3 = burnColor3;

        this.oldGrid = new Uint8Array(this.cellGrid.length);
        context.fillStyle = deadColor;
        context.fillRect(0, 0, this.drawWidth, this.drawHeight);
    }

    private getCellIndex(x: number, y: number) {
        return y * this.blockNumX + x
    }

    private isSameColor(state1: number, state2: number) {
        if (state1 == state2) {
            return true;
        }
        if ((state1 == 0 || state1 == 1) || (state2 == 0 || state2 == 1)) {
            return false;
        }
        return (state1 >> 1) == (state2 >> 1)
    }

    private getColorStateID(state: number) {
        if (state == 0 || state == 1) {
            return state;
        } else {
            return (state >> 1) + 1;
        }
    }

    draw() {
        // console.log(this._cellGrid)
        //清空上一帧画面
        // this._context.fillStyle = this._deadColor;
        // this._context.fillRect(0, 0, this._drawWidth, this._drawHeight);

        //根据细胞状态选择颜色填充
        //根据模拟部分的更改调整上色条件
        for (let x = 0; x < this.blockNumX; x++) {
            for (let y = 0; y < this.blockNumY; y++) {
                const index = this.getCellIndex(x, y)
                const cellState = this.cellGrid[index];
                const cellStateOld = this.oldGrid[index];
                if (this.isSameColor(cellState, cellStateOld)) {
                    continue;
                }
                const colorStateID = this.getColorStateID(cellState);
                if (colorStateID == 0) {
                    this.context.fillStyle = this.deadColor;
                } else if (colorStateID == 1) {
                    this.context.fillStyle = this.aliveColor;
                } else if (colorStateID == 2) {
                    this.context.fillStyle = this.burnColor1;
                } else if (colorStateID == 3) {
                    this.context.fillStyle = this.burnColor2;
                } else if (colorStateID == 4) {
                    this.context.fillStyle = this.burnColor3;
                } else {
                    this.context.fillStyle = "#ff00ff";
                }
                this.context.fillRect(x * this.blockSize, y * this.blockSize, this.blockSize, this.blockSize);
                this.oldGrid[index] = cellState;
            }
        }
    }
}