import SplitPane from './SplitPane'
import Output from './output/Output'
import type { Store } from './store'
import {
  type EditorComponentType,
  injectKeyPreviewRef,
  injectKeyProps,
} from './types'
import EditorContainer from './editor/EditorContainer'
import type * as monaco from 'monaco-editor-core'
import { useRouteQuery } from './utils'

import 'floating-vue/dist/style.css'
import './dropdown.css'
import { useFullProps } from 'vue-jsx-vapor'

export interface Props {
  previewTheme?: boolean
  editor: EditorComponentType
  store: Store
  autoResize?: boolean
  showCompileOutput?: boolean
  clearConsole?: boolean
  layout?: 'horizontal' | 'vertical'
  layoutReverse?: boolean
  ssr?: boolean
  previewOptions?: {
    headHTML?: string
    bodyHTML?: string
    placeholderHTML?: string
    customCode?: {
      importCode?: string
      useCode?: string
    }
    showRuntimeError?: boolean
    showRuntimeWarning?: boolean
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

export default defineVaporComponent(
  ({
    previewTheme = false,
    autoResize = true,
    showCompileOutput = true,
    clearConsole = false,
    layoutReverse = false,
    ssr = false,
    layout = 'horizontal',
    previewOptions = {},
    editorOptions = {},
    splitPaneOptions = {},
    ...props
  }: Props) => {
    const autoSave = useRouteQuery<boolean>('auto-save', false)
    const showVirtualFiles = useRouteQuery<boolean>('virtual-files', false)
    const showSourceMap = useRouteQuery<boolean>('source-map', false)

    if (!props.editor) {
      throw new Error('The "editor" prop is now required.')
    }

    let outputRef = $useRef()

    props.store.init()

    const editorSlotName = $computed(() => (layoutReverse ? 'right' : 'left'))
    const outputSlotName = $computed(() => (layoutReverse ? 'left' : 'right'))

    provide(injectKeyProps, {
      ...toRefs(useFullProps()),
      autoSave,
      showVirtualFiles,
      showSourceMap,
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
      <div class="vue-repl">
        <SplitPane layout={layout}>
          <template v-slot:$editorSlotName$>
            <EditorContainer editorComponent={props.editor} />
          </template>
          <template v-slot:$outputSlotName$>
            <Output
              ref={(e) => (outputRef = e)}
              editorComponent={props.editor}
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
  .vue-repl,
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
  .vue-repl {
    height: 100%;
    margin: 0;
    overflow: hidden;
    font-size: 13px;
    font-family:
      -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu,
      Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
    background-color: var(--bg-soft);
  }
  
  .dark .vue-repl,
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
  
  .vue-repl button {
    border: none;
    outline: none;
    cursor: pointer;
    margin: 0;
    background-color: transparent;
  }
`)
