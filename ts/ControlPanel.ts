import { formatPercent, formatScientific, Settings } from "./settings";
import { THEME_LIST, ThemeId } from "./theme";

type NumericKey =
    | "pRevive"
    | "pIgnite"
    | "fireSpreadSpeed"
    | "burnStatusTime"
    | "cellSize"
    | "tickTime"
    | "chartScale";

interface SliderDefinition {
    key: NumericKey;
    label: string;
    kind: "log" | "linear";
    min: number;
    max: number;
    step: number;
    format: (value: number) => string;
    applyOnChange?: boolean;
}

const SLIDERS: SliderDefinition[] = [
    {
        key: "pRevive",
        label: "生长率",
        kind: "log",
        min: -5,
        max: -1,
        step: 0.1,
        format: formatScientific
    },
    {
        key: "pIgnite",
        label: "起火率",
        kind: "log",
        min: -8,
        max: -4,
        step: 0.1,
        format: formatScientific
    },
    {
        key: "fireSpreadSpeed",
        label: "蔓延速度",
        kind: "linear",
        min: 1,
        max: 20,
        step: 1,
        format: (value) => value + " 层/周期"
    },
    {
        key: "burnStatusTime",
        label: "燃烧时长",
        kind: "linear",
        min: 1,
        max: 20,
        step: 1,
        format: (value) => value + " 帧/段"
    },
    {
        key: "cellSize",
        label: "细胞尺寸",
        kind: "linear",
        min: 2,
        max: 6,
        step: 1,
        format: (value) => value + " px",
        applyOnChange: true
    },
    {
        key: "tickTime",
        label: "帧间隔",
        kind: "linear",
        min: 8,
        max: 50,
        step: 1,
        format: (value) => value + " ms"
    }
];

interface ControlPanelOptions {
    container: HTMLElement;
    settings: Settings;
    onChange: (patch: Partial<Settings>) => void;
    onResetStatistics: () => void;
    onRebuild: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string
): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    if (className) {
        element.className = className;
    }
    if (text !== undefined) {
        element.textContent = text;
    }
    return element;
}

function section(title: string) {
    const wrapper = el("section", "ctrl-group");
    const heading = el("h3", "ctrl-group-title", title);
    wrapper.appendChild(heading);
    return wrapper;
}

export class ControlPanel {
    private settings: Settings;
    private onChange: (patch: Partial<Settings>) => void;
    private onResetStatistics: () => void;
    private onRebuild: () => void;
    private sliderInputs = new Map<NumericKey, HTMLInputElement>();
    private sliderReadouts = new Map<NumericKey, HTMLElement>();
    private themeButtons = new Map<ThemeId, HTMLButtonElement>();
    private switches = new Map<keyof Settings, HTMLInputElement>();

    constructor(options: ControlPanelOptions) {
        this.settings = options.settings;
        this.onChange = options.onChange;
        this.onResetStatistics = options.onResetStatistics;
        this.onRebuild = options.onRebuild;
        this.build(options.container);
        this.sync();
    }

    setSettings(settings: Settings) {
        this.settings = settings;
        this.sync();
    }

    sync() {
        for (const definition of SLIDERS) {
            const input = this.sliderInputs.get(definition.key);
            const readout = this.sliderReadouts.get(definition.key);
            if (!input || !readout) {
                continue;
            }
            const value = this.settings[definition.key] as number;
            const sliderValue = definition.kind === "log" ? Math.log10(value) : value;
            input.value = String(sliderValue);
            readout.textContent = definition.format(value);
            this.updateFill(input);
        }
        for (const [id, button] of this.themeButtons) {
            button.classList.toggle("is-active", this.settings.theme === id);
            button.setAttribute("aria-pressed", String(this.settings.theme === id));
        }
        const switchValues: Record<string, boolean> = {
            isSkipSpread: this.settings.isSkipSpread,
            showClock: this.settings.showClock,
            mouseIgnite: this.settings.mouseIgnite
        };
        for (const [key, input] of this.switches) {
            input.checked = Boolean(switchValues[key as string]);
        }
    }

    private build(container: HTMLElement) {
        container.innerHTML = "";

        const appearance = section("主题");
        const segmented = el("div", "segmented");
        segmented.setAttribute("role", "group");
        segmented.setAttribute("aria-label", "视觉主题");
        for (const theme of THEME_LIST) {
            const button = el("button", "segmented-button", theme.label);
            button.type = "button";
            button.dataset.theme = theme.id;
            button.title = theme.description;
            button.addEventListener("click", () => {
                this.onChange({ theme: theme.id });
            });
            segmented.appendChild(button);
            this.themeButtons.set(theme.id, button);
        }
        appearance.appendChild(segmented);

        const simulation = section("模拟参数");
        const grid = el("div", "ctrl-grid");
        for (const definition of SLIDERS) {
            grid.appendChild(this.createSlider(definition));
        }
        simulation.appendChild(grid);
        simulation.appendChild(
            this.createSwitch("isSkipSpread", "瞬间蔓延", "跳过逐帧动画，火灾在一帧内完成")
        );
        appearance.appendChild(simulation);

        const display = section("显示与交互");
        display.appendChild(
            this.createSlider({
                key: "chartScale",
                label: "面板缩放",
                kind: "linear",
                min: 0.5,
                max: 1.5,
                step: 0.05,
                format: formatPercent
            })
        );
        display.appendChild(this.createSwitch("showClock", "显示时钟", "顶部本地时间"));
        display.appendChild(this.createSwitch("mouseIgnite", "鼠标点火", "在画面上点击或拖拽"));

        const actions = el("div", "ctrl-actions");
        const resetButton = el("button", "btn", "重置统计");
        resetButton.type = "button";
        resetButton.addEventListener("click", () => this.onResetStatistics());
        const rebuildButton = el("button", "btn btn-accent", "重建模拟");
        rebuildButton.type = "button";
        rebuildButton.addEventListener("click", () => this.onRebuild());
        actions.appendChild(resetButton);
        actions.appendChild(rebuildButton);
        display.appendChild(actions);

        container.appendChild(appearance);
        container.appendChild(display);
    }

    private createSlider(definition: SliderDefinition) {
        const wrapper = el("div", "ctrl");
        const row = el("div", "ctrl-row");
        const label = el("span", "ctrl-label", definition.label);
        const readout = el("span", "ctrl-value", "");
        row.appendChild(label);
        row.appendChild(readout);

        const input = el("input", "range");
        input.type = "range";
        input.min = String(definition.min);
        input.max = String(definition.max);
        input.step = String(definition.step);
        input.setAttribute("aria-label", definition.label);

        const readValue = () => {
            const raw = Number(input.value);
            const value = definition.kind === "log" ? Math.pow(10, raw) : raw;
            return definition.key === "cellSize" ||
                definition.key === "fireSpreadSpeed" ||
                definition.key === "burnStatusTime" ||
                definition.key === "tickTime"
                ? Math.round(value)
                : value;
        };

        input.addEventListener("input", () => {
            const value = readValue();
            readout.textContent = definition.format(value);
            this.updateFill(input);
            if (!definition.applyOnChange) {
                this.emit(definition.key, value);
            }
        });
        if (definition.applyOnChange) {
            input.addEventListener("change", () => {
                this.emit(definition.key, readValue());
            });
        }

        wrapper.appendChild(row);
        wrapper.appendChild(input);
        this.sliderInputs.set(definition.key, input);
        this.sliderReadouts.set(definition.key, readout);
        return wrapper;
    }

    private createSwitch(key: "isSkipSpread" | "showClock" | "mouseIgnite", title: string, hint: string) {
        const row = el("label", "switch-row");
        const text = el("span", "switch-text");
        text.appendChild(el("span", "switch-title", title));
        text.appendChild(el("span", "switch-hint", hint));
        const input = el("input");
        input.type = "checkbox";
        input.setAttribute("aria-label", title);
        const track = el("i", "switch-track");
        track.appendChild(el("i", "switch-thumb"));
        input.addEventListener("change", () => {
            this.onChange({ [key]: input.checked } as Partial<Settings>);
        });
        row.appendChild(text);
        row.appendChild(input);
        row.appendChild(track);
        this.switches.set(key, input);
        return row;
    }

    private emit(key: NumericKey, value: number) {
        this.onChange({ [key]: value } as Partial<Settings>);
    }

    private updateFill(input: HTMLInputElement) {
        const min = Number(input.min);
        const max = Number(input.max);
        const value = Number(input.value);
        const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
        input.style.setProperty("--fill", percent.toFixed(2) + "%");
    }
}
