esbuild .\ts\main.ts --bundle --outfile=./ts/dist/main.js --format=iife --global-name=wallpaper --target=es2015
Move-Item .\ts\dist\main.js .\js\main.js