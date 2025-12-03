export class Drawer {
    private context;
    private blockSize;
    private blockNumX;
    private blockNumY;
    private drawWidth;
    private drawHeight;
    private cellGrid;
    private deadColor;
    private aliveColor;
    private burnColor1;
    private burnColor2;
    private burnColor3;
    //保存上一次绘制的内容，用于剔除未改动的部分
    private oldGrid;

    constructor(
        context: CanvasRenderingContext2D | null,
        blockSize: number,
        blockNumX: number,
        blockNumY: number,
        cellGrid: Uint8Array,
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
        this.cellGrid = cellGrid;
        this.deadColor = deadColor;
        this.aliveColor = aliveColor;
        this.burnColor1 = burnColor1;
        this.burnColor2 = burnColor2;
        this.burnColor3 = burnColor3;

        this.oldGrid = new Uint8Array(cellGrid.length);
        context.fillStyle = deadColor;
        context.fillRect(0, 0, this.drawWidth, this.drawHeight);
    }

    setDeadColor(value: string) {
        this.deadColor = value;
    }

    setAliveColor(value: string) {
        this.aliveColor = value;
    }

    setBurnColor1(value: string) {
        this.burnColor1 = value;
    }

    setBurnColor2(value: string) {
        this.burnColor2 = value;
    }

    setBurnColor3(value: string) {
        this.burnColor3 = value;
    }

    private getCellIndex(x: number, y: number) {
        return y * this.blockNumX + x
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
                if (cellState == cellStateOld) {
                    continue;
                }
                if (cellState == 0) {
                    this.context.fillStyle = this.deadColor;
                } else if (cellState == 1) {
                    this.context.fillStyle = this.aliveColor;
                } else if (cellState == 2) {
                    this.context.fillStyle = this.burnColor1;
                } else if (cellState == 3) {
                    this.context.fillStyle = this.burnColor2;
                } else if (cellState == 4) {
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