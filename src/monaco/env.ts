import * as volar from '@volar/monaco'
import { Uri, editor, languages } from 'monaco-editor-core'
import editorWorker from 'monaco-editor-core/esm/vs/editor/editor.worker?worker&inline'
import type { Store } from '../store'
import { getOrCreateModel } from './utils'
import type { CreateData } from './worker'
import Worker from './worker?worker&inline'
import * as languageConfigs from './language-configs'
import type { WorkerLanguageService } from '@volar/monaco/worker'
import { debounce } from '../utils'

// Monaco keeps one global model table keyed by URI, and Volar's language
// service runs per-URI as well. Multiple repl instances on the same page
// would therefore share (and overwrite) each other's files. Scope every
// model URI with the owning store's instance id, and strip the prefix in
// the worker's uriConverter so the language service still sees plain
// file:///src/App.tsx paths.
let storeInstanceId = 0

export function getStoreUriPrefix(store: Store) {
  if (!store.uriPrefix) {
    store.uriPrefix = `/${++storeInstanceId}/`
  }
  return store.uriPrefix
}

export function toMonacoUri(store: Store, filename: string) {
  return Uri.parse(`file://${getStoreUriPrefix(store)}${filename}`)
}

export function fromMonacoPath(store: Store, path: string) {
  // store.files are keyed without the leading slash, e.g. `src/App.tsx`
  return path.slice(getStoreUriPrefix(store).length).replace(/^\//, '')
}

export function initMonaco(store: Store) {
  if (store.monacoInitialized) return
  loadMonacoEnv(store)

  watchEffect(() => {
    // create a model for each file in the store
    for (const filename in store.files) {
      const file = store.files[filename]
      const uri = toMonacoUri(store, filename)
      if (editor.getModel(uri)) continue
      getOrCreateModel(uri, file.language, file.code)
    }

    // dispose of any models that are not in the store
    for (const model of editor.getModels()) {
      const uri = model.uri.toString()
      const fileName = fromMonacoPath(store, model.uri.path)
      if (store.files[fileName]) continue

      // type definitions fetched from the cdn, scoped by the instance prefix
      if (uri.startsWith('file:///node_modules')) continue
      if (fileName.startsWith('node_modules')) continue
      if (uri.startsWith('inmemory://')) continue

      model.dispose()
    }
  })

  store.monacoInitialized = true
}

export class WorkerHost {
  onFetchCdnFile(uri: string, text: string) {
    getOrCreateModel(Uri.parse(uri), undefined, text)
  }
}

let disposeVue: undefined | (() => void)
export async function reloadLanguageTools(store: Store) {
  disposeVue?.()

  let dependencies: Record<string, string> = {
    '@vue/runtime-vapor': '3.6.0-rc.7',
    '@vue/runtime-core': '3.6.0-rc.7',
    '@vue-jsx-vapor/runtime': '3.2.23',
    '@vue-jsx/runtime': '3.3.0-beta.1',
    ...store.dependencies,
  }

  if (store.typescriptVersion) {
    dependencies = {
      ...dependencies,
      typescript: store.typescriptVersion,
    }
  }

  const worker = editor.createWebWorker<WorkerLanguageService>({
    moduleId: 'vs/language/jsx/worker',
    label: 'tsx',
    host: new WorkerHost(),
    createData: {
      tsconfig: store.getTsConfig?.() || {},
      tsMacroConfig: (await store.getTsMacroConfig?.()) || '{}',
      dependencies,
      /** used by the worker to strip the per-instance URI prefix */
      uriPrefix: getStoreUriPrefix(store),
    } satisfies CreateData,
  })
  const languageId = ['vue', 'javascript', 'typescript']
  const getSyncUris = () =>
    Object.keys(store.files).map((filename) => toMonacoUri(store, filename))

  const { dispose: disposeMarkers } = volar.activateMarkers(
    worker,
    languageId,
    'vue',
    getSyncUris,
    editor,
  )
  const { dispose: disposeAutoInsertion } = volar.activateAutoInsertion(
    worker,
    languageId,
    getSyncUris,
    editor,
  )
  const { dispose: disposeProvides } = await volar.registerProviders(
    worker,
    languageId,
    getSyncUris,
    languages,
  )

  disposeVue = () => {
    disposeMarkers()
    disposeAutoInsertion()
    disposeProvides()
  }
}

export interface WorkerMessage {
  event: 'init'
  tsVersion: string
  tsLocale?: string
  tsMacroConfig: string
}

export function loadMonacoEnv(store: Store) {
  ;(self as any).MonacoEnvironment = {
    async getWorker(_: any, label: string) {
      if (label === 'tsx') {
        const worker = new Worker()
        // eslint-disable-next-line no-async-promise-executor
        const init = new Promise<void>(async (resolve) => {
          worker.addEventListener('message', (data) => {
            if (data.data === 'inited') {
              resolve()
            } else if (
              data.data?.filePath &&
              !store.activeFile.tsCompiledName
            ) {
              const file =
                store.files[fromMonacoPath(store, data.data.filePath)]
              if (file) {
                if (data.data.init) {
                  file.tsCompiledStack = []
                }
                if (file.compiled.ts !== data.data.code) {
                  file.tsCompiledStack.push({
                    code: data.data.code,
                    map: data.data.map,
                    name: data.data.prevName,
                    enforce: data.data.enforce,
                  })
                  file.compiled.ts = data.data.code
                }
              }
            }
          })
          worker.postMessage({
            event: 'init',
            tsVersion: store.typescriptVersion,
            tsLocale: store.locale,
            tsMacroConfig: await store.getTsMacroConfig?.(),
          } satisfies WorkerMessage)
        })
        await init
        return worker
      }
      return new editorWorker()
    },
  }
  languages.register({ id: 'javascript', extensions: ['.js'] })
  languages.register({ id: 'typescript', extensions: ['.ts'] })
  languages.register({ id: 'css', extensions: ['.css'] })
  languages.register({ id: 'html', extensions: ['.html'] })
  languages.setLanguageConfiguration('javascript', languageConfigs.js)
  languages.setLanguageConfiguration('typescript', languageConfigs.ts)
  languages.setLanguageConfiguration('css', languageConfigs.css)
  languages.setLanguageConfiguration('html', languageConfigs.html)

  let languageToolsPromise: Promise<void> | undefined
  store.reloadLanguageTools = debounce(async () => {
    ;(languageToolsPromise ||= reloadLanguageTools(store)).finally(() => {
      languageToolsPromise = undefined
    })
  }, 250)
  languages.onLanguage('javascript', () => store.reloadLanguageTools!())
  store.reloadLanguageTools!()

  // Support for go to definition
  editor.registerEditorOpener({
    openCodeEditor(_, resource) {
      const prefix = getStoreUriPrefix(store)
      if (
        resource.toString().startsWith('file:///node_modules') ||
        resource.path.startsWith(prefix + 'node_modules/')
      ) {
        return true
      }

      const path = resource.path
      if (path.startsWith(prefix)) {
        const fileName = fromMonacoPath(store, path)
        if (fileName !== store.activeFile.filename) {
          store.setActive(fileName)
          return true
        }
      }

      return false
    },
  })
}
