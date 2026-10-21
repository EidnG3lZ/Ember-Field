const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

function pad2(value: number) {
    return value < 10 ? "0" + value : String(value);
}

/**
 * 顶部数字时钟。只负责时间显示，不参与模拟循环。
 * 秒数用低干扰的小字 + 分钟进度条呈现。
 */
export class Clock {
    private root: HTMLElement;
    private hourMinuteEl: HTMLElement;
    private secondEl: HTMLElement;
    private dateEl: HTMLElement;
    private weekdayEl: HTMLElement;
    private barEl: HTMLElement;
    private lastMinute = -1;
    private lastSecond = -1;
    private rafId = 0;
    private running = false;

    constructor(root: HTMLElement) {
        this.root = root;
        const hourMinuteEl = root.querySelector<HTMLElement>("[data-clock='hm']");
        const secondEl = root.querySelector<HTMLElement>("[data-clock='sec']");
        const dateEl = root.querySelector<HTMLElement>("[data-clock='date']");
        const weekdayEl = root.querySelector<HTMLElement>("[data-clock='weekday']");
        const barEl = root.querySelector<HTMLElement>("[data-clock='bar']");
        if (!hourMinuteEl || !secondEl || !dateEl || !weekdayEl || !barEl) {
            throw new Error("clock elements are missing");
        }
        this.hourMinuteEl = hourMinuteEl;
        this.secondEl = secondEl;
        this.dateEl = dateEl;
        this.weekdayEl = weekdayEl;
        this.barEl = barEl;
        this.update(true);
        this.start();
    }

    start() {
        if (this.running) {
            return;
        }
        this.running = true;
        const loop = () => {
            if (!this.running) {
                return;
            }
            this.update(false);
            this.rafId = requestAnimationFrame(loop);
        };
        this.rafId = requestAnimationFrame(loop);
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this.rafId);
    }

    setVisible(visible: boolean) {
        this.root.classList.toggle("is-hidden", !visible);
    }

    private update(force: boolean) {
        const now = new Date();
        const minute = now.getMinutes();
        const second = now.getSeconds();

        if (force || minute !== this.lastMinute) {
            this.lastMinute = minute;
            this.hourMinuteEl.textContent = pad2(now.getHours()) + ":" + pad2(minute);
            this.dateEl.textContent = (now.getMonth() + 1) + "月" + now.getDate() + "日";
            this.weekdayEl.textContent = WEEKDAYS[now.getDay()];
        }

        if (force || second !== this.lastSecond) {
            this.lastSecond = second;
            this.secondEl.textContent = pad2(second);
        }

        // 进度条按毫秒平滑推进，视觉上不会一跳一跳
        const progress = (second + now.getMilliseconds() / 1000) / 60;
        this.barEl.style.transform = "scaleX(" + progress.toFixed(4) + ")";
    }
}
