esbuild .\ts\main.ts --bundle --outfile=./ts/dist/main.js --format=iife --global-name=wallpaper --target=es2015
Copy-Item -Force .\ts\dist\main.js .\js\main.js