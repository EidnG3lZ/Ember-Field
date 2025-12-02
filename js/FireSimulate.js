class FireSimulate {
    _cellNumX;
    _cellNumY;
    _pRevive;
    _pIgnite;
    _cellGrid;//细胞状态：0：死亡，1：生存，2、3、4：燃烧
    _isInFire = false;

    _directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];//定义什么算“相邻”
    //搜索的输入和输出数组
    _bfsSearchCells = new Array();
    _bfsOutputCells = new Array();

    constructor(cellNumX, cellNumY, pRevive, pIgnite) {
        this._cellNumX = cellNumX;
        this._cellNumY = cellNumY;
        this._pRevive = pRevive;
        this._pIgnite = pIgnite;
        this._cellGrid = new Uint8Array(this._cellNumX * this._cellNumY);
    }

    _getCellIndex(x, y) {
        return y * this._cellNumX + x
    }

    //输入待搜索细胞，将输入细胞的相邻活细胞变为燃烧状态，输出下一轮应搜索的细胞
    //targetCells是一个成员为[x,y]的数组；outputCells作为输出数组，以避免频繁创建删除对象
    _bfsFireNext(targetCells, outputCells) {
        outputCells.length = 0;//清空输出数组
        for (let [cellX, cellY] of targetCells) {
            //遍历相对位置细胞
            for (let [dx, dy] of this._directions) {
                let searchingX = cellX + dx;
                let searchingY = cellY + dy;
                //排除越界
                if (searchingX < 0 || searchingX >= this._cellNumX || searchingY < 0 || searchingY >= this._cellNumY) {
                    continue;
                }
                //判断是否为存活
                let searchingIndex = this._getCellIndex(searchingX, searchingY);
                if (this._cellGrid[searchingIndex] == 1) {
                    outputCells.push([searchingX, searchingY]);//加入下一轮搜索
                    this._cellGrid[searchingIndex] = 2;//设置为燃烧状态
                }
            }
        }
    }

    //细胞网格的getter
    getCellGrid() {
        return this._cellGrid;
    }

    setPRevive(value) {
        this._pRevive = value;
    }

    setPIgnite(value) {
        this._pIgnite = value;
    }

    tick() {
        // console.log(this._cellGrid)
        //火灾
        fire:
        {
            if (this._isInFire == true) {
                this._bfsFireNext(this._bfsSearchCells, this._bfsOutputCells);//火灾蔓延至下一批细胞，输出下一帧待搜索细胞
                //交换输入和输出
                let temp = this._bfsSearchCells;
                this._bfsSearchCells = this._bfsOutputCells;
                this._bfsOutputCells = temp;

                //遍历所有细胞，推进燃烧阶段；没有细胞可推进时退出火灾状态
                let counter = 0;
                for (let cellIndex in this._cellGrid) {
                    if (this._cellGrid[cellIndex] >= 2) {
                        counter++;
                        this._cellGrid[cellIndex]++;
                        if (this._cellGrid[cellIndex] >= 5) {
                            this._cellGrid[cellIndex] = 0;
                        }
                    }
                }
                if (counter == 0) {
                    this._isInFire = false;
                    break fire;
                }
                return;
            }
        }

        //随机生长
        for (let x = 0; x < this._cellNumX; x++) {
            for (let y = 0; y < this._cellNumY; y++) {
                let cellIndex = this._getCellIndex(x,y);
                if ((this._cellGrid[cellIndex] == 0) && (Math.random() < this._pRevive)) {
                    this._cellGrid[cellIndex] = 1;
                }
            }
        }
        //随机点火
        for (let x = 0; x < this._cellNumX; x++) {
            for (let y = 0; y < this._cellNumY; y++) {
                let cellIndex = this._getCellIndex(x, y);
                if ((this._cellGrid[cellIndex] == 1) && (Math.random() < this._pIgnite)) {
                    this._cellGrid[cellIndex] = 2;//起火点设置为燃烧状态
                    this._bfsSearchCells.push([x, y]);//起火点加入搜索数组
                    this._isInFire = true;//进入火灾蔓延状态
                }
            }
        }
    }
}