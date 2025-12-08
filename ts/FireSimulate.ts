export class FireSimulate {
    private cellNumX;
    private cellNumY;
    private pRevive;
    private pIgnite;
    private fireSpreadSpeed;
    private burnStatusTime;
    private isSkipSpread;//跳过火灾传播过程
    //细胞状态：
    //0b_______0：死亡
    //0b_______1：生存
    //0b_____00_：未燃烧
    //0b_____01_：燃烧阶段1
    //0b_____10_：燃烧阶段2
    //0b_____11_：燃烧阶段3
    private cellGrid;
    private fireStatistics: FireStatistics;//火灾统计
    private statisticsTemp = 0;
    private isInFire = false;
    private burnTimer: number = 0;

    private directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];//定义什么算“相邻”
    //搜索的输入和输出数组
    private bfsSearchCells = new Array();
    private bfsOutputCells = new Array();

    constructor(
        cellNumX: number,
        cellNumY: number,
        pRevive: number,
        pIgnite: number,
        fireSpreadSpeed: number,
        burnStatusTime: number,
        isSkipSpread: boolean
    ) {
        this.cellNumX = cellNumX;
        this.cellNumY = cellNumY;
        this.pRevive = pRevive;
        this.pIgnite = pIgnite;
        this.fireSpreadSpeed = fireSpreadSpeed;
        this.burnStatusTime = (burnStatusTime >= 1) ? burnStatusTime : 1;
        this.isSkipSpread = isSkipSpread;
        const cellNum = cellNumX * cellNumY;
        this.cellGrid = new Uint8Array(cellNum);
        this.fireStatistics = {
            version: 0,
            data: new Map()
        }
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
                if ((this.cellGrid[searchingIndex] & 0b00000001) == 1) {
                    outputCells.push([searchingX, searchingY]);//加入下一轮搜索
                    this.cellGrid[searchingIndex] = 0b00000010;//设置为燃烧状态
                }
            }
        }
    }

    //细胞网格的getter
    getCellGrid() {
        return this.cellGrid;
    }

    //火灾统计信息
    getFireStatistics() {
        return this.fireStatistics;
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

    setBurnStatusTime(value: number) {
        this.burnStatusTime = value;
    }

    // setSkipSpread(value:boolean){
    //     this.isSkipSpread = value;
    // }

    tick() {
        // console.log(this._cellGrid)
        //火灾
        fire:
        {
            if (this.isInFire == true) {

                //遍历所有细胞，推进燃烧阶段；没有细胞可推进时退出火灾状态
                if (this.burnTimer == 0) {
                    let counter = 0;
                    for (let cellIndex in this.cellGrid) {
                        if ((this.cellGrid[cellIndex] >> 1) >= 1) {
                            counter++;
                            this.cellGrid[cellIndex] = this.cellGrid[cellIndex] + 0b10;//燃烧状态是第2、3位，因此推进状态要+2（0b10）
                            if ((this.cellGrid[cellIndex] >> 1) > 3) {
                                this.cellGrid[cellIndex] = this.cellGrid[cellIndex] & 0b00000001;//清除（设为0）燃烧状态
                            }
                        }
                    }
                    if (counter == 0) {
                        this.isInFire = false;
                        this.burnTimer = 0;
                        if (this.statisticsTemp > 0) {
                            const fireCounter = this.fireStatistics.data.get(this.statisticsTemp) ?? 0;
                            this.fireStatistics.data.set(this.statisticsTemp, fireCounter + 1);
                            this.fireStatistics.version++;
                            this.statisticsTemp = 0;
                        }
                        break fire;
                    }
                }
                this.burnTimer++;
                if (this.burnTimer >= this.burnStatusTime) {
                    this.burnTimer = 0;
                }

                //蔓延火灾，只在未选择跳过火灾传播过程时执行
                if (!this.isSkipSpread) {
                    for (let i = 0; i < this.fireSpreadSpeed; i++) {
                        this.statisticsTemp = this.statisticsTemp + this.bfsSearchCells.length;
                        this.bfsIgniteNext(this.bfsSearchCells, this.bfsOutputCells);//火灾蔓延至下一批细胞，输出下一帧待搜索细胞
                        //交换输入和输出
                        let temp = this.bfsSearchCells;
                        this.bfsSearchCells = this.bfsOutputCells;
                        this.bfsOutputCells = temp;
                        if (this.bfsSearchCells.length == 0) {
                            break;
                        }
                    }
                }

                //不跳过火灾传播过程时不再执行生长和点火
                if (!this.isSkipSpread) {
                    return;
                }
            }
        }

        //随机生长
        for (let index in this.cellGrid) {
            if (((this.cellGrid[index] & 0b00000001) == 0) && (Math.random() < this.pRevive)) {
                this.cellGrid[index] = (1 | (this.cellGrid[index] & 0b00000110));
            }
        }
        //随机点火
        for (let x = 0; x < this.cellNumX; x++) {
            for (let y = 0; y < this.cellNumY; y++) {
                let cellIndex = this.getCellIndex(x, y);
                if (((this.cellGrid[cellIndex] & 0b00000001) == 1) && (Math.random() < this.pIgnite)) {
                    this.cellGrid[cellIndex] = 0b00000010;//起火点设置为燃烧状态
                    this.bfsSearchCells.push([x, y]);//起火点加入搜索数组
                    this.isInFire = true;//进入火灾蔓延状态
                }
            }
        }
        if (this.isSkipSpread) {
            let statisticsTemp = 0;
            while (this.bfsSearchCells.length > 0) {
                statisticsTemp = statisticsTemp + this.bfsSearchCells.length;
                this.bfsIgniteNext(this.bfsSearchCells, this.bfsOutputCells);//火灾蔓延至下一批细胞，输出下一帧待搜索细胞
                //交换输入和输出
                let temp = this.bfsSearchCells;
                this.bfsSearchCells = this.bfsOutputCells;
                this.bfsOutputCells = temp;
            }
            if (statisticsTemp > 0) {
                const fireCounter = this.fireStatistics.data.get(statisticsTemp) ?? 0;
                this.fireStatistics.data.set(statisticsTemp, fireCounter + 1);
                this.fireStatistics.version++;
            }
        }
    }
}
export interface FireStatistics {
    version: number;
    data: Map<number, number>;
}