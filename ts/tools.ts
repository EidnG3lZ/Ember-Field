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
