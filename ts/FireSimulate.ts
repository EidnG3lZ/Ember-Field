export interface FireStatistics {
    version: number;
    /** 火灾规模（燃烧细胞总数） -> 发生次数 */
    data: Map<number, number>;
}

export interface FireSimulateOptions {
    cellNumX: number;
    cellNumY: number;
    pRevive: number;
    pIgnite: number;
    fireSpreadSpeed: number;
    burnStatusTime: number;
    isSkipSpread: boolean;
    statistics?: FireStatistics;
}

const DIRECTION_X = [1, -1, 0, 0];
const DIRECTION_Y = [0, 0, 1, -1];

export function createFireStatistics(): FireStatistics {
    return {
        version: 0,
        data: new Map()
    };
}

export class FireSimulate {
    private cellNumX: number;
    private cellNumY: number;
    private pRevive: number;
    private pIgnite: number;
    private fireSpreadSpeed: number;
    private burnStatusTime: number;
    private isSkipSpread: boolean;
    // 细胞状态：
    // 0b_______0：死亡
    // 0b_______1：生存
    // 0b_____00_：未燃烧
    // 0b_____01_：燃烧阶段1
    // 0b_____10_：燃烧阶段2
    // 0b_____11_：燃烧阶段3
    private cellGrid: Uint8Array;
    private statistics: FireStatistics;
    private statisticsTemp = 0;
    private isInFire = false;

    // 每个燃烧细胞独立计时：1..3*burnStatusTime 表示燃烧年龄，0 表示未燃烧。
    // 不同时间被点燃的细胞会错开变色和熄灭，而不是整片一起跳变。
    private burnAge: Uint8Array;
    private burningCells: number[] = [];
    // 把“每 burnStatusTime 帧推进 fireSpreadSpeed 层”平摊到每一帧
    private spreadAccumulator = 0;

    // 搜索队列使用扁平数组 [x0, y0, x1, y1, ...]，避免每个细胞创建对象
    private bfsSearchCells: number[] = [];
    private bfsOutputCells: number[] = [];

    constructor(options: FireSimulateOptions) {
        this.cellNumX = Math.max(1, Math.floor(options.cellNumX));
        this.cellNumY = Math.max(1, Math.floor(options.cellNumY));
        this.pRevive = options.pRevive;
        this.pIgnite = options.pIgnite;
        this.fireSpreadSpeed = Math.max(1, options.fireSpreadSpeed);
        this.burnStatusTime = Math.max(1, options.burnStatusTime);
        this.isSkipSpread = options.isSkipSpread;
        const cellNum = this.cellNumX * this.cellNumY;
        this.cellGrid = new Uint8Array(cellNum);
        this.burnAge = new Uint8Array(cellNum);
        this.statistics = options.statistics ?? createFireStatistics();
    }

    private getCellIndex(x: number, y: number) {
        return y * this.cellNumX + x;
    }

    private addBurningCell(index: number) {
        this.cellGrid[index] = 0b00000010;
        this.burnAge[index] = 1;
        this.burningCells.push(index);
        this.isInFire = true;
    }

    /**
     * 将输入队列中细胞的相邻活细胞点燃，并把下一轮待搜索的细胞写入 output。
     */
    private bfsIgniteNext(targetCells: number[], outputCells: number[]) {
        outputCells.length = 0;
        const grid = this.cellGrid;
        const cellNumX = this.cellNumX;
        const cellNumY = this.cellNumY;
        for (let i = 0; i < targetCells.length; i += 2) {
            const cellX = targetCells[i];
            const cellY = targetCells[i + 1];
            for (let d = 0; d < 4; d++) {
                const searchingX = cellX + DIRECTION_X[d];
                const searchingY = cellY + DIRECTION_Y[d];
                if (searchingX < 0 || searchingX >= cellNumX || searchingY < 0 || searchingY >= cellNumY) {
                    continue;
                }
                const searchingIndex = searchingY * cellNumX + searchingX;
                if ((grid[searchingIndex] & 0b00000001) === 1) {
                    outputCells.push(searchingX, searchingY);
                    this.addBurningCell(searchingIndex);
                }
            }
        }
    }

    /**
     * 从当前队列开始推进若干层火灾，并统计本轮新点燃的细胞数。
     */
    private spread(layers: number) {
        for (let i = 0; i < layers; i++) {
            this.statisticsTemp += this.bfsSearchCells.length >> 1;
            this.bfsIgniteNext(this.bfsSearchCells, this.bfsOutputCells);
            const temp = this.bfsSearchCells;
            this.bfsSearchCells = this.bfsOutputCells;
            this.bfsOutputCells = temp;
            if (this.bfsSearchCells.length === 0) {
                break;
            }
        }
    }

    /**
     * 瞬间蔓延：一直推进到没有新的细胞被点燃。
     * 返回本次火灾的燃烧细胞总数（含火种）。
     */
    private spreadAll() {
        let burned = 0;
        while (this.bfsSearchCells.length > 0) {
            burned += this.bfsSearchCells.length >> 1;
            this.bfsIgniteNext(this.bfsSearchCells, this.bfsOutputCells);
            const temp = this.bfsSearchCells;
            this.bfsSearchCells = this.bfsOutputCells;
            this.bfsOutputCells = temp;
        }
        return burned;
    }

    /**
     * 每个燃烧细胞独立推进年龄。年龄跨过阶段阈值时只更新该细胞的颜色，
     * 因此不同时间点燃的细胞会错峰熄灭，视觉上连续得多。
     */
    private advanceBurn() {
        const burning = this.burningCells;
        if (burning.length === 0) {
            if (this.isSkipSpread) {
                this.isInFire = false;
            }
            return;
        }
        const ages = this.burnAge;
        const grid = this.cellGrid;
        const stageLength = this.burnStatusTime;
        const totalDuration = stageLength * 3;
        let writeIndex = 0;
        for (let i = 0; i < burning.length; i++) {
            const cellIndex = burning[i];
            const age = ages[cellIndex] + 1;
            if (age > totalDuration) {
                ages[cellIndex] = 0;
                grid[cellIndex] = grid[cellIndex] & 0b00000001;
            } else {
                ages[cellIndex] = age;
                const stage = Math.min(2, Math.floor((age - 1) / stageLength));
                grid[cellIndex] = ((stage + 1) << 1) | (grid[cellIndex] & 0b00000001);
                burning[writeIndex++] = cellIndex;
            }
        }
        burning.length = writeIndex;
        if (burning.length === 0 && this.isSkipSpread) {
            this.isInFire = false;
        }
    }

    private recordFire(size: number) {
        if (size <= 0) {
            return;
        }
        const current = this.statistics.data.get(size) ?? 0;
        this.statistics.data.set(size, current + 1);
        this.statistics.version++;
    }

    getCellGrid() {
        return this.cellGrid;
    }

    getCellNumX() {
        return this.cellNumX;
    }

    getCellNumY() {
        return this.cellNumY;
    }

    getFireStatistics() {
        return this.statistics;
    }

    /**
     * 当前正在燃烧的细胞数。用于调试与状态展示。
     */
    getBurningCount() {
        return this.burningCells.length;
    }

    setPRevive(value: number) {
        this.pRevive = Math.max(0, value);
    }

    setPIgnite(value: number) {
        this.pIgnite = Math.max(0, value);
    }

    setFireSpreadSpeed(value: number) {
        this.fireSpreadSpeed = Math.max(1, Math.floor(value));
    }

    setBurnStatusTime(value: number) {
        this.burnStatusTime = Math.max(1, Math.floor(value));
    }

    setSkipSpread(value: boolean) {
        this.isSkipSpread = value;
    }

    clearStatistics() {
        this.statistics.data.clear();
        this.statistics.version++;
    }

    /**
     * 鼠标点火：把圆形区域内的存活细胞设为燃烧状态，返回点燃数量。
     */
    igniteAt(cellX: number, cellY: number, radius = 2) {
        const minX = Math.max(0, Math.floor(cellX - radius));
        const maxX = Math.min(this.cellNumX - 1, Math.ceil(cellX + radius));
        const minY = Math.max(0, Math.floor(cellY - radius));
        const maxY = Math.min(this.cellNumY - 1, Math.ceil(cellY + radius));
        const radiusSquared = radius * radius;
        let ignited = 0;
        for (let y = minY; y <= maxY; y++) {
            const dy = y - cellY;
            for (let x = minX; x <= maxX; x++) {
                const dx = x - cellX;
                if (dx * dx + dy * dy > radiusSquared) {
                    continue;
                }
                const index = this.getCellIndex(x, y);
                if ((this.cellGrid[index] & 0b00000001) === 1) {
                    this.addBurningCell(index);
                    this.bfsSearchCells.push(x, y);
                    ignited++;
                }
            }
        }
        return ignited;
    }

    tick() {
        // 每个细胞独立推进燃烧，错峰变色与熄灭
        this.advanceBurn();

        if (!this.isSkipSpread) {
            // 渐进蔓延：把原本“每 burnStatusTime 帧一次性推进 fireSpreadSpeed 层”
            // 平摊成每帧的小步长，视觉上火焰前沿是连续移动的。
            if (this.isInFire) {
                this.spreadAccumulator += this.fireSpreadSpeed / this.burnStatusTime;
                const layers = Math.floor(this.spreadAccumulator);
                if (layers > 0) {
                    this.spreadAccumulator -= layers;
                    if (this.bfsSearchCells.length > 0) {
                        this.spread(layers);
                    }
                }
                if (this.bfsSearchCells.length === 0) {
                    this.spreadAccumulator = 0;
                }
                if (this.burningCells.length > 0 || this.bfsSearchCells.length > 0) {
                    return;
                }

                // 所有火焰与待蔓延细胞都已结束，记录一次渐进式火灾
                this.isInFire = false;
                this.spreadAccumulator = 0;
                this.recordFire(this.statisticsTemp);
                this.statisticsTemp = 0;
            } else {
                this.spreadAccumulator = 0;
            }
        }

        // 随机生长 + 随机点火合并为一次遍历，降低每帧开销
        const grid = this.cellGrid;
        const pRevive = this.pRevive;
        const pIgnite = this.pIgnite;
        for (let index = 0; index < grid.length; index++) {
            const state = grid[index];
            if ((state & 0b00000001) === 0) {
                if (pRevive > 0 && Math.random() < pRevive) {
                    grid[index] = state | 0b00000001;
                    // 刚长出的细胞也有可能立刻被闪电点燃
                    if (pIgnite > 0 && Math.random() < pIgnite) {
                        const x = index % this.cellNumX;
                        const y = (index - x) / this.cellNumX;
                        this.addBurningCell(index);
                        this.bfsSearchCells.push(x, y);
                    }
                }
            } else if (pIgnite > 0 && Math.random() < pIgnite) {
                const x = index % this.cellNumX;
                const y = (index - x) / this.cellNumX;
                this.addBurningCell(index);
                this.bfsSearchCells.push(x, y);
            }
        }

        if (this.isSkipSpread) {
            const burned = this.spreadAll();
            this.recordFire(burned);
            if (burned === 0 && this.burningCells.length === 0) {
                this.isInFire = false;
            }
        }
    }
}
