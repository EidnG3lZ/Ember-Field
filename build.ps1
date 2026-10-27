$ErrorActionPreference = "Stop"

# 编译参数统一放在 package.json 的 scripts 里，这里只负责调用，避免两处参数漂移
Set-Location $PSScriptRoot

& npm.cmd run build
if ($LASTEXITCODE -ne 0) {
    throw "esbuild failed with exit code $LASTEXITCODE"
}

Write-Host "Built js/main.js"
Read-Host
