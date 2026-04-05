import { defineConfig } from 'tsup';

export default defineConfig([
    // ── CLI Binary (with shebang) ───────────────────────────────
    {
        entry: { index: 'src/index.ts' },
        format: ['esm'],
        target: 'node18',
        outDir: 'dist',
        clean: true,
        splitting: false,
        sourcemap: false,
        dts: false,
        banner: {
            js: '#!/usr/bin/env node',
        },
        esbuildOptions(options) {
            options.alias = { '@': './src' };
        },
    },
    // ── MCP Library (for lexq-mcp consumption) ──────────────────
    {
        entry: { 'mcp/register': 'src/mcp/register.ts' },
        format: ['esm'],
        target: 'node18',
        outDir: 'dist',
        clean: false, // Don't wipe the CLI output
        splitting: false,
        sourcemap: false,
        dts: true,
        esbuildOptions(options) {
            options.alias = { '@': './src' };
        },
    },
]);
