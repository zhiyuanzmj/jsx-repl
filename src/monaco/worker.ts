// @ts-expect-error
import * as worker from 'monaco-editor-core/esm/vs/editor/editor.worker'
import type * as monaco from 'monaco-editor-core'
import {
  type LanguageServiceEnvironment,
  createTypeScriptWorkerLanguageService,
} from '@volar/monaco/worker'
import { createNpmFileSystem } from '@volar/jsdelivr'
import { getLanguagePlugins } from '@ts-macro/language-plugin'
import { create as createTypeScriptServices } from 'volar-service-typescript'
import type { WorkerHost, WorkerMessage } from './env'
import { URI } from 'vscode-uri'
import {
  type TsmLanguagePlugin,
  type TsmVirtualCode,
  buildMappings,
  toString,
} from 'ts-macro'

// filePath is the virtual code's uri path, scoped with the per-instance
// prefix (see asUri below), e.g. `/1/src/App.tsx`
const getVirtualCodePlugin = (
  name: string,
  index: number,
  uriPrefix: string,
  enforce?: string,
) => ({
  name: 'virtual-code' + index,
  resolveVirtualCode({ codes, filePath }: TsmVirtualCode) {
    if (filePath.startsWith(uriPrefix + 'src')) {
      self.postMessage({
        filePath,
        code: toString(codes),
        map: buildMappings(codes).slice(1),
        prevName: name || `plugin ${index}`,
        enforce: enforce,
        init: !index,
      })
    }
  },
})

export interface CreateData {
  tsconfig: {
    compilerOptions?: import('typescript').CompilerOptions
  }
  tsMacroConfig: any
  dependencies: Record<string, string>
  /** per-instance prefix prepended to monaco model URIs, stripped here */
  uriPrefix: string
}

let ts: typeof import('typescript')
let locale: string | undefined
let tsMacroOptions: any

function resolvePlugins(
  plugins: (TsmLanguagePlugin | undefined)[],
  uriPrefix: string,
): TsmLanguagePlugin[] {
  const prePlugins: TsmLanguagePlugin[] = []
  const postPlugins: TsmLanguagePlugin[] = []
  const normalPlugins: TsmLanguagePlugin[] = []

  if (plugins) {
    plugins.flat().forEach((p, index) => {
      if (!p) return
      if (p.enforce === 'pre')
        prePlugins.push(
          { ...p, enforce: undefined },
          getVirtualCodePlugin(p.name, index, uriPrefix, p.enforce),
        )
      else if (p.enforce === 'post')
        postPlugins.push(
          { ...p, enforce: undefined },
          getVirtualCodePlugin(p.name, index, uriPrefix, p.enforce),
        )
      else
        normalPlugins.push(
          { ...p, enforce: undefined },
          getVirtualCodePlugin(p.name, index, uriPrefix, p.enforce),
        )
    })
  }
  const result = [...prePlugins, ...normalPlugins, ...postPlugins]

  // unique
  const map = new Map()
  for (const [index, plugin] of result.entries()) {
    map.set(plugin.name || `plugin-${index}`, plugin)
  }
  return [...map.values()]
}

self.onmessage = async (msg: MessageEvent<WorkerMessage>) => {
  if (msg.data?.event === 'init') {
    try {
      tsMacroOptions = await import(
        /* @vite-ignore */ msg.data.tsMacroConfig
      ).then((i) => i.default || { plugins: [] })
    } catch (e) {
      tsMacroOptions = { plugins: [] }
      console.error(e)
    }
    locale = msg.data.tsLocale
    ts = await importTsFromCdn(msg.data.tsVersion)
    self.postMessage('inited')
    return
  }

  worker.initialize(
    (
      ctx: monaco.worker.IWorkerContext<WorkerHost>,
      { tsconfig, dependencies, uriPrefix }: CreateData,
    ) => {
      // '/1/src/App.tsx' -> '/src/App.tsx' (keep the leading slash:
      // the language service must only ever see absolute paths)
      const asFileName = (uri: URI) =>
        uri.path.startsWith(uriPrefix)
          ? uri.path.slice(uriPrefix.length - 1)
          : uri.path
      // must round-trip with asFileName: the language service maps script
      // names back to monaco model uris via asUri to read their contents
      // '/src/App.tsx' -> '/1/src/App.tsx' — strip the leading slash first,
      // uriPrefix already ends with one (avoids 'file:///1//src/App.tsx')
      const asUri = (fileName: string): URI =>
        URI.file(uriPrefix + fileName.replace(/^\//, ''))
      const env: LanguageServiceEnvironment = {
        workspaceFolders: [URI.file('/')],
        locale,
        fs: createNpmFileSystem(
          (uri) => {
            if (uri.scheme !== 'file') return
            const path = asFileName(uri)
            if (path === '/node_modules') {
              return ''
            } else if (path.startsWith('/node_modules/')) {
              return path.slice('/node_modules/'.length)
            }
          },
          (pkgName) => {
            if (!pkgName.startsWith('https://')) {
              return dependencies[pkgName]?.split('?')[0].replace('^', '')
            }
          },
          (path, content) => {
            ctx.host.onFetchCdnFile(
              asUri('/node_modules/' + path).toString(),
              content,
            )
          },
        ),
      }

      const { options: compilerOptions } = ts.convertCompilerOptionsFromJson(
        tsconfig?.compilerOptions || {},
        '',
      )

      tsMacroOptions.plugins = resolvePlugins(
        tsMacroOptions.plugins.flatMap((plugin: any) => {
          if (typeof plugin === 'function') {
            return plugin({
              ts,
              compilerOptions,
            })
          } else {
            return plugin
          }
        }),
        uriPrefix,
      )

      return createTypeScriptWorkerLanguageService({
        typescript: ts,
        compilerOptions,
        workerContext: ctx,
        env,
        uriConverter: {
          asFileName,
          asUri,
        },
        languagePlugins: getLanguagePlugins(
          ts,
          compilerOptions,
          tsMacroOptions,
        ),
        languageServicePlugins: createTypeScriptServices(ts),
      })
    },
  )
}

async function importTsFromCdn(tsVersion: string) {
  const _module = globalThis.module
  ;(globalThis as any).module = { exports: {} }
  const tsUrl = `https://cdn.jsdelivr.net/npm/typescript@${tsVersion}/lib/typescript.js`
  await import(/* @vite-ignore */ tsUrl)
  const ts = globalThis.module.exports
  globalThis.module = _module
  return ts as typeof import('typescript')
}
