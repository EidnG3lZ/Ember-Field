$ErrorActionPreference = "Stop"

& .\node_modules\.bin\esbuild .\ts\main.ts --bundle --outdir=.\js --target=es2019 --log-level=warning
if ($LASTEXITCODE -ne 0) {
    throw "esbuild failed with exit code $LASTEXITCODE"
}

Write-Host "Built js/main.js"
