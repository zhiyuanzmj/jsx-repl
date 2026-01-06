import FileSelector from './FileSelector'
import Message from '../Message'
import { debounce, useRouteQuery } from '../utils'
import ToggleButton from './ToggleButton'
import { type EditorComponentType, injectKeyProps } from '../types'
import { type File, configFileNames } from '../store'
import SplitPane from '../SplitPane'
import Monaco from '../monaco/Monaco'
import { useSourceMap } from './sourceMap'

export default defineVaporComponent(
  (props: { editorComponent: EditorComponentType }) => {
    let { store, showVirtualFiles, showSourceMap, editorOptions } =
      $inject(injectKeyProps)!
    const { activeFile, activeConfigFile, outputMode } = $(store)
    let showMessage = $useRouteQuery('show-message', true)

    const onChange = debounce((code: string) => {
      activeFile.code = code
      store.updateProject()
    }, 250)

    const onConfigChange = debounce((code: string) => {
      activeConfigFile.code = code
      store.updateProject()
    }, 250)

    const resolvedFiles = computed(() => {
      const result = [{}, {}] as Record<string, File>[]
      for (const [name, file] of Object.entries(store.files)) {
        if (configFileNames.includes(name)) {
          result[1][name] = file
        } else {
          result[0][name] = file
        }
      }
      return result
    })

    useSourceMap()

    const code = $computed(() => {
      const nameKey = outputMode === 'js' ? 'compiledName' : 'tsCompiledName'
      const indexKey = outputMode === 'js' ? 'compiledIndex' : 'tsCompiledIndex'
      const stackKey = outputMode === 'js' ? 'compiledStack' : 'tsCompiledStack'

      return activeFile[nameKey] && activeFile[indexKey]
        ? activeFile[stackKey][activeFile[indexKey] - 1].code
        : activeFile.code
    })

    return (
      <div class="h-full">
        {/** TODO: use div instead of fragment to prevent HRM error */}
        <SplitPane layout="vertical">
          <template v-slot:left>
            <div class="editor-container">
              <FileSelector
                activeFile={activeFile}
                files={resolvedFiles.value[0]}
              />
              <Monaco
                ref={(e) => {
                  store.editor = e?.editor
                }}
                filename={activeFile.filename}
                readonly={
                  !!(outputMode === 'js'
                    ? activeFile.compiledName
                    : activeFile.tsCompiledName)
                }
                value={code}
                onChange={onChange}
              />
            </div>
          </template>
          <template v-slot:right>
            <div class="editor-container">
              <FileSelector
                disabled
                activeFile={activeConfigFile}
                files={resolvedFiles.value[1]}
              />
              <props.editorComponent
                filename={activeConfigFile.filename}
                value={activeConfigFile.code}
                onChange={onConfigChange}
              />
            </div>
          </template>
        </SplitPane>
        <Message err={store.errors[0]} v-show={showMessage} />
        <div class="editor-floating">
          <ToggleButton
            v-if={editorOptions?.sourceMapText !== false}
            v-model={showSourceMap}
            text={editorOptions?.sourceMapText || 'Source Map'}
          />
          <ToggleButton
            v-if={editorOptions?.virtualFilesText !== false}
            v-model={showVirtualFiles}
            text={editorOptions?.virtualFilesText || 'Virtual Files'}
          />
          <ToggleButton
            v-if={editorOptions?.showErrorText !== false}
            v-model={showMessage}
            text={editorOptions?.showErrorText || 'Show Error'}
          />
        </div>
      </div>
    )

    defineStyle(`
      .editor-container {
        height: 100%;
        overflow: hidden;
        position: relative;
      }
      
      .editor-floating {
        position: absolute;
        bottom: 16px;
        right: 16px;
        z-index: 11;
        display: flex;
        flex-direction: column;
        align-items: end;
        gap: 8px;
        background-color: var(--bg);
        color: var(--text-light);
        padding: 8px;
      }
    `)
  },
)

defineStyle(`
  .cursor {
    position: relative;
    display: inline-block;
    outline: none;
  }
  
  .cursor::after {
    content: "";
    outline: none;
    position: absolute;
    left: 100%;
    top: 0;
    width: 2px;
    height: 1.5em;
    background: oklch(87.2% 0.01 258.338);
    animation: blink 1s infinite;
  }
  
  @keyframes blink {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0;
    }
  }
`)
