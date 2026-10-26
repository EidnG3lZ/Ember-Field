export let getRGBAFromStr = (() => {
    const colorCache = new Map<string, { r: number, g: number, b: number, a: number }>();
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
        throw new Error("getRGBAFromStr:Canvas creation failed or context acquisition failed");
    }
    return function cssColorToRGBA(cssColor: string): { r: number, g: number, b: number, a: number } | undefined {
        if (colorCache.has(cssColor) && colorCache.get(cssColor) !== undefined) {
            return colorCache.get(cssColor)!;
        }
        colorCache.delete(cssColor);
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "#00000000";
        ctx.fillStyle = cssColor;
        const computedColor = ctx?.fillStyle;
        ctx.fillStyle = "#ffffffff";
        ctx.fillStyle = cssColor;
        if (computedColor !== ctx.fillStyle) {
            return;
        }
        ctx.fillRect(0,0,1,1);
        const pixelData = ctx.getImageData(0,0,1,1).data;
        return {r:pixelData[0],g:pixelData[1],b:pixelData[2],a:pixelData[3]}
    }
})()
