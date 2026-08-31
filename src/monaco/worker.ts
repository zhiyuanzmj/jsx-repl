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

const getVirtualCodePlugin = (
  name: string,
  index: number,
  enforce?: string,
) => ({
  name: 'virtual-code' + index,
  resolveVirtualCode({ codes, filePath }: TsmVirtualCode) {
    if (filePath.startsWith('/src')) {
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
}

let ts: typeof import('typescript')
let locale: string | undefined
let tsMacroOptions: any

function resolvePlugins(
  plugins: (TsmLanguagePlugin | undefined)[],
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
          getVirtualCodePlugin(p.name, index, p.enforce),
        )
      else if (p.enforce === 'post')
        postPlugins.push(
          { ...p, enforce: undefined },
          getVirtualCodePlugin(p.name, index, p.enforce),
        )
      else
        normalPlugins.push(
          { ...p, enforce: undefined },
          getVirtualCodePlugin(p.name, index, p.enforce),
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
      { tsconfig, dependencies }: CreateData,
    ) => {
      const asFileName = (uri: URI) => uri.path
      const asUri = (fileName: string): URI => URI.file(fileName)
      const env: LanguageServiceEnvironment = {
        workspaceFolders: [URI.file('/')],
        locale,
        fs: createNpmFileSystem(
          (uri) => {
            if (uri.scheme === 'file') {
              if (uri.path === '/node_modules') {
                return ''
              } else if (uri.path.startsWith('/node_modules/')) {
                return uri.path.slice('/node_modules/'.length)
              }
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
