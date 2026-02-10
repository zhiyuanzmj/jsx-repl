import { type Plugin, mergeConfig } from 'vite'
import base from './vite.config'
import fs from 'node:fs'
import path from 'node:path'

const genStub: Plugin = {
  name: 'gen-stub',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'ssr-stub.js',
      source: `module.exports = {}`,
    })
  },
}

/**
 * Patch generated entries and import their corresponding CSS files.
 * Also normalize MonacoEditor.css
 */
const patchCssFiles: Plugin = {
  name: 'patch-css',
  apply: 'build',
  writeBundle() {
    //  inject css imports to the files
    const outDir = path.resolve('dist')
    ;['index'].forEach((file) => {
      const filePath = path.resolve(outDir, file + '.js')
      const content = fs.readFileSync(filePath, 'utf-8')
      fs.writeFileSync(filePath, `import './${file}.css'\n${content}`)
    })
  },
}
delete base.build!.lib
delete base.build!.outDir
export default mergeConfig(base, {
  plugins: [genStub, patchCssFiles],
  optimizeDeps: {
    // avoid late discovered deps
    include: [
      'typescript',
      'monaco-editor-core/esm/vs/editor/editor.worker',
      'vue/server-renderer',
    ],
  },
  build: {
    target: 'esnext',
    minify: process.env.DEV ? false : 'terser',
    lib: {
      entry: './src/index.ts',
      formats: ['es'],
      fileName: () => '[name].js',
    },
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
      external: ['vue', 'vue/compiler-sfc'],
    },
  },
})
