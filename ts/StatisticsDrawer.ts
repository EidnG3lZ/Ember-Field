import { FireStatistics } from "./FireSimulate";
import { ChartPalette } from "./theme";

export interface PowerLawFit {
    totalFires: number;
    maxSize: number;
    maxFrequency: number;
    distinctSizes: number;
    /** 幂律指数 alpha：P(s) ~ s^-alpha */
    alpha: number | null;
    /** 加权拟合优度 */
    r2: number | null;
    fitFrom: number;
    fitTo: number;
    bins: number;
}

interface BinPoint {
    x: number;
    y: number;
    weight: number;
}

const SUPERSCRIPT_DIGITS = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];

function pow10Label(exponent: number) {
    return "10" + String(exponent)
        .split("")
        .map((digit) => SUPERSCRIPT_DIGITS[Number(digit)] ?? digit)
        .join("");
}

/**
 * 统计面板：双对数散点 + 对数分箱幂律拟合。
 * 只统计“火灾规模 -> 发生次数”，拟合采用对数分箱后的加权最小二乘。
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
        const fit = this.calculateFit(entries);
        this.onFit(fit);
        if (this.emptyEl) {
            this.emptyEl.hidden = fit.totalFires > 0;
        }

        const padding = { left: 52, right: 22, top: 18, bottom: 44 };
        const plotWidth = Math.max(40, width - padding.left - padding.right);
        const plotHeight = Math.max(40, height - padding.top - padding.bottom);

        const maxSize = fit.totalFires > 0 ? fit.maxSize : 1000;
        const maxFrequency = fit.totalFires > 0 ? fit.maxFrequency : 100;
        const xMaxExp = Math.max(3, Math.log10(Math.max(10, maxSize)) + 0.25);
        const yMaxExp = Math.max(1.6, Math.log10(Math.max(10, maxFrequency)) + 0.35);
        const xMinExp = -0.1;
        const yMinExp = -0.1;

        const xScale = (logValue: number) =>
            padding.left + ((logValue - xMinExp) / (xMaxExp - xMinExp)) * plotWidth;
        const yScale = (logValue: number) =>
            padding.top + plotHeight - ((logValue - yMinExp) / (yMaxExp - yMinExp)) * plotHeight;

        this.drawGrid(context, padding, plotWidth, plotHeight, xMaxExp, yMaxExp, xScale, yScale);
        this.drawAxes(context, padding, plotWidth, plotHeight);
        this.drawTickLabels(context, padding, plotWidth, plotHeight, xMaxExp, yMaxExp, xScale, yScale);

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

        this.drawPoints(context, entries, padding, plotWidth, plotHeight, xScale, yScale);
        if (fit.alpha !== null) {
            this.drawFitLine(context, fit, entries, padding, plotWidth, plotHeight, xScale, yScale);
        }
        this.drawLegend(context, padding, plotWidth, fit.alpha !== null);
    }

    private drawLegend(
        context: CanvasRenderingContext2D,
        padding: { left: number; right: number; top: number; bottom: number },
        plotWidth: number,
        hasFit: boolean
    ) {
        const right = padding.left + plotWidth - 10;
        let y = padding.top + 13;
        context.save();
        context.font = "9.5px 'Microsoft YaHei', 'PingFang SC', sans-serif";
        context.textAlign = "right";
        context.textBaseline = "middle";
        context.fillStyle = this.palette.legend;

        context.fillText("观测数据", right, y);
        const dotWidth = context.measureText("观测数据").width;
        context.fillStyle = this.palette.dot;
        context.beginPath();
        context.arc(right - dotWidth - 11, y, 2.6, 0, Math.PI * 2);
        context.fill();

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
        for (let exponent = 0; exponent <= Math.floor(yMaxExp); exponent++) {
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
        for (let exponent = 0; exponent < Math.floor(yMaxExp); exponent++) {
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
        context.fillText("火灾规模 / 燃烧细胞数", padding.left + plotWidth / 2, this.height - 8);

        context.save();
        context.translate(14, padding.top + plotHeight / 2);
        context.rotate(-Math.PI / 2);
        context.textAlign = "center";
        context.textBaseline = "top";
        context.fillText("发生频次", 0, 0);
        context.restore();
        context.restore();
    }

    private drawTickLabels(
        context: CanvasRenderingContext2D,
        padding: { left: number; right: number; top: number; bottom: number },
        plotWidth: number,
        plotHeight: number,
        xMaxExp: number,
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
        for (let exponent = 0; exponent <= Math.floor(yMaxExp); exponent++) {
            const y = yScale(exponent);
            context.fillText(pow10Label(exponent), padding.left - 9, y);
        }
        context.restore();
    }

    private drawPoints(
        context: CanvasRenderingContext2D,
        entries: [number, number][],
        padding: { left: number; right: number; top: number; bottom: number },
        plotWidth: number,
        plotHeight: number,
        xScale: (value: number) => number,
        yScale: (value: number) => number
    ) {
        context.save();
        context.fillStyle = this.palette.dot;
        context.shadowColor = this.palette.dotGlow;
        context.shadowBlur = entries.length > 700 ? 0 : 9;
        context.globalAlpha = 0.92;
        for (const [size, frequency] of entries) {
            if (size <= 0 || frequency <= 0) {
                continue;
            }
            const x = xScale(Math.log10(size));
            const y = yScale(Math.log10(frequency));
            const radius = 2.3 + Math.min(3.4, Math.log10(frequency + 1) * 0.75);
            context.beginPath();
            context.arc(x, y, radius, 0, Math.PI * 2);
            context.fill();
        }
        context.restore();
    }

    private drawFitLine(
        context: CanvasRenderingContext2D,
        fit: PowerLawFit,
        entries: [number, number][],
        padding: { left: number; right: number; top: number; bottom: number },
        plotWidth: number,
        plotHeight: number,
        xScale: (value: number) => number,
        yScale: (value: number) => number
    ) {
        const regression = this.regress(fit, entries);
        if (regression === null) {
            return;
        }
        const startX = Math.log10(fit.fitFrom);
        const endX = Math.log10(fit.fitTo);
        const startY = regression.intercept + regression.slope * startX;
        const endY = regression.intercept + regression.slope * endX;

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

    private calculateFit(entries: [number, number][]): PowerLawFit {
        let totalFires = 0;
        let maxSize = 0;
        let maxFrequency = 0;
        let minSize = Infinity;
        let distinctSizes = 0;
        for (const [size, frequency] of entries) {
            if (!Number.isFinite(size) || size <= 0 || !Number.isFinite(frequency) || frequency <= 0) {
                continue;
            }
            totalFires += frequency;
            maxSize = Math.max(maxSize, size);
            maxFrequency = Math.max(maxFrequency, frequency);
            minSize = Math.min(minSize, size);
            distinctSizes++;
        }

        const base: PowerLawFit = {
            totalFires,
            maxSize,
            maxFrequency,
            distinctSizes,
            alpha: null,
            r2: null,
            fitFrom: 0,
            fitTo: 0,
            bins: 0
        };
        if (totalFires === 0) {
            return base;
        }

        const fitFrom = Math.max(4, minSize);
        const fitTo = maxSize;
        base.fitFrom = fitFrom;
        base.fitTo = fitTo;
        if (fitTo / fitFrom < 4) {
            return base;
        }

        const logLow = Math.log10(fitFrom);
        const logHigh = Math.log10(fitTo);
        const binCount = 12;
        const step = (logHigh - logLow) / binCount;
        const bins: { lo: number; hi: number; count: number }[] = [];
        for (let i = 0; i < binCount; i++) {
            bins.push({
                lo: Math.pow(10, logLow + i * step),
                hi: Math.pow(10, logLow + (i + 1) * step),
                count: 0
            });
        }

        for (const [size, frequency] of entries) {
            if (size < fitFrom || size > fitTo) {
                continue;
            }
            let index = Math.floor((Math.log10(size) - logLow) / step);
            if (index < 0) {
                index = 0;
            } else if (index >= binCount) {
                index = binCount - 1;
            }
            bins[index].count += frequency;
        }

        const points: BinPoint[] = [];
        let usedBins = 0;
        for (const bin of bins) {
            if (bin.count <= 0) {
                continue;
            }
            const center = Math.sqrt(bin.lo * bin.hi);
            points.push({
                x: Math.log10(center),
                y: Math.log10(bin.count),
                weight: bin.count
            });
            usedBins++;
        }
        base.bins = usedBins;
        if (points.length < 3) {
            return base;
        }

        let weightSum = 0;
        let xSum = 0;
        let ySum = 0;
        let xxSum = 0;
        let xySum = 0;
        for (const point of points) {
            weightSum += point.weight;
            xSum += point.weight * point.x;
            ySum += point.weight * point.y;
            xxSum += point.weight * point.x * point.x;
            xySum += point.weight * point.x * point.y;
        }
        const denominator = weightSum * xxSum - xSum * xSum;
        if (Math.abs(denominator) < 1e-12) {
            return base;
        }
        const slope = (weightSum * xySum - xSum * ySum) / denominator;
        const intercept = (ySum - slope * xSum) / weightSum;
        const alpha = 1 - slope;

        let residual = 0;
        let total = 0;
        const yMean = ySum / weightSum;
        for (const point of points) {
            const predicted = intercept + slope * point.x;
            residual += point.weight * Math.pow(point.y - predicted, 2);
            total += point.weight * Math.pow(point.y - yMean, 2);
        }
        const r2 = total > 1e-12 ? 1 - residual / total : null;

        base.alpha = Number.isFinite(alpha) ? alpha : null;
        base.r2 = r2 !== null && Number.isFinite(r2) ? r2 : null;
        return base;
    }

    private regress(fit: PowerLawFit, entries: [number, number][]) {
        const fitFrom = fit.fitFrom;
        const fitTo = fit.fitTo;
        if (fitTo / fitFrom < 4) {
            return null;
        }
        const logLow = Math.log10(fitFrom);
        const logHigh = Math.log10(fitTo);
        const binCount = 12;
        const step = (logHigh - logLow) / binCount;
        const bins: { lo: number; hi: number; count: number }[] = [];
        for (let i = 0; i < binCount; i++) {
            bins.push({
                lo: Math.pow(10, logLow + i * step),
                hi: Math.pow(10, logLow + (i + 1) * step),
                count: 0
            });
        }
        for (const [size, frequency] of entries) {
            if (size < fitFrom || size > fitTo) {
                continue;
            }
            let index = Math.floor((Math.log10(size) - logLow) / step);
            if (index < 0) {
                index = 0;
            } else if (index >= binCount) {
                index = binCount - 1;
            }
            bins[index].count += frequency;
        }
        const points: BinPoint[] = [];
        for (const bin of bins) {
            if (bin.count <= 0) {
                continue;
            }
            points.push({
                x: Math.log10(Math.sqrt(bin.lo * bin.hi)),
                y: Math.log10(bin.count),
                weight: bin.count
            });
        }
        if (points.length < 3) {
            return null;
        }
        let weightSum = 0;
        let xSum = 0;
        let ySum = 0;
        let xxSum = 0;
        let xySum = 0;
        for (const point of points) {
            weightSum += point.weight;
            xSum += point.weight * point.x;
            ySum += point.weight * point.y;
            xxSum += point.weight * point.x * point.x;
            xySum += point.weight * point.x * point.y;
        }
        const denominator = weightSum * xxSum - xSum * xSum;
        if (Math.abs(denominator) < 1e-12) {
            return null;
        }
        const slope = (weightSum * xySum - xSum * ySum) / denominator;
        const intercept = (ySum - slope * xSum) / weightSum;
        return { slope, intercept };
    }

    destroy() {
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
    }
}
