.\node_modules\.bin\esbuild .\ts\main.ts --bundle --outdir=./js --target=es2015
# Copy-Item -Force .\ts\dist\main.js .\js\main.js
