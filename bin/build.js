import * as esbuild from 'esbuild';
esbuild.build({
    entryPoints: ['./resources/js/emoji-picker-element.js'],
    outfile: './dist/emoji-picker-element.js',
    bundle: true,
    mainFields: ['module', 'main'],
    platform: 'neutral',
    // treeShaking: true,
    target: ['es2020'],
    // minify: true,
});
