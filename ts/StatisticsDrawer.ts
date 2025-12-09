import { FireSimulate, FireStatistics } from "./FireSimulate";

export class StatisticsDrawer {
    private originalX: number;
    private originalY: number;
    private formContext: CanvasRenderingContext2D;
    private pointContext: CanvasRenderingContext2D;
    private scale: number = 1;
    private statistics: FireStatistics;
    private lastDrawVersion: number = 0;
    private textAreaSize: number;
    private pointSize: number;
    formColor: string;
    textColor: string;
    pointColor: string;
    textFont: string;

    constructor(
        formContext: CanvasRenderingContext2D | null,
        pointContext: CanvasRenderingContext2D | null,
        originalX: number,
        originalY: number,
        dataSource: FireSimulate,
        textSize: number,
        pointSize: number,
        scale: number,
        formColor: string,
        textColor: string,
        pointColor: string,
        textFont: string
    ) {
        if (formContext == null || pointContext == null) {
            throw new Error("null context");
        }
        this.originalX = originalX;
        this.originalY = originalY;
        this.formContext = formContext;
        this.pointContext = pointContext;
        this.statistics = dataSource.getFireStatistics();
        this.textAreaSize = textSize;
        this.pointSize = pointSize;
        this.scale = scale;
        this.formColor = formColor;
        this.textColor = textColor;
        this.pointColor = pointColor;
        this.textFont = textFont;
        this.clear();
    }

    applyScale(value: number) {
        this.scale = value;
        this.formContext.save();
        this.formContext.scale(this.scale, this.scale);
        this.formContext.clearRect(0, 0, this.originalX, this.originalY);
        this.formContext.restore();
        this.drawForm();
        this.draw(true);
    }

    drawForm(drawText = true) {
        const formSizeX = this.originalX - 1.5 * this.textAreaSize;
        const formSizeY = this.originalY - 1.5 * this.textAreaSize;
        const gridSizeX = formSizeX / 7;
        const gridSizeY = formSizeY / 7;
        this.formContext.save();
        this.formContext.reset();
        this.formContext.scale(this.scale, this.scale);
        this.formContext.translate(this.textAreaSize, this.originalY - this.textAreaSize);

        this.drawAxis(formSizeX, formSizeY, gridSizeX, gridSizeY);
        if (drawText) {
            this.drawText(formSizeX, formSizeY, gridSizeX, gridSizeY)
        }

        this.formContext.restore();
    }

    private drawAxis(formSizeX: number, formSizeY: number, gridSizeX: number, gridSizeY: number) {
        //画坐标轴
        this.formContext.save();
        this.formContext.strokeStyle = this.formColor;
        this.formContext.lineWidth = 4;
        //Y
        this.formContext.beginPath();
        this.formContext.moveTo(0, 0);
        this.formContext.lineTo(0, -formSizeY);
        this.formContext.closePath();
        this.formContext.stroke();
        //X
        this.formContext.beginPath();
        this.formContext.moveTo(0, 0);
        this.formContext.lineTo(formSizeX, 0);
        this.formContext.closePath();
        this.formContext.stroke();

        this.formContext.restore();

        //画格线
        this.formContext.save();
        this.formContext.strokeStyle = this.formColor;
        this.formContext.lineWidth = 1;
        //Y
        for (let i = 1; i <= 7; i++) {
            this.formContext.beginPath();
            this.formContext.moveTo(0, -(i * gridSizeY));
            this.formContext.lineTo(formSizeX, -(i * gridSizeY));
            this.formContext.closePath();
            this.formContext.stroke();
        }
        //X
        for (let i = 1; i <= 7; i++) {
            this.formContext.beginPath();
            this.formContext.moveTo(i * gridSizeX, 0);
            this.formContext.lineTo(i * gridSizeX, -(formSizeY));
            this.formContext.closePath();
            this.formContext.stroke();
        }

        this.formContext.restore();
    }

    private drawText(formSizeX: number, formSizeY: number, gridSizeX: number, gridSizeY: number) {
        //坐标轴文字
        this.formContext.save();
        this.formContext.fillStyle = this.textColor;
        this.formContext.font = this.textFont;
        this.formContext.textAlign = "right";
        this.formContext.textBaseline = "middle";
        //原点
        this.formContext.save();
        this.formContext.translate(-5, 5);
        this.formContext.rotate(-0.785);
        this.formContext.fillText("10^0", 0, 0, 0.7 * this.textAreaSize);
        this.formContext.restore();
        //Y
        this.formContext.save();
        this.formContext.translate(-5, 0);
        for (let i = 1; i <= 7; i++) {
            this.formContext.translate(0, -gridSizeY);
            this.formContext.save();
            this.formContext.rotate(-0.785);
            this.formContext.fillText(`10^${i}`, 0, 0, 0.7 * this.textAreaSize);
            this.formContext.restore();
        }
        this.formContext.restore();
        //X
        this.formContext.save();
        this.formContext.translate(0, 5);
        for (let i = 1; i <= 7; i++) {
            this.formContext.translate(gridSizeX, 0);
            this.formContext.save();
            this.formContext.rotate(-0.785);
            this.formContext.fillText(`10^${i}`, 0, 0, 0.7 * this.textAreaSize);
            this.formContext.restore();
        }
        this.formContext.restore();

        this.formContext.restore();

        //坐标轴说明
        this.formContext.save();
        this.formContext.font = this.textFont;
        this.formContext.fillStyle = this.textColor;
        this.formContext.textAlign = "center";
        this.formContext.textBaseline = "top";
        this.formContext.fillText("Fire size", formSizeX * (1 / 2), this.textAreaSize * (2 / 3));
        this.formContext.textBaseline = "bottom";
        this.formContext.rotate(-1.57);
        this.formContext.fillText("Fire frequency", formSizeY * (1 / 2), -(this.textAreaSize * (2 / 3)));
        this.formContext.restore();
    }

    private drawPoints(gridSizeX: number, gridSizeY: number) {
        this.pointContext.save();
        this.pointContext.fillStyle = this.pointColor;
        for (let [fireSize, fireFrequency] of this.statistics.data) {
            this.pointContext.beginPath();
            this.pointContext.arc(
                Math.log10(fireSize) * gridSizeX,
                -Math.log10(fireFrequency) * gridSizeY,
                this.pointSize / 2,
                0,
                Math.PI * 2
            );
            this.pointContext.fill();
        }
        this.pointContext.restore();
    }

    clear() {
        this.formContext.reset();
        this.pointContext.reset();
        this.formContext.save();
        this.pointContext.save();
        this.formContext.scale(this.scale, this.scale);
        this.pointContext.scale(this.scale, this.scale);
        this.formContext.clearRect(0, 0, this.originalX, this.originalY);
        this.pointContext.clearRect(0, 0, this.originalX, this.originalY);
        this.formContext.restore();
        this.pointContext.restore();
    }

    draw(force = false) {
        if (this.lastDrawVersion >= this.statistics.version && !force) {
            return;
        }
        const formSizeX = this.originalX - 1.5 * this.textAreaSize;
        const formSizeY = this.originalY - 1.5 * this.textAreaSize;
        const gridSizeX = formSizeX / 7;
        const gridSizeY = formSizeY / 7;
        // this.formContext.save();
        // this.formContext.scale(this.scale, this.scale);
        // this.formContext.translate(this.textAreaSize, this.originalY - this.textAreaSize);

        this.pointContext.save();
        this.pointContext.scale(this.scale, this.scale);
        this.pointContext.clearRect(0, 0, this.originalX, this.originalY);//清空上一次绘制
        this.pointContext.translate(this.textAreaSize, this.originalY - this.textAreaSize);

        //清除上次绘制
        // this.formContext.clearRect(0, 0, formSizeX, -formSizeY);

        //重绘格子
        // this.drawGrid(formSizeX, formSizeY, gridSizeX, gridSizeY);

        //画点
        this.drawPoints(gridSizeX, gridSizeY);

        // this.formContext.restore();

        this.pointContext.restore();

        this.lastDrawVersion = this.statistics.version;
        //test
        console.log(this.statistics);
    }
}