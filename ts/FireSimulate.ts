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
    /** 是否使用循环边界：网格四边环绕相连（环面） */
    isLoopGrid?: boolean;
    statistics?: FireStatistics;
}

const DIRECTION_X = [-1, -1, -1, 0, 0, 1, 1, 1];
const DIRECTION_Y = [-1, 0, 1, -1, 1, -1, 0, 1];

export function createFireStatistics(): FireStatistics {
    return {
        version: 0,
        data: new Map()
    };
}

enum SimulateStatus {
    REVIVE_AND_IGNITE,
    INSTANT_FIRE,
    FIRE
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

    // 是否使用循环边界：网格四边环绕相连（环面）
    private isLoopGrid: boolean;

    // 每个燃烧细胞独立计时：1..3*burnStatusTime 表示燃烧年龄，0 表示未燃烧。
    // 不同时间被点燃的细胞会错开变色和熄灭，而不是整片一起跳变。
    private burnAge: Uint8Array;
    private burningCellsIdx: number[] = [];

    // 搜索队列使用扁平数组 [x0, y0, x1, y1, ...]，避免每个细胞创建对象
    private toBeAdvanceCells: number[] = [];
    private nextIgniteCells: number[] = [];
    // bfs使用的已访问标记，0为未访问，1为已访问
    private isVisited: Uint8Array;

    // 批量点火使用的待点火细胞数组，同样为扁平数组 [x0, y0, x1, y1, ...]
    private beIgnitedCells: number[] = [];

    // 进行外部点火的标记
    private isOutsideIgnited: boolean = false;

    // 状态机状态
    private status: SimulateStatus;

    // 状态机行为定义
    private actions: Record<SimulateStatus, () => SimulateStatus> = {
        [SimulateStatus.REVIVE_AND_IGNITE]: () => this.actionInReviveAndIgnite(),
        [SimulateStatus.FIRE]: () => this.actionInFire(),
        [SimulateStatus.INSTANT_FIRE]: () => this.actionInInstantFire()
    };

    constructor(options: FireSimulateOptions) {
        this.cellNumX = Math.max(1, Math.floor(options.cellNumX));
        this.cellNumY = Math.max(1, Math.floor(options.cellNumY));
        this.pRevive = options.pRevive;
        this.pIgnite = options.pIgnite;
        this.fireSpreadSpeed = Math.max(1, options.fireSpreadSpeed);
        this.burnStatusTime = Math.max(1, options.burnStatusTime);
        this.isSkipSpread = options.isSkipSpread;
        this.isLoopGrid = options.isLoopGrid ?? false;
        const cellNum = this.cellNumX * this.cellNumY;
        this.cellGrid = new Uint8Array(cellNum);
        this.burnAge = new Uint8Array(cellNum);
        this.isVisited = new Uint8Array(cellNum);
        this.statistics = options.statistics ?? createFireStatistics();
        this.status = SimulateStatus.REVIVE_AND_IGNITE;
    }

    private actionInReviveAndIgnite(): SimulateStatus {
        const isIgnited = this.reviveAndIgnite();
        //当点火成功或外部点火时
        if (isIgnited || this.isOutsideIgnited) {
            this.isOutsideIgnited = false;
            //清空统计缓存
            this.statisticsTemp = 0;
            //且跳过蔓延时
            if (this.isSkipSpread) {
                //跳转值为瞬间火灾
                return SimulateStatus.INSTANT_FIRE;
            }
            //否则跳转值为常规火灾
            return SimulateStatus.FIRE;
        }
        //未点火成功时保持当前状态
        return SimulateStatus.REVIVE_AND_IGNITE;
    }

    private actionInFire(): SimulateStatus {
        const beIgnitedCells = this.beIgnitedCells;

        //推进燃烧，每周期推进fireSpreadSpeed层
        for (let i = 0; i < this.fireSpreadSpeed; i += 1) {
            //将待扩散细胞点燃
            // this.beIgnitedCells.push(...this.toBeAdvanceCells);
            const l = this.toBeAdvanceCells.length;
            for (let j = 0; j < l; j += 1) {
                beIgnitedCells.push(this.toBeAdvanceCells[j]);
            }
            //搜索下一层
            this.bfsNext(this.toBeAdvanceCells, this.nextIgniteCells);
            //交换数组
            const temp = this.toBeAdvanceCells;
            this.toBeAdvanceCells = this.nextIgniteCells;
            this.nextIgniteCells = temp;
        }

        //让被点燃的细胞实际燃烧（死亡、燃烧等级设1），记录点燃细胞数量
        this.statisticsTemp += this.burnCells(beIgnitedCells);

        //推进燃烧年龄
        if (this.advanceBurn()) {
            //推进成功说明还有火
            return SimulateStatus.FIRE;
        } else {
            //否则转回生长状态，并添加火灾记录
            //并清除搜索标记
            this.isVisited.fill(0);
            this.recordFire(this.statisticsTemp);
            return SimulateStatus.REVIVE_AND_IGNITE;
        }
    }

    private actionInInstantFire(): SimulateStatus {
        const beIgnitedCells = this.beIgnitedCells;
        //搜索所有相连细胞
        let advanceFlag = false;
        while (this.toBeAdvanceCells.length > 0) {
            //将待扩散细胞点燃
            // this.beIgnitedCells.push(...this.toBeAdvanceCells);
            const l = this.toBeAdvanceCells.length;
            for (let j = 0; j < l; j += 1) {
                beIgnitedCells.push(this.toBeAdvanceCells[j]);
            }
            //搜索下一层
            this.bfsNext(this.toBeAdvanceCells, this.nextIgniteCells);
            //交换数组
            const temp = this.toBeAdvanceCells;
            this.toBeAdvanceCells = this.nextIgniteCells;
            this.nextIgniteCells = temp;
            //写标记
            advanceFlag = true;
        }
        //燃烧被点燃的细胞，加入记录，清理搜索标记
        //未进行扩散就跳过
        if (advanceFlag) {
            this.recordFire(this.burnCells(beIgnitedCells));
            this.isVisited.fill(0);
        }

        //执行生长和点火
        this.reviveAndIgnite();
        //推进燃烧年龄
        if (this.advanceBurn()) {
            //可推进则保持状态
            return SimulateStatus.INSTANT_FIRE;
        } else {
            //无可推进细胞则进入生长状态
            return SimulateStatus.REVIVE_AND_IGNITE;
        }
    }

    /**
     * 当前正在燃烧的细胞数。用于调试与状态展示。
     */
    getBurningCount() {
        return this.burningCellsIdx.length;
    }

    getCellNumX(): number {
        return this.cellNumX;
    }

    getCellNumY(): number {
        return this.cellNumY;
    }

    getCellGrid(): Uint8Array {
        return this.cellGrid;
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

    setLoopGrid(value: boolean) {
        this.isLoopGrid = value;
    }

    /**
     * 批量燃烧细胞，输入为扁平数组。输入数组会被清空。
     * 输出点燃的细胞数量。
     */
    private burnCells(cells: number[]): number {
        for (let offset = 0; offset < cells.length; offset += 2) {
            const x = cells[offset];
            const y = cells[offset + 1];
            const idx = y * this.cellNumX + x;
            this.cellGrid[idx] = 0b10;
            this.burnAge[idx] = 1;
            this.burningCellsIdx.push(idx);
        }
        const burnNumber = cells.length / 2;
        //清空输入数组
        cells.length = 0;
        return burnNumber;
    }

    /**
     * 推进燃烧年龄
     * 成功推进返回true，没有可推进则返回false
     */
    private advanceBurn(): boolean {
        const burningCellsIdx = this.burningCellsIdx;
        if (burningCellsIdx.length === 0) {
            return false;
        }
        const ages = this.burnAge;
        const grid = this.cellGrid;
        const stageLength = this.burnStatusTime;//每阶段燃烧的时长（周期）
        const totalDuration = stageLength * 3;//总时长，一共3燃烧阶段
        let writeIndex = 0;
        for (const cellIdx of burningCellsIdx) {
            const age = ages[cellIdx] + 1;
            if (age > totalDuration) {
                ages[cellIdx] = 0;
                grid[cellIdx] &= 0b1;
            } else {
                ages[cellIdx] = age;
                const stage = Math.min(2, Math.floor((age - 1) / stageLength));
                grid[cellIdx] = ((stage + 1) << 1) | (grid[cellIdx] & 0b00000001);
                burningCellsIdx[writeIndex] = cellIdx;
                writeIndex += 1;
            }
        }
        burningCellsIdx.length = writeIndex;
        return true;
    }

    /**
     * 执行一次生长和点火
     * 返回是否点火
     */
    private reviveAndIgnite(): boolean {
        const grid = this.cellGrid;
        const pRevive = this.pRevive;
        const pIgnite = this.pIgnite;
        let igniteFlag = false;
        for (let y = 0; y < this.cellNumY; y += 1) {
            const idxOffset = y * this.cellNumX;
            for (let x = 0; x < this.cellNumX; x += 1) {
                const idx = idxOffset + x;
                if (pRevive > 0 && (grid[idx] & 0b1) === 0 && Math.random() < pRevive) {
                    //把低1位设置为1
                    grid[idx] |= 0b1;
                }
                // 已由鼠标点火的细胞已在搜索队列中，避免同一周期重复入队
                if (pIgnite > 0 && (grid[idx] & 0b1) === 1 && this.isVisited[idx] === 0 && Math.random() < pIgnite) {
                    //点火的细胞加入待搜索列表和添加已访问标记
                    this.isVisited[idx] = 1;
                    this.toBeAdvanceCells.push(x, y);
                    // this.beIgnitedCells.push(x, y);
                    igniteFlag = true;
                }
            }
        }
        return igniteFlag;
    }

    /**
     * 将目标相邻的活细胞写入 output。
     */
    private bfsNext(targetCells: number[], outputCells: number[]) {
        outputCells.length = 0;
        const grid = this.cellGrid;
        const isVisited = this.isVisited;
        const cellNumX = this.cellNumX;
        const cellNumY = this.cellNumY;
        for (let i = 0; i < targetCells.length; i += 2) {
            const cellX = targetCells[i];
            const cellY = targetCells[i + 1];
            for (let d = 0; d < 8; d++) {
                const rawX = cellX + DIRECTION_X[d];
                const rawY = cellY + DIRECTION_Y[d];
                let searchingX = rawX;
                let searchingY = rawY;
                if (this.isLoopGrid) {
                    // 四边环绕：-1 映射到最后一列/行，越界方向映射到另一侧
                    searchingX = rawX < 0 ? cellNumX - 1 : (rawX >= cellNumX ? 0 : rawX);
                    searchingY = rawY < 0 ? cellNumY - 1 : (rawY >= cellNumY ? 0 : rawY);
                } else if (rawX < 0 || rawX >= cellNumX || rawY < 0 || rawY >= cellNumY) {
                    continue;
                }
                const searchingIndex = searchingY * cellNumX + searchingX;
                if (isVisited[searchingIndex] === 0 && (grid[searchingIndex] & 0b00000001) === 1) {
                    isVisited[searchingIndex] = 1;
                    outputCells.push(searchingX, searchingY);
                    // this.addBurningCell(searchingIndex);
                }
            }
        }
    }

    /**
     * 鼠标点火：把圆形区域内的存活细胞设为燃烧状态，返回点燃数量。
     */
    igniteAt(cellX: number, cellY: number, radius = 2) {
        const cellNumX = this.cellNumX;
        const cellNumY = this.cellNumY;
        // 非循环边界时裁剪到网格内；循环边界时允许坐标越界，稍后按网格取模
        const minX = this.isLoopGrid ? Math.floor(cellX - radius) : Math.max(0, Math.floor(cellX - radius));
        const maxX = this.isLoopGrid ? Math.ceil(cellX + radius) : Math.min(cellNumX - 1, Math.ceil(cellX + radius));
        const minY = this.isLoopGrid ? Math.floor(cellY - radius) : Math.max(0, Math.floor(cellY - radius));
        const maxY = this.isLoopGrid ? Math.ceil(cellY + radius) : Math.min(cellNumY - 1, Math.ceil(cellY + radius));
        const radiusSquared = radius * radius;
        // 循环边界下同一个细胞可能由多个越界坐标映射得到，需要去重
        const wrappedIndexes = this.isLoopGrid ? new Set<number>() : null;
        let ignited = 0;
        for (let y = minY; y <= maxY; y++) {
            const dy = y - cellY;
            for (let x = minX; x <= maxX; x++) {
                const dx = x - cellX;
                if (dx * dx + dy * dy > radiusSquared) {
                    continue;
                }
                let cellIndexX = x;
                let cellIndexY = y;
                if (this.isLoopGrid) {
                    cellIndexX = ((x % cellNumX) + cellNumX) % cellNumX;
                    cellIndexY = ((y % cellNumY) + cellNumY) % cellNumY;
                }
                const index = cellIndexY * cellNumX + cellIndexX;
                if (wrappedIndexes !== null) {
                    if (wrappedIndexes.has(index)) {
                        continue;
                    }
                    wrappedIndexes.add(index);
                }
                // 已经在当前火灾搜索队列里的细胞不要重复入队，否则会重复燃烧并污染统计
                if (this.isVisited[index] !== 0 || (this.cellGrid[index] & 0b00000001) === 0) {
                    continue;
                }
                // 直接往待扩散列表写，两个火灾状态都能处理外部点火
                this.toBeAdvanceCells.push(cellIndexX, cellIndexY);
                this.isVisited[index] = 1;
                this.isOutsideIgnited = true;
                ignited++;
            }
        }
        return ignited;
    }

    private recordFire(size: number) {
        if (size <= 0) {
            return;
        }
        const current = this.statistics.data.get(size) ?? 0;
        this.statistics.data.set(size, current + 1);
        this.statistics.version++;
    }

    tick() {
        this.status = this.actions[this.status]();
    }
}