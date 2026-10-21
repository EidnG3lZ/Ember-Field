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
    private burnTimer = 0;

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
        this.cellGrid = new Uint8Array(this.cellNumX * this.cellNumY);
        this.statistics = options.statistics ?? createFireStatistics();
    }

    private getCellIndex(x: number, y: number) {
        return y * this.cellNumX + x;
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
                    grid[searchingIndex] = 0b00000010;
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

    private recordFire(size: number) {
        if (size <= 0) {
            return;
        }
        const current = this.statistics.data.get(size) ?? 0;
        this.statistics.data.set(size, current + 1);
        this.statistics.version++;
    }

    /**
     * 把排队中的火种标记为燃烧状态。
     */
    private markIgnition(x: number, y: number) {
        const index = this.getCellIndex(x, y);
        this.cellGrid[index] = 0b00000010;
        this.bfsSearchCells.push(x, y);
        this.isInFire = true;
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
                    this.markIgnition(x, y);
                    ignited++;
                }
            }
        }
        return ignited;
    }

    tick() {
        if (this.isInFire) {
            if (this.burnTimer === 0) {
                // 推进所有燃烧阶段的细胞
                let counter = 0;
                const grid = this.cellGrid;
                for (let i = 0; i < grid.length; i++) {
                    const state = grid[i];
                    if ((state >> 1) >= 1) {
                        counter++;
                        const next = state + 0b10;
                        grid[i] = (next >> 1) > 3 ? (next & 0b00000001) : next;
                    }
                }

                if (counter === 0) {
                    // 火焰熄灭，记录一次渐进式火灾
                    this.isInFire = false;
                    this.burnTimer = 0;
                    this.recordFire(this.statisticsTemp);
                    this.statisticsTemp = 0;
                } else {
                    this.burnTimer++;
                    if (this.burnTimer >= this.burnStatusTime) {
                        this.burnTimer = 0;
                    }
                    if (!this.isSkipSpread) {
                        this.spread(this.fireSpreadSpeed);
                        return;
                    }
                }
            } else {
                this.burnTimer++;
                if (this.burnTimer >= this.burnStatusTime) {
                    this.burnTimer = 0;
                }
                if (!this.isSkipSpread) {
                    this.spread(this.fireSpreadSpeed);
                    return;
                }
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
                        this.markIgnition(x, y);
                    }
                }
            } else if (pIgnite > 0 && Math.random() < pIgnite) {
                const x = index % this.cellNumX;
                const y = (index - x) / this.cellNumX;
                this.markIgnition(x, y);
            }
        }

        if (this.isSkipSpread) {
            const burned = this.spreadAll();
            this.recordFire(burned);
        }
    }
}
