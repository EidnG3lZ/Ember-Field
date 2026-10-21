# Ember Field

基于 Canvas 的森林火灾元胞自动机壁纸，可直接导入 Wallpaper Engine。绿色细胞持续生长，闪电随机点燃，火焰以分形方式蔓延；顶部是本地时钟，底部面板用双对数坐标记录火灾规模的幂律分布。

![预览](preview.jpg)

## 功能

- **火灾模拟**：生长、随机点火、逐帧蔓延 / 瞬间蔓延、三段燃烧动画，参数均可实时调整。
- **本地时钟**：顶部大号数字时钟，包含时:分、低干扰秒数、分钟进度条、中文日期与星期。每秒平滑更新。
- **统计面板**：双对数散点图 + 对数分箱幂律拟合，显示 `α`、`R²`、样本数与最大火灾规模。
- **两套主题**：
  - 霓虹（默认）：近黑背景、荧光绿生命体、琥珀到绯红的火焰，玻璃拟态面板。
  - 终端：暖色复古 CRT 风格，扫描线、荧光绿与 Orbitron 时钟。
- **鼠标交互**：在画面上点击或拖拽即可点燃圆形区域内的存活细胞，并出现点火波纹。
- **参数面板**：主题、生长率、起火率、蔓延速度、燃烧时长、细胞尺寸、帧间隔、瞬间蔓延、面板缩放、时钟与鼠标点火开关。
- **状态持久化**：主题与参数保存在 `localStorage`，刷新后保持。
- **Wallpaper Engine**：附带 `project.json`，可在编辑器中直接调整主题、时钟、细胞尺寸、生长率、起火率等属性。

## 操作

| 操作 | 说明 |
| --- | --- |
| 点击右下角「统计面板」 | 展开 / 收起面板 |
| 在画面点击或拖拽 | 点燃细胞 |
| `T` | 切换霓虹 / 终端主题 |
| `P` | 展开 / 收起统计面板 |

URL 调试参数：`?panel=1` 默认展开面板；`?theme=terminal` 强制终端主题；`?debug=1` 暴露 `window.__emberField` 调试接口。

## 统计图怎么读

- 横轴：一次火灾燃烧的细胞总数（对数刻度）。
- 纵轴：该规模的火灾发生次数（对数刻度）。
- 琥珀色圆点：原始观测数据，点越大表示发生次数越多。
- 绿色直线：对 `x ≥ 4` 的数据做对数分箱后的加权最小二乘拟合。对于 `P(s) ∝ s^-α`，在对数分箱下 `α = 1 - slope`。
- `α`：幂律指数；`R²`：加权拟合优度。

> 火灾规模采用「本次火灾中所有被点燃的细胞数」，包含火种与蔓延到的细胞。

## 开发

需要 Node.js 与已安装的依赖：

```bash
npm install
npm run build      # 输出 js/main.js
npm run watch      # 开发时监听
```

Windows 也可以直接运行：

```powershell
.\build.ps1
```

入口是 `index.html`，源码在 `ts/`，样式在 `css/style.css`。

## 导入 Wallpaper Engine

1. 在 Wallpaper Engine 编辑器中点击「创建壁纸」，把项目根目录的 `index.html` 拖入。
2. 编辑器会读取同目录的 `project.json`，右侧出现主题、时钟、细胞尺寸等可调属性。
3. 如果修改了 TypeScript 源码，先执行 `npm run build` 生成 `js/main.js` 再导入。

## 文件结构

```text
index.html            页面结构
project.json          Wallpaper Engine 工程与用户属性
css/style.css         主题、时钟、面板与响应式样式
css/font.css          Orbitron 字体声明
font/                 Orbitron 字体文件
ts/main.ts            入口与主循环、交互、WE 属性桥接
ts/FireSimulate.ts    元胞自动机与火灾统计
ts/SimulatorDrawer.ts 主画面差分绘制
ts/StatisticsDrawer.ts 双对数图表与幂律拟合
ts/Clock.ts           时钟
ts/ControlPanel.ts    参数面板
ts/settings.ts        默认参数、持久化与格式化
ts/theme.ts           两套主题的模拟与图表调色板
js/main.js            esbuild 构建产物
preview.jpg           商店 / 编辑器预览图
```
