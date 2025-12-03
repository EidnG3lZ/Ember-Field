import { Drawer } from "./Drawer";
import { FireSimulate } from "./FireSimulate";

const canvas1 = document.getElementById("canvas_1") as HTMLCanvasElement;

let cellSize = 4;//细胞大小
let tickTime = 50;//每帧持续时间，单位毫秒
let pRevive = 0.002;//生长概率
let pIgnite = 0.00001;//起火概率
let deadColor = "#292929"
let aliveColor = "#1ebf0c"
let burnColor1 = "#f1c40f"
let burnColor2 = "#e67e22"
let burnColor3 = "#e74c3c"

let cellNumberX: number;
let cellNumberY: number;

let fireSimulate: FireSimulate;
let drawer: Drawer;

function resizeSimulate() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas1.width = width;
    canvas1.height = height;
    cellNumberX = Math.ceil(width / cellSize);
    cellNumberY = Math.ceil(height / cellSize);

    fireSimulate = new FireSimulate(cellNumberX, cellNumberY, pRevive, pIgnite);
    drawer = new Drawer(canvas1.getContext("2d"), cellSize, cellNumberX, cellNumberY, fireSimulate.getCellGrid(), deadColor, aliveColor, burnColor1, burnColor2, burnColor3)

    //test
    // let ctx = canvas1.getContext('2d');
    // ctx.fillRect(0, 0, 32, 32);
    // ctx.fillRect(width-64,height-64,32,32);
}

//初始化
(function setup() {
    resizeSimulate();
    window.addEventListener('resize', resizeSimulate);
})();

//循环
function loop() {
    fireSimulate.tick();
    drawer.draw();
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