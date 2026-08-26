import SplitPane from './SplitPane'
import Output from './output/Output'
import { type Store, useStore } from './store'
import {
  type EditorComponentType,
  injectKeyPreviewRef,
  injectKeyProps,
} from './types'
import EditorContainer from './editor/EditorContainer'
import type * as monaco from 'monaco-editor-core'
import { useDark, useRouteQuery } from './utils'

import 'floating-vue/dist/style.css'
import './dropdown.css'
import { useFullProps } from 'vue-jsx'
import Monaco from './monaco/Monaco'

export interface Props {
  previewTheme?: boolean
  editor?: EditorComponentType
  autoResize?: boolean
  autoSave?: boolean
  showCompileOutput?: boolean
  clearConsole?: boolean
  store?: Store
  layout?: 'horizontal' | 'vertical'
  slim?: boolean
  ssr?: boolean
  theme?: 'dark' | 'light'
  previewOptions?: {
    headHTML?: string
    bodyHTML?: string
    placeholderHTML?: string
    customCode?: {
      importCode?: string
      useCode?: string
    }
    showRuntimeError?: boolean
  }
  editorOptions?: {
    showErrorText?: string | false
    virtualFilesText?: string | false
    sourceMapText?: string | false
    autoSaveText?: string | false
    monacoOptions?: monaco.editor.IStandaloneEditorConstructionOptions
  }
  splitPaneOptions?: {
    codeTogglerText?: string
    outputTogglerText?: string
  }
}

export const Repl = defineVaporComponent(
  ({
    previewTheme = false,
    autoResize = true,
    showCompileOutput = true,
    clearConsole = false,
    ssr = false,
    autoSave = false,
    layout = 'horizontal',
    previewOptions = {},
    editorOptions = {},
    splitPaneOptions = {},
    editor = Monaco,
    slim = false,
    theme,
  }: Props) => {
    const preset = defineModel<string>({ default: 'vue-jsx' })!
    let store = useStore({ slim: ref(slim), preset, theme: useDark(theme) })

    const autoSaveRef = useRouteQuery<boolean>('auto-save', autoSave)
    const showVirtualFiles = useRouteQuery<boolean>('virtual-files', false)
    const showSourceMap = useRouteQuery<boolean>('source-map', false)

    let outputRef = $useRef()

    provide(injectKeyProps, {
      ...toRefs(useFullProps()),
      autoSave: autoSaveRef,
      showVirtualFiles,
      showSourceMap,
      store,
    } as any)
    provide(
      injectKeyPreviewRef,
      computed(() => outputRef?.previewRef?.container ?? null),
    )

    /**
     * Reload the preview iframe
     */
    function reload() {
      outputRef?.reload()
    }

    defineExpose({ reload })

    return (
      <div class="jsx-repl">
        <div
          v-if={store.loading}
          class="i-carbon:rotate-180 text h-10 w-10 relative top-45% m-auto animate-spin"
        />
        <SplitPane v-else layout={layout}>
          <template v-slot:left>
            <EditorContainer editorComponent={editor} />
          </template>
          <template v-slot:right>
            <Output
              ref={(e) => (outputRef = e)}
              editorComponent={editor}
              showCompileOutput={showCompileOutput}
              ssr={!!ssr}
            />
          </template>
        </SplitPane>
      </div>
    )
  },
)

defineStyle(`
  .jsx-repl,
  .v-popper__popper {
    --bg: #fff;
    --bg-soft: #f8f8f8;
    --border: #ddd;
    --text: #000;
    --text-light: #888;
    --font-code: Menlo, Monaco, Consolas, "Courier New", monospace;
    --color-branding: #42b883;
    --color-branding-dark: #416f9c;
    --header-height: 38px;
  }
  .jsx-repl {
    height: 100%;
    margin: 0;
    overflow: hidden;
    font-size: 13px;
    font-family:
      -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu,
      Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
    background-color: var(--bg-soft);
  }
  
  .dark .jsx-repl,
  .v-popper__popper {
    --bg: #1a1a1a;
    --bg-soft: #282828;
    --border: #383838;
    --text: #fff;
    --text-light: #aaa;
    --color-branding: #42d392;
    --color-branding-dark: #89ddff;
  }
  
  html.dark {
    color-scheme: dark;
  }
  
  .jsx-repl button {
    border: none;
    outline: none;
    cursor: pointer;
    margin: 0;
    background-color: transparent;
  }
`)
