import { SimulatorDrawer } from "./SimulatorDrawer";
import { FireSimulate } from "./FireSimulate";
import { StatisticsDrawer } from "./StatisticsDrawer";

const simulatorCanvas = document.getElementById("canvas_1") as HTMLCanvasElement;
const statisticsDiv = document.getElementById("statistics_div") as HTMLDivElement;
const statisticsForm = document.getElementById("canvas_2") as HTMLCanvasElement;
const statisticsPoint = document.getElementById("canvas_3") as HTMLCanvasElement;

//test
const slider = document.getElementById('scaleSlider') as HTMLInputElement;
slider.addEventListener('input', () => {
    statisticsScale = parseFloat(slider.value);
    resizeStatistics(statisticsScale);
});

const originalStatisticsSize = {
    x: 400,
    y: 400
}//统计图表图像原始分辨率

//可配置数据
let cellSize = 3;//细胞大小
let tickTime = 15;//每帧持续时间，单位毫秒
let pRevive = 0.001;//生长概率
let pIgnite = 0.000001;//起火概率
let fireSpreadSpeed = 5;//每帧火灾蔓延距离
let burnStatusTime = 5;//燃烧状态推进耗时
let isSkipSpread = true;//是否跳过蔓延
let deadColor = "#292929";
let aliveColor = "#1ebf0c";
let burnColor1 = "#f1c40f";
let burnColor2 = "#e67e22";
let burnColor3 = "#e74c3c";
let formColor: string = "#ffffffff";
let textColor: string = "#ffffffff";
let pointColor: string = "#dca91dff";
let pointSize: number = 10;
let statisticsScale = 1;
let font: string = "10px orbitronmedium"

let isFontReady: boolean = false;

let cellNumberX: number;
let cellNumberY: number;

let fireSimulate: FireSimulate;
let simulatorDrawer: SimulatorDrawer;
let statisticsDrawer: StatisticsDrawer;

// let statistics: Map<number, number>;

//修改字体时
function changeFont(newFont: string) {
    font = newFont;
    isFontReady = false;
    loadFontAndDrawForm();
}

function loadFontAndDrawForm() {
    document.fonts.load(font).then(
        () => {
            isFontReady = true;
            statisticsDrawer.drawForm(true);
        }
    )
}

function resizeSimulate() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    simulatorCanvas.width = width;
    simulatorCanvas.height = height;
    cellNumberX = Math.ceil(width / cellSize);
    cellNumberY = Math.ceil(height / cellSize);

    fireSimulate = new FireSimulate(
        cellNumberX,
        cellNumberY,
        pRevive,
        pIgnite,
        fireSpreadSpeed,
        burnStatusTime,
        isSkipSpread
    );
    simulatorDrawer = new SimulatorDrawer(
        simulatorCanvas.getContext("2d"),
        cellSize,
        cellNumberX,
        cellNumberY,
        fireSimulate,
        deadColor,
        aliveColor,
        burnColor1,
        burnColor2,
        burnColor3
    );
    statisticsDrawer = new StatisticsDrawer(
        statisticsForm.getContext("2d"),
        statisticsPoint.getContext("2d"),
        originalStatisticsSize.x,
        originalStatisticsSize.y,
        fireSimulate,
        40,
        pointSize,
        statisticsScale,
        formColor,
        textColor,
        pointColor,
        font
    );
    statisticsDrawer.clear();
    statisticsDrawer.drawForm(false);
    loadFontAndDrawForm();
    //test
    // let ctx = canvas1.getContext('2d');
    // ctx.fillRect(0, 0, 32, 32);
    // ctx.fillRect(width-64,height-64,32,32);
    // statistics = fireSimulate.getFireStatistics();
}

function resizeStatistics(scale: number) {
    const displayWidth = Math.round(originalStatisticsSize.x * scale);
    const displayHeight = Math.round(originalStatisticsSize.y * scale);
    statisticsForm.width = displayWidth;
    statisticsForm.height = displayHeight;
    statisticsPoint.width = displayWidth;
    statisticsPoint.height = displayHeight;
    statisticsDiv.style.width = `${displayWidth}px`;
    statisticsDiv.style.height = `${displayHeight}px`
    statisticsDrawer.applyScale(scale);
}

//初始化
(function setup() {
    resizeSimulate();
    window.addEventListener('resize', resizeSimulate);
    resizeStatistics(1);
})();

//循环
function loop() {
    fireSimulate.tick();
    simulatorDrawer.draw();
    // console.log(statistics);
    statisticsDrawer.draw();
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
(async function doTickLoop() {
    while (true) {
        const startTime = Date.now();
        loop();
        const usedTime = Date.now() - startTime;
        // console.log(`used time:${usedTime}`)
        const sleepTime = tickTime - usedTime;
        if (sleepTime <= 0) {
            continue;
        }
        await sleep(sleepTime);
    }
})();