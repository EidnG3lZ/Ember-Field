export class FireSimulate {
    private cellNumX;
    private cellNumY;
    private pRevive;
    private pIgnite;
    private fireSpreadSpeed;
    private cellGrid;//细胞状态：0：死亡，1：生存，2-4：燃烧
    private isInFire = false;

    private directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];//定义什么算“相邻”
    //搜索的输入和输出数组
    private bfsSearchCells = new Array();
    private bfsOutputCells = new Array();

    constructor(cellNumX: number, cellNumY: number, pRevive: number, pIgnite: number, fireSpreadSpeed: number = 10) {
        this.cellNumX = cellNumX;
        this.cellNumY = cellNumY;
        this.pRevive = pRevive;
        this.pIgnite = pIgnite;
        this.fireSpreadSpeed = fireSpreadSpeed;
        this.cellGrid = new Uint8Array(this.cellNumX * this.cellNumY);
    }

    private getCellIndex(x: number, y: number) {
        return y * this.cellNumX + x
    }

    //输入待搜索细胞，将输入细胞的相邻活细胞变为燃烧状态，输出下一轮应搜索的细胞
    //targetCells是一个成员为[x,y]的数组；outputCells作为输出数组，以避免频繁创建删除对象
    private bfsIgniteNext(targetCells: any[], outputCells: any[]) {
        outputCells.length = 0;//清空输出数组
        for (let [cellX, cellY] of targetCells) {
            //遍历相对位置细胞
            for (let [dx, dy] of this.directions) {
                let searchingX = cellX + dx;
                let searchingY = cellY + dy;
                //排除越界
                if (searchingX < 0 || searchingX >= this.cellNumX || searchingY < 0 || searchingY >= this.cellNumY) {
                    continue;
                }
                //判断是否为存活
                let searchingIndex = this.getCellIndex(searchingX, searchingY);
                if (this.cellGrid[searchingIndex] == 1) {
                    outputCells.push([searchingX, searchingY]);//加入下一轮搜索
                    this.cellGrid[searchingIndex] = 2;//设置为燃烧状态
                }
            }
        }
    }

    //细胞网格的getter
    getCellGrid() {
        return this.cellGrid;
    }

    setPRevive(value: number) {
        this.pRevive = value;
    }

    setPIgnite(value: number) {
        this.pIgnite = value;
    }

    setFireSpreadSpeed(value: number) {
        this.fireSpreadSpeed = value;
    }

    tick() {
        // console.log(this._cellGrid)
        //火灾
        fire:
        {
            if (this.isInFire == true) {
                //遍历所有细胞，推进燃烧阶段；没有细胞可推进时退出火灾状态
                let counter = 0;
                for (let cellIndex in this.cellGrid) {
                    if (this.cellGrid[cellIndex] >= 2) {
                        counter++;
                        this.cellGrid[cellIndex]++;
                        if (this.cellGrid[cellIndex] > 4) {
                            this.cellGrid[cellIndex] = 0;
                        }
                    }
                }
                if (counter == 0) {
                    this.isInFire = false;
                    break fire;
                }
                //蔓延火灾
                for (let i = 0; i < this.fireSpreadSpeed; i++) {
                    this.bfsIgniteNext(this.bfsSearchCells, this.bfsOutputCells);//火灾蔓延至下一批细胞，输出下一帧待搜索细胞
                    //交换输入和输出
                    let temp = this.bfsSearchCells;
                    this.bfsSearchCells = this.bfsOutputCells;
                    this.bfsOutputCells = temp;
                    if (this.bfsSearchCells.length == 0) {
                        break;
                    }
                }

                //不再执行生长和点火
                return;
            }
        }

        //随机生长
        for (let index in this.cellGrid) {
            if ((this.cellGrid[index] == 0) && (Math.random() < this.pRevive)) {
                this.cellGrid[index] = 1;
            }
        }
        //随机点火
        for (let x = 0; x < this.cellNumX; x++) {
            for (let y = 0; y < this.cellNumY; y++) {
                let cellIndex = this.getCellIndex(x, y);
                if ((this.cellGrid[cellIndex] == 1) && (Math.random() < this.pIgnite)) {
                    this.cellGrid[cellIndex] = 2;//起火点设置为燃烧状态
                    this.bfsSearchCells.push([x, y]);//起火点加入搜索数组
                    this.isInFire = true;//进入火灾蔓延状态
                }
            }
        }
    }
}