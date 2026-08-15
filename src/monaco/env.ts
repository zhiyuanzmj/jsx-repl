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

export function initMonaco(store: Store) {
  if (store.monacoInitialized) return
  loadMonacoEnv(store)

  watchEffect(() => {
    // create a model for each file in the store
    for (const filename in store.files) {
      const file = store.files[filename]
      if (editor.getModel(Uri.parse(`file:///${filename}`))) continue
      getOrCreateModel(
        Uri.parse(`file:///${filename}`),
        file.language,
        file.code,
      )
    }

    // dispose of any models that are not in the store
    for (const model of editor.getModels()) {
      const uri = model.uri.toString()
      if (store.files[uri.substring('file:///'.length)]) continue

      if (uri.startsWith('file:///node_modules')) continue
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
    '@vue/runtime-vapor': '3.6.0-rc.3',
    '@vue/runtime-core': '3.6.0-rc.3',
    '@vue-jsx-vapor/runtime': '3.2.21',
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
    } satisfies CreateData,
  })
  const languageId = ['vue', 'javascript', 'typescript']
  const getSyncUris = () =>
    Object.keys(store.files).map((filename) => Uri.parse(`file:///${filename}`))

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
              const file = store.files[data.data.filePath.slice(1)]
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
      if (resource.toString().startsWith('file:///node_modules')) {
        return true
      }

      const path = resource.path
      if (/^\//.test(path)) {
        const fileName = path.replace('/', '')
        if (fileName !== store.activeFile.filename) {
          store.setActive(fileName)
          return true
        }
      }

      return false
    },
  })
}
