//todo:加个只绘制变更内容的功能
class Drawer {
    _context;
    _blockSize;
    _blockNumX;
    _blockNumY;
    _drawWidth;
    _drawHeight;
    _cellGrid;
    _deadColor;
    _aliveColor;
    _burnColor1;
    _burnColor2;
    _burnColor3;

    constructor(context, blockSize, blockNumX, blockNumY, cellGrid, deadColor, aliveColor, burnColor1, burnColor2, burnColor3) {
        this._context = context;
        this._blockSize = blockSize;
        this._blockNumX = blockNumX;
        this._blockNumY = blockNumY;
        this._drawWidth = blockSize*blockNumX;
        this._drawHeight = blockSize*blockNumY;
        this._cellGrid = cellGrid;
        this._deadColor = deadColor;
        this._aliveColor = aliveColor;
        this._burnColor1 = burnColor1;
        this._burnColor2 = burnColor2;
        this._burnColor3 = burnColor3;
    }

    setDeadColor(value) {
        this._deadColor = value;
    }

    setAliveColor(value) {
        this._aliveColor = value;
    }

    setBurnColor1(value) {
        this._burnColor1 = value;
    }

    setBurnColor2(value) {
        this._burnColor2 = value;
    }

    setBurnColor3(value) {
        this._burnColor3 = value;
    }

    _getCellIndex(x, y) {
        return y * this._blockNumX + x
    }

    draw() {
        // console.log(this._cellGrid)
        //清空上一帧画面
        this._context.fillStyle = this._deadColor;
        this._context.fillRect(0,0,this._drawWidth,this._drawHeight);
        //根据细胞状态选择颜色填充
        for(let x=0;x<this._blockNumX;x++){
            for(let y=0;y<this._blockNumY;y++){
                const cellState = this._cellGrid[this._getCellIndex(x,y)];
                switch (cellState) {
                    case 0:
                        this._context.fillStyle = this._deadColor;
                        break;
                    case 1:
                        this._context.fillStyle = this._aliveColor;
                        break;
                    case 2:
                        this._context.fillStyle = this._burnColor1;
                        break;
                    case 3:
                        this._context.fillStyle = this._burnColor2;
                        break;
                    case 4:
                        this._context.fillStyle = this._burnColor3;
                        break;
                
                    default:
                        this._context.fillStyle = "#ff00ff";
                        break;
                }
                this._context.fillRect(x*this._blockSize,y*this._blockSize,this._blockSize,this._blockSize);
            }
        }
    }
}