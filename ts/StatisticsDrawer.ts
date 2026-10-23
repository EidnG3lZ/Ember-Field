import { FireStatistics } from "./FireSimulate";
import { ChartPalette } from "./theme";

export interface PowerLawFit {
    totalFires: number;
    maxSize: number;
    maxFrequency: number;
    distinctSizes: number;
    /** 幂律指数 alpha：P(s) ~ s^-alpha */
    alpha: number | null;
    /** 对数密度上的无加权拟合优度 */
    r2: number | null;
    fitFrom: number;
    fitTo: number;
    bins: number;
}

/** 1.5 倍几何分箱的一个箱子。sizeSum 用于计算箱内按次数加权的平均规模。 */
export interface LogBin {
    lo: number;
    hi: number;
    count: number;
    sizeSum: number;
}

export interface FitPoint {
    x: number;
    y: number;
    density: number;
}

export interface PowerLawResult {
    alpha: number | null;
    r2: number | null;
    slope: number | null;
    intercept: number | null;
    fitFrom: number;
    fitTo: number;
    bins: number;
    points: FitPoint[];
}

const SUPERSCRIPT_DIGITS = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];
const SUPERSCRIPT_MINUS = "⁻";

function pow10Label(exponent: number) {
    const sign = exponent < 0 ? SUPERSCRIPT_MINUS : "";
    return "10" + sign + String(Math.abs(exponent))
        .split("")
        .map((digit) => SUPERSCRIPT_DIGITS[Number(digit)] ?? digit)
        .join("");
}

function isValidEntry(size: number, frequency: number) {
    return Number.isFinite(size) && size > 0 && Number.isFinite(frequency) && frequency > 0;
}

/**
 * 1.5 倍几何分箱：边界从 1 开始逐次乘 1.5 并取整。
 * 与 Veritasium simulation5 的做法一致：边界取整、跳过零宽箱。
 */
export function buildLogBins(entries: ReadonlyArray<[number, number]>): LogBin[] {
    let maxSize = 0;
    for (const [size, frequency] of entries) {
        if (isValidEntry(size, frequency)) {
            maxSize = Math.max(maxSize, size);
        }
    }
    if (maxSize <= 0) {
        return [];
    }

    const edges: number[] = [1];
    let edge = 1;
    let guard = 0;
    while (edge <= maxSize && guard++ < 256) {
        edge *= 1.5;
        const rounded = Math.round(edge);
        if (rounded > edges[edges.length - 1]) {
            edges.push(rounded);
        }
    }
    // 保证最后一个边界严格大于最大火灾规模，避免最大值被硬塞进最后一个箱子。
    while (edges[edges.length - 1] <= maxSize && guard++ < 512) {
        edge *= 1.5;
        const rounded = Math.round(edge);
        if (rounded > edges[edges.length - 1]) {
            edges.push(rounded);
        }
    }
    if (edges[edges.length - 1] <= maxSize) {
        edges.push(Math.ceil(maxSize) + 1);
    }

    const bins: LogBin[] = [];
    for (let i = 0; i < edges.length - 1; i++) {
        const lo = edges[i];
        const hi = edges[i + 1];
        if (hi > lo) {
            bins.push({ lo, hi, count: 0, sizeSum: 0 });
        }
    }

    const findBin = (size: number) => {
        let low = 0;
        let high = bins.length - 1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (size < bins[mid].lo) {
                high = mid - 1;
            } else if (size >= bins[mid].hi) {
                low = mid + 1;
            } else {
                return mid;
            }
        }
        return -1;
    };

    for (const [size, frequency] of entries) {
        if (!isValidEntry(size, frequency)) {
            continue;
        }
        const index = findBin(size);
        if (index < 0) {
            continue;
        }
        bins[index].count += frequency;
        bins[index].sizeSum += size * frequency;
    }
    return bins;
}

/**
 * 在 1.5 倍分箱后的密度序列上做无加权最小二乘。
 * 对 P(s) ∝ s^-alpha，密度 C_bin / Δs 的双对数斜率就是 -alpha。
 */
export function fitPowerLaw(bins: LogBin[], maxSize: number, fitFrom = 4): PowerLawResult {
    const start = Math.max(4, fitFrom);
    const empty: PowerLawResult = {
        alpha: null,
        r2: null,
        slope: null,
        intercept: null,
        fitFrom: start,
        fitTo: maxSize,
        bins: 0,
        points: []
    };
    if (maxSize <= 0 || maxSize / start < 4) {
        return empty;
    }

    const points: FitPoint[] = [];
    for (const bin of bins) {
        if (bin.count <= 0) {
            continue;
        }
        const width = bin.hi - bin.lo;
        if (width <= 0) {
            continue;
        }
        const mean = bin.sizeSum / bin.count;
        if (!Number.isFinite(mean) || mean < start) {
            continue;
        }
        const density = bin.count / width;
        if (!(density > 0) || !Number.isFinite(density)) {
            continue;
        }
        points.push({
            x: Math.log10(mean),
            y: Math.log10(density),
            density
        });
    }
    empty.points = points;
    empty.bins = points.length;
    if (points.length < 3) {
        return empty;
    }

    let xSum = 0;
    let ySum = 0;
    let xxSum = 0;
    let xySum = 0;
    for (const point of points) {
        xSum += point.x;
        ySum += point.y;
        xxSum += point.x * point.x;
        xySum += point.x * point.y;
    }
    const count = points.length;
    const denominator = count * xxSum - xSum * xSum;
    if (Math.abs(denominator) < 1e-12) {
        return empty;
    }
    const slope = (count * xySum - xSum * ySum) / denominator;
    const intercept = (ySum - slope * xSum) / count;
    const alpha = -slope;

    const yMean = ySum / count;
    let residual = 0;
    let total = 0;
    for (const point of points) {
        const predicted = intercept + slope * point.x;
        residual += Math.pow(point.y - predicted, 2);
        total += Math.pow(point.y - yMean, 2);
    }
    const r2 = total > 1e-12 ? 1 - residual / total : null;

    return {
        alpha: Number.isFinite(alpha) ? alpha : null,
        r2: r2 !== null && Number.isFinite(r2) ? r2 : null,
        slope: Number.isFinite(slope) ? slope : null,
        intercept: Number.isFinite(intercept) ? intercept : null,
        fitFrom: start,
        fitTo: maxSize,
        bins: points.length,
        points
    };
}

/**
 * 统计面板：双对数分箱密度散点 / 密度直方图 + 幂律拟合。
 * 散点和直方图都画 count / 箱宽 的密度，共享同一套 1.5× 分箱和纵轴。
 */
export class StatisticsDrawer {
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private statistics: FireStatistics;
    private palette: ChartPalette;
    private onFit: (fit: PowerLawFit) => void;
    private emptyEl: HTMLElement | null;
    private lastVersion = -1;
    private dirty = true;
    private width = 0;
    private height = 0;
    private dpr = 1;
    private histogramMode = false;
    private resizeObserver: ResizeObserver | null = null;

    constructor(
        canvas: HTMLCanvasElement,
        statistics: FireStatistics,
        palette: ChartPalette,
        onFit: (fit: PowerLawFit) => void,
        emptyEl: HTMLElement | null = null
    ) {
        const context = canvas.getContext("2d");
        if (context == null) {
            throw new Error("statistics canvas context is null");
        }
        this.canvas = canvas;
        this.context = context;
        this.statistics = statistics;
        this.palette = palette;
        this.onFit = onFit;
        this.emptyEl = emptyEl;
        this.resizeObserver = new ResizeObserver(() => this.handleResize());
        this.resizeObserver.observe(canvas);
        this.handleResize();
    }

    setPalette(palette: ChartPalette) {
        this.palette = palette;
        this.dirty = true;
        this.render();
    }

    setDataSource(statistics: FireStatistics) {
        this.statistics = statistics;
        this.lastVersion = -1;
        this.dirty = true;
        this.render();
    }

    setHistogramMode(enabled: boolean) {
        if (this.histogramMode === enabled) {
            return;
        }
        this.histogramMode = enabled;
        this.dirty = true;
        this.render();
    }

    requestRender() {
        this.dirty = true;
        this.render();
    }

    draw() {
        if (this.lastVersion === this.statistics.version && !this.dirty) {
            return;
        }
        this.render();
    }

    private handleResize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        if (width === this.width && height === this.height && dpr === this.dpr) {
            return;
        }
        this.width = width;
        this.height = height;
        this.dpr = dpr;
        this.canvas.width = Math.max(1, Math.round(width * dpr));
        this.canvas.height = Math.max(1, Math.round(height * dpr));
        this.dirty = true;
        this.render();
    }

    private render() {
        this.dirty = false;
        this.lastVersion = this.statistics.version;
        const context = this.context;
        const width = this.width;
        const height = this.height;
        if (width <= 0 || height <= 0) {
            return;
        }
        context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        context.clearRect(0, 0, width, height);

        const entries = Array.from(this.statistics.data.entries());
        const { fit, bins, result } = this.calculateFit(entries);
        this.onFit(fit);
        if (this.emptyEl) {
            this.emptyEl.hidden = fit.totalFires > 0;
        }

        const padding = { left: 52, right: 22, top: 18, bottom: 44 };
        const plotWidth = Math.max(40, width - padding.left - padding.right);
        const plotHeight = Math.max(40, height - padding.top - padding.bottom);

        const maxSize = fit.totalFires > 0 ? fit.maxSize : 1000;
        const lastBinHi = bins.length > 0 ? bins[bins.length - 1].hi : maxSize;
        const xMinExp = -0.05;
        const xMaxExp = Math.max(3, Math.log10(Math.max(10, lastBinHi)) + 0.1);

        // 纵轴是密度，可能小于 1，所以下界需要允许负指数。
        let minDensity = Infinity;
        let maxDensity = 0;
        const considerDensity = (density: number) => {
            if (Number.isFinite(density) && density > 0) {
                minDensity = Math.min(minDensity, density);
                maxDensity = Math.max(maxDensity, density);
            }
        };
        for (const bin of bins) {
            if (bin.count > 0) {
                considerDensity(bin.count / (bin.hi - bin.lo));
            }
        }
        if (result.slope !== null && result.intercept !== null) {
            for (const x of [result.fitFrom, result.fitTo]) {
                if (x > 0) {
                    considerDensity(Math.pow(10, result.intercept + result.slope * Math.log10(x)));
                }
            }
        }
        if (!Number.isFinite(minDensity) || minDensity <= 0) {
            minDensity = 1;
        }
        if (maxDensity <= 0) {
            maxDensity = 1;
        }
        let yMinExp = Math.floor(Math.log10(minDensity));
        let yMaxExp = Math.ceil(Math.log10(maxDensity));
        if (yMaxExp - yMinExp < 2) {
            yMaxExp = yMinExp + 2;
        }
        yMinExp -= 0.05;
        yMaxExp += 0.05;

        const xScale = (logValue: number) =>
            padding.left + ((logValue - xMinExp) / (xMaxExp - xMinExp)) * plotWidth;
        const yScale = (logValue: number) =>
            padding.top + plotHeight - ((logValue - yMinExp) / (yMaxExp - yMinExp)) * plotHeight;

        this.drawGrid(context, padding, plotWidth, plotHeight, xMaxExp, yMinExp, yMaxExp, xScale, yScale);
        this.drawAxes(context, padding, plotWidth, plotHeight);
        this.drawTickLabels(context, padding, plotWidth, plotHeight, xMaxExp, yMinExp, yMaxExp, xScale, yScale);

        if (fit.totalFires === 0) {
            context.save();
            context.fillStyle = this.palette.legend;
            context.font = "10px orbitronmedium, 'Microsoft YaHei', sans-serif";
            context.textAlign = "right";
            context.textBaseline = "top";
            context.fillText("AWAITING EVENTS", padding.left + plotWidth, padding.top + 6);
            context.restore();
            return;
        }

        if (this.histogramMode) {
            this.drawHistogram(context, bins, padding, plotHeight, xScale, yScale);
        } else {
            this.drawPoints(context, bins, padding, plotWidth, plotHeight, xScale, yScale);
        }
        if (result.slope !== null && result.intercept !== null) {
            this.drawFitLine(context, result, padding, plotWidth, plotHeight, xScale, yScale);
        }
        this.drawLegend(context, padding, plotWidth, this.histogramMode, result.slope !== null);
    }

    private drawLegend(
        context: CanvasRenderingContext2D,
        padding: { left: number; right: number; top: number; bottom: number },
        plotWidth: number,
        histogram: boolean,
        hasFit: boolean
    ) {
        const right = padding.left + plotWidth - 10;
        let y = padding.top + 13;
        const seriesLabel = histogram ? "对数分箱密度" : "分箱密度点";
        context.save();
        context.font = "9.5px 'Microsoft YaHei', 'PingFang SC', sans-serif";
        context.textAlign = "right";
        context.textBaseline = "middle";
        context.fillStyle = this.palette.legend;

        context.fillText(seriesLabel, right, y);
        const labelWidth = context.measureText(seriesLabel).width;
        context.fillStyle = this.palette.dot;
        if (histogram) {
            context.globalAlpha = 0.72;
            context.fillRect(right - labelWidth - 17, y - 3.5, 11, 7);
            context.globalAlpha = 1;
        } else {
            context.beginPath();
            context.arc(right - labelWidth - 11, y, 2.6, 0, Math.PI * 2);
            context.fill();
        }

        if (hasFit) {
            y += 16;
            context.fillStyle = this.palette.legend;
            context.fillText("幂律拟合", right, y);
            const lineWidth = context.measureText("幂律拟合").width;
            const startX = right - lineWidth - 20;
            context.strokeStyle = this.palette.line;
            context.lineWidth = 1.4;
            context.beginPath();
            context.moveTo(startX, y);
            context.lineTo(startX + 12, y);
            context.stroke();
        }
        context.restore();
    }

    private drawGrid(
        context: CanvasRenderingContext2D,
        padding: { left: number; right: number; top: number; bottom: number },
        plotWidth: number,
        plotHeight: number,
        xMaxExp: number,
        yMinExp: number,
        yMaxExp: number,
        xScale: (value: number) => number,
        yScale: (value: number) => number
    ) {
        context.save();
        context.lineWidth = 1;

        for (let exponent = 0; exponent <= Math.floor(xMaxExp); exponent++) {
            const x = Math.round(xScale(exponent) * this.dpr) / this.dpr;
            context.strokeStyle = this.palette.grid;
            context.beginPath();
            context.moveTo(x, padding.top);
            context.lineTo(x, padding.top + plotHeight);
            context.stroke();
        }
        for (let exponent = Math.ceil(yMinExp); exponent <= Math.floor(yMaxExp); exponent++) {
            const y = Math.round(yScale(exponent) * this.dpr) / this.dpr;
            context.strokeStyle = this.palette.grid;
            context.beginPath();
            context.moveTo(padding.left, y);
            context.lineTo(padding.left + plotWidth, y);
            context.stroke();
        }

        // 每个数量级内部的 2..9 小刻度，仅画在坐标轴边上
        context.strokeStyle = this.palette.gridMinor;
        for (let exponent = 0; exponent < Math.floor(xMaxExp); exponent++) {
            for (let multiplier = 2; multiplier <= 9; multiplier++) {
                const x = xScale(exponent + Math.log10(multiplier));
                context.beginPath();
                context.moveTo(x, padding.top + plotHeight);
                context.lineTo(x, padding.top + plotHeight + 3);
                context.stroke();
            }
        }
        for (
            let exponent = Math.ceil(yMinExp);
            exponent < Math.floor(yMaxExp);
            exponent++
        ) {
            for (let multiplier = 2; multiplier <= 9; multiplier++) {
                const y = yScale(exponent + Math.log10(multiplier));
                context.beginPath();
                context.moveTo(padding.left, y);
                context.lineTo(padding.left - 3, y);
                context.stroke();
            }
        }
        context.restore();
    }

    private drawAxes(
        context: CanvasRenderingContext2D,
        padding: { left: number; right: number; top: number; bottom: number },
        plotWidth: number,
        plotHeight: number
    ) {
        context.save();
        context.strokeStyle = this.palette.axis;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(padding.left, padding.top);
        context.lineTo(padding.left, padding.top + plotHeight);
        context.lineTo(padding.left + plotWidth, padding.top + plotHeight);
        context.stroke();

        context.fillStyle = this.palette.label;
        context.font = "11px 'Microsoft YaHei', 'PingFang SC', sans-serif";
        context.textAlign = "center";
        context.textBaseline = "bottom";
        context.fillText("火灾规模 s / 燃烧细胞数", padding.left + plotWidth / 2, this.height - 8);

        context.save();
        context.translate(14, padding.top + plotHeight / 2);
        context.rotate(-Math.PI / 2);
        context.textAlign = "center";
        context.textBaseline = "top";
        context.fillText("概率密度 P(s)", 0, 0);
        context.restore();
        context.restore();
    }

    private drawTickLabels(
        context: CanvasRenderingContext2D,
        padding: { left: number; right: number; top: number; bottom: number },
        plotWidth: number,
        plotHeight: number,
        xMaxExp: number,
        yMinExp: number,
        yMaxExp: number,
        xScale: (value: number) => number,
        yScale: (value: number) => number
    ) {
        context.save();
        context.fillStyle = this.palette.tick;
        context.font = "10.5px orbitronmedium, 'Microsoft YaHei', sans-serif";
        context.textAlign = "center";
        context.textBaseline = "top";

        for (let exponent = 0; exponent <= Math.floor(xMaxExp); exponent++) {
            const x = xScale(exponent);
            const label = pow10Label(exponent);
            if (exponent === 0) {
                context.textAlign = "right";
                context.fillText(label, x + 2, padding.top + plotHeight + 9);
                context.textAlign = "center";
            } else {
                context.fillText(label, x, padding.top + plotHeight + 9);
            }
        }

        context.textAlign = "right";
        context.textBaseline = "middle";
        for (let exponent = Math.ceil(yMinExp); exponent <= Math.floor(yMaxExp); exponent++) {
            const y = yScale(exponent);
            context.fillText(pow10Label(exponent), padding.left - 9, y);
        }
        context.restore();
    }

    private drawPoints(
        context: CanvasRenderingContext2D,
        bins: LogBin[],
        padding: { left: number; right: number; top: number; bottom: number },
        plotWidth: number,
        plotHeight: number,
        xScale: (value: number) => number,
        yScale: (value: number) => number
    ) {
        context.save();
        context.fillStyle = this.palette.dot;
        context.shadowColor = this.palette.dotGlow;
        context.shadowBlur = bins.length > 700 ? 0 : 9;
        context.globalAlpha = 0.92;
        for (const bin of bins) {
            const width = bin.hi - bin.lo;
            if (bin.count <= 0 || width <= 0) {
                continue;
            }
            const mean = bin.sizeSum / bin.count;
            const density = bin.count / width;
            if (!(mean > 0) || !(density > 0)) {
                continue;
            }
            const x = xScale(Math.log10(mean));
            const y = yScale(Math.log10(density));
            const radius = 2.3 + Math.min(3.4, Math.log10(bin.count + 1) * 0.75);
            context.beginPath();
            context.arc(x, y, radius, 0, Math.PI * 2);
            context.fill();
        }
        context.restore();
    }

    private drawHistogram(
        context: CanvasRenderingContext2D,
        bins: LogBin[],
        padding: { left: number; right: number; top: number; bottom: number },
        plotHeight: number,
        xScale: (value: number) => number,
        yScale: (value: number) => number
    ) {
        const baseline = padding.top + plotHeight;
        context.save();
        context.fillStyle = this.palette.dot;
        context.globalAlpha = 0.72;
        for (const bin of bins) {
            if (bin.count <= 0 || bin.hi <= bin.lo) {
                continue;
            }
            const density = bin.count / (bin.hi - bin.lo);
            if (!(density > 0)) {
                continue;
            }
            const left = xScale(Math.log10(bin.lo));
            const right = xScale(Math.log10(bin.hi));
            const top = yScale(Math.log10(density));
            const width = Math.max(1, right - left - 1);
            context.fillRect(left + 0.5, top, width, baseline - top);
        }
        context.restore();
    }

    private drawFitLine(
        context: CanvasRenderingContext2D,
        result: PowerLawResult,
        padding: { left: number; right: number; top: number; bottom: number },
        plotWidth: number,
        plotHeight: number,
        xScale: (value: number) => number,
        yScale: (value: number) => number
    ) {
        if (result.slope === null || result.intercept === null) {
            return;
        }
        const startX = Math.log10(result.fitFrom);
        const endX = Math.log10(result.fitTo);
        const startY = result.intercept + result.slope * startX;
        const endY = result.intercept + result.slope * endX;

        context.save();
        context.beginPath();
        context.rect(padding.left, padding.top, plotWidth, plotHeight);
        context.clip();
        context.beginPath();
        context.moveTo(xScale(startX), yScale(startY));
        context.lineTo(xScale(endX), yScale(endY));
        context.strokeStyle = this.palette.line;
        context.lineWidth = 1.4;
        context.shadowColor = this.palette.lineGlow;
        context.shadowBlur = 11;
        context.stroke();
        context.restore();
    }

    private calculateFit(entries: [number, number][]) {
        let totalFires = 0;
        let maxSize = 0;
        let maxFrequency = 0;
        let distinctSizes = 0;
        for (const [size, frequency] of entries) {
            if (!isValidEntry(size, frequency)) {
                continue;
            }
            totalFires += frequency;
            maxSize = Math.max(maxSize, size);
            maxFrequency = Math.max(maxFrequency, frequency);
            distinctSizes++;
        }

        const bins = buildLogBins(entries);
        const result = fitPowerLaw(bins, maxSize, 4);
        const fit: PowerLawFit = {
            totalFires,
            maxSize,
            maxFrequency,
            distinctSizes,
            alpha: result.alpha,
            r2: result.r2,
            fitFrom: result.fitFrom,
            fitTo: result.fitTo,
            bins: result.bins
        };
        return { fit, bins, result };
    }

    destroy() {
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
    }
}
