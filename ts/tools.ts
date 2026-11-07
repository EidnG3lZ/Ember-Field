export interface RGBA {
    r: number;
    g: number;
    b: number;
    a: number;
}

/**
 * 将css颜色字符串解析为rgba通道数值，a通道范围为0-255
 * 需要传入RGBA输出对象，将其修改为解析结果。
 * @returns 解析成功返回true，否则false
 */
export const getRGBAFromStr = (() => {
    const colorCache = new Map<string, RGBA | null>();//颜色缓存
    const MAX_CACHE = 1024;//缓存上限
    // let lastColorStr: string | undefined;
    // let lastColorRGBA: RGBA | null;
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const tempCtx = canvas.getContext("2d", { willReadFrequently: true });
    if (tempCtx === null) {
        throw new Error("getRGBAFromStr:Canvas creation failed or context acquisition failed");
    }
    const ctx = tempCtx;

    /**
     * 添加缓存
     */
    function addCache(key: string, value: RGBA | null) {
        if (colorCache.size >= MAX_CACHE) {
            const oldest = colorCache.keys().next();
            if (!oldest.done) {
                colorCache.delete(oldest.value)
            };
        }
        colorCache.set(key, value);
        // lastColorStr = key;
        // lastColorRGBA = value;
    }

    function copyRGBA(from: RGBA, to: RGBA) {
        to.r = from.r;
        to.g = from.g;
        to.b = from.b;
        to.a = from.a;
    }

    /**
     * canvas解析方法
     * 返回false表示解析失败
     */
    function canvasMethod(cssColor: string, out: RGBA): boolean {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "#aabbccdd";
        ctx.fillStyle = cssColor;
        const computedColor = ctx.fillStyle;
        ctx.fillStyle = "#11223344";
        ctx.fillStyle = cssColor;
        if (computedColor !== ctx.fillStyle) {
            return false;
        }
        ctx.fillRect(0, 0, 1, 1);
        const pixelData = ctx!.getImageData(0, 0, 1, 1).data;
        out.r = pixelData[0];
        out.g = pixelData[1];
        out.b = pixelData[2];
        out.a = pixelData[3];
        return true;
    }

    //转换器入口
    return function parseColor(cssColor: string, out: RGBA, defaultRGBA: RGBA | undefined = undefined): boolean {
        //连续相同调用优化
        // if (cssColor === lastColorStr) {
        //     if (lastColorRGBA === null) {
        //         return false;
        //     }
        //     copyRGBA(lastColorRGBA, out);
        //     return true;
        // }
        //缓存命中
        const cacheOfHit = colorCache.get(cssColor);
        if (cacheOfHit !== undefined) {
            // lastColorStr = cssColor;
            // lastColorRGBA = cacheOfHit;

            if (cacheOfHit === null) {
                if (defaultRGBA !== undefined) {
                    copyRGBA(defaultRGBA, out);
                }
                return false;
            }
            copyRGBA(cacheOfHit, out);
            return true;
        }
        //canvas解析路径
        let canvasResult = { r: 0, g: 0, b: 0, a: 0 }; 
        if (canvasMethod(cssColor, canvasResult)) {
            copyRGBA(canvasResult, out);
            addCache(cssColor, canvasResult);
            return true;
        }
        if (defaultRGBA !== undefined) {
            copyRGBA(defaultRGBA, out);
        }
        addCache(cssColor, null);
        return false;
    }
})();

/* ------------------------------------------------------------------ *
 * 柏林噪声（Perlin Noise）
 *
 * 用途：为活细胞准备一张空间连贯的"地形"——同一片区域里的细胞落在同一个
 * 颜色档位，整体呈现大块斑驳的色块，而不是哈希取色那种逐格跳变的噪点。
 * 噪声核心是纯函数，只依赖坐标和置换表，所以可以放心地在启动时整表算一次。
 * ------------------------------------------------------------------ */

/** mulberry32：32 位整数 PRNG，快、分布好、同 seed 完全确定 */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return function next(): number {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** 五次平滑插值曲线 6t^5 - 15t^4 + 10t^3，保证一阶、二阶导连续 */
function fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
}

/**
 * 8 个方向的单位梯度向量（轴向 + 对角）。
 * 相比 4 方向梯度能明显减少沿网格线出现的伪影。
 */
const GRAD_X = new Float64Array([
    1, -1, 0, 0, Math.SQRT1_2, -Math.SQRT1_2, Math.SQRT1_2, -Math.SQRT1_2
]);
const GRAD_Y = new Float64Array([
    0, 0, 1, -1, Math.SQRT1_2, Math.SQRT1_2, -Math.SQRT1_2, -Math.SQRT1_2
]);

/**
 * 由 seed 生成 512 长度的置换表：前 256 项是 0..255 的乱序，后 256 项重复一份。
 * 后 256 项的重复让索引计算不必再做取模。
 */
export function createPermutation(seed: number): Uint8Array {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
        p[i] = i;
    }

    const rand = mulberry32(seed);
    // Fisher-Yates 洗牌
    for (let i = 255; i > 0; i--) {
        const j = (rand() * (i + 1)) | 0;
        const tmp = p[i];
        p[i] = p[j];
        p[j] = tmp;
    }

    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
        perm[i] = p[i & 255];
    }
    return perm;
}

/**
 * 单层二维柏林噪声。
 * @returns 约 [-1, 1] 之间的值（理论上界为 ±√2/2 ≈ ±0.7071）
 */
export function perlin2(x: number, y: number, perm: Uint8Array): number {
    const X = Math.floor(x);
    const Y = Math.floor(y);
    const xf = x - X;
    const yf = y - Y;

    const xi = X & 255;
    const yi = Y & 255;

    const u = fade(xf);
    const v = fade(yf);

    const aa = perm[perm[xi] + yi];
    const ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi];
    const bb = perm[perm[xi + 1] + yi + 1];

    // 四个角上的梯度与相对向量做点积
    const g0 = aa & 7;
    const n00 = GRAD_X[g0] * xf + GRAD_Y[g0] * yf;
    const g1 = ba & 7;
    const n10 = GRAD_X[g1] * (xf - 1) + GRAD_Y[g1] * yf;
    const g2 = ab & 7;
    const n01 = GRAD_X[g2] * xf + GRAD_Y[g2] * (yf - 1);
    const g3 = bb & 7;
    const n11 = GRAD_X[g3] * (xf - 1) + GRAD_Y[g3] * (yf - 1);

    const nx0 = lerp(n00, n10, u);
    const nx1 = lerp(n01, n11, u);
    return lerp(nx0, nx1, v);
}

/** 把 ±√2/2 的噪声值归一化到 [0, 1] 的系数 */
const NOISE_TO_UNIT = Math.SQRT2;

/**
 * 分形叠加（fBm）：多倍频叠加，得到更像地形的高低起伏。
 * @returns [0, 1]
 */
export function fbm2(
    x: number,
    y: number,
    perm: Uint8Array,
    octaves: number,
    lacunarity: number,
    gain: number
): number {
    let amplitude = 1;
    let frequency = 1;
    let sum = 0;
    let norm = 0;

    for (let o = 0; o < octaves; o++) {
        sum += perlin2(x * frequency, y * frequency, perm) * amplitude;
        norm += amplitude;
        amplitude *= gain;
        frequency *= lacunarity;
    }

    const n = sum / norm; // [-0.7071, 0.7071]
    const unit = n * NOISE_TO_UNIT * 0.5 + 0.5;
    return unit < 0 ? 0 : unit > 1 ? 1 : unit;
}

export interface ColorIndexMapOptions {
    /** 网格宽度，即坐标 x 的范围 [0, width) */
    width: number;
    /** 网格高度，即坐标 y 的范围 [0, height) */
    height: number;
    /** 调色板档数，返回值的取值域为 [0, colorCount - 1] */
    colorCount: number;
    /** 随机种子，默认 1337；同 seed 结果完全可复现 */
    seed?: number;
    /** 噪声缩放：每格对应多少噪声单位。越小色块越大，默认 0.025 */
    scale?: number;
    /** 叠加层数，默认 4；1 表示单层纯柏林噪声 */
    octaves?: number;
    /** 每层频率倍数，默认 2 */
    lacunarity?: number;
    /** 每层振幅衰减，默认 0.5 */
    gain?: number;
    /** 采样原点偏移，用于在同一 seed 下截取不同区域 */
    offsetX?: number;
    offsetY?: number;
}

/**
 * 生成一张与网格一一对应的颜色索引表（扁平存储，index = y * width + x）。
 *
 * 流程：
 *  1. 逐格算 fBm，得到 [0,1] 的连续值，暂存到 Float32Array 并统计 min/max；
 *  2. 直方图均衡把连续值映射到 [0,1]：噪声本身是钟形分布，直接线性拉伸会让
 *     中间档位吃掉绝大多数格子，色块层次出不来；
 *  3. 乘以 colorCount 取整并夹取到 [0, colorCount - 1]。
 */
export function generateColorIndexMap(options: ColorIndexMapOptions): Uint8Array {
    const {
        width,
        height,
        colorCount,
        seed = 1337,
        scale = 0.025,
        octaves = 4,
        lacunarity = 2,
        gain = 0.5,
        offsetX = 0,
        offsetY = 0
    } = options;

    if (!Number.isInteger(width) || width <= 0) {
        throw new RangeError(`width 必须是正整数，收到 ${width}`);
    }
    if (!Number.isInteger(height) || height <= 0) {
        throw new RangeError(`height 必须是正整数，收到 ${height}`);
    }
    if (!Number.isInteger(colorCount) || colorCount <= 0) {
        throw new RangeError(`colorCount 必须是正整数，收到 ${colorCount}`);
    }

    const total = width * height;
    const map = new Uint8Array(total);
    // 只有一档颜色时不需要跑噪声，整张表都是 0
    if (colorCount === 1) {
        return map;
    }

    // ---- 1. 采样 ----
    const perm = createPermutation(seed);
    const raw = new Float32Array(total);
    let min = Infinity;
    let max = -Infinity;

    for (let y = 0; y < height; y++) {
        const ny = (y + offsetY) * scale;
        const rowBase = y * width;
        for (let x = 0; x < width; x++) {
            const v = fbm2((x + offsetX) * scale, ny, perm, octaves, lacunarity, gain);
            raw[rowBase + x] = v;
            if (v < min) min = v;
            if (v > max) max = v;
        }
    }

    const range = max - min;
    // 退化情形：整张图完全平坦，全部落在最低档
    if (!(range > 0)) {
        return map;
    }

    // ---- 2. 直方图均衡：让每档颜色覆盖的格数接近 total / colorCount ----
    const bins = Math.min(1024, Math.max(64, colorCount * 64));
    const hist = new Uint32Array(bins);
    const binScale = bins / range;

    for (let i = 0; i < total; i++) {
        let b = ((raw[i] - min) * binScale) | 0;
        if (b >= bins) {
            b = bins - 1;
        } else if (b < 0) {
            b = 0;
        }
        hist[b]++;
    }

    // cumBefore[b] = 落在第 b 个桶之前的格数
    const cumBefore = new Float64Array(bins);
    let acc = 0;
    for (let b = 0; b < bins; b++) {
        cumBefore[b] = acc;
        acc += hist[b];
    }

    // ---- 3. 量化 ----
    const maxLevel = colorCount - 1;
    for (let i = 0; i < total; i++) {
        const pos = (raw[i] - min) * binScale;
        let b = pos | 0;
        if (b >= bins) {
            b = bins - 1;
        } else if (b < 0) {
            b = 0;
        }
        // 桶内线性插值，避免 CDF 台阶化产生的条带
        let frac = pos - b;
        if (frac < 0) {
            frac = 0;
        } else if (frac > 1) {
            frac = 1;
        }
        const t = (cumBefore[b] + hist[b] * frac) / total;

        let level = (t * colorCount) | 0;
        if (level > maxLevel) {
            level = maxLevel;
        } else if (level < 0) {
            level = 0;
        }
        map[i] = level;
    }

    return map;
}
