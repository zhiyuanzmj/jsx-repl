import Preview from './Preview'
import Login from './user/Login'
import {
  type EditorComponentType,
  type OutputModes,
  injectKeyProps,
} from '../types'
import SplitPane from '../SplitPane'
import Devtools from './Devtools'
import Project from './user/Project'
import { useRef } from 'vue-jsx-vapor'
import { useDiff } from './diff'
import type { CompiledStack } from '../store'
import SourceMap from './SourceMap'

const CompiledSelect = defineVaporComponent(() => {
  const { store } = $inject(injectKeyProps)!
  const { activeFile, outputMode } = $(store)

  const nameKey = $computed(() =>
    outputMode === 'js' ? 'compiledName' : 'tsCompiledName',
  )
  const indexKey = $computed(() =>
    outputMode === 'js' ? 'compiledIndex' : 'tsCompiledIndex',
  )
  const stackKey = $computed(() =>
    outputMode === 'js' ? 'compiledStack' : 'tsCompiledStack',
  )

  const onChange = (value: number) => {
    activeFile[nameKey] =
      activeFile[stackKey][activeFile[indexKey] + value]?.name || ''
  }

  const compiledName = $computed({
    get() {
      return activeFile[nameKey]
    },
    set(value) {
      activeFile[nameKey] = value
    },
  })

  const compiledStack = $computed(() =>
    activeFile[stackKey].reduce(
      (result, compiled) => {
        result[compiled.enforce || 'default']?.push(compiled)
        return result
      },
      { pre: [], default: [], post: [] } as Record<string, CompiledStack[]>,
    ),
  )

  useDiff()

  return (
    <div class="mr-2 flex items-center gap-2">
      <button
        class={`i-carbon:previous-outline bg-$text! text-xl ${
          !activeFile[indexKey] ? 'opacity-50 pointer-events-none' : ''
        }`}
        onClick={() => onChange(-1)}
      />
      <button
        class={`i-carbon:next-outline bg-$text! text-xl ${!compiledName ? 'opacity-50 pointer-events-none' : ''}`}
        onClick={() => onChange(1)}
      />
      <select
        v-model={compiledName}
        class="b-(0 r-4 $border) bg-$border h-6 my-auto rounded outline-none px-1 text"
      >
        <template v-for={(list, label) in compiledStack}>
          <optgroup v-if={list.length} key={label} label={label}>
            <option v-for={compiled in list} key={compiled.name}>
              {compiled.name}
            </option>
          </optgroup>
        </template>
        <hr />
        <option value="">Diff Mode</option>
      </select>
    </div>
  )
})

export default defineVaporComponent(
  (props: {
    editorComponent: EditorComponentType
    showCompileOutput?: boolean
    ssr: boolean
  }) => {
    const { store, slim, layout } = $inject(injectKeyProps)!
    const { activeFile } = $(store)
    let previewRef = $useRef()
    const modes = $computed(() =>
      props.showCompileOutput
        ? (['js', 'ts', 'css', 'ast', 'sourcemap', 'devtools'] as const)
        : ([] as const),
    )

    let mode = $computed<OutputModes>({
      get: () =>
        (modes as readonly string[]).includes(store.outputMode)
          ? store.outputMode
          : 'js',
      set(value) {
        if ((modes as readonly string[]).includes(store.outputMode)) {
          store.outputMode = value
        }
      },
    })

    const compiledCode = $computed(() => {
      if (mode === 'js') {
        return activeFile.compiledName
          ? activeFile.compiledStack[activeFile.compiledIndex]?.code || ''
          : activeFile.compiled.js
      } else if (mode === 'ts') {
        return activeFile.tsCompiledName
          ? activeFile.tsCompiledStack[activeFile.tsCompiledIndex]?.code || ''
          : activeFile.compiled.ts
      } else if (mode === 'ast') {
        return activeFile.compiled.ast
      } else {
        return activeFile.compiled.css
      }
    })

    function jumpToGithub() {
      open('https://github.com/zhiyuanzmj/repl')
    }

    function reload() {
      previewRef?.reload()
    }

    defineExpose$({ reload, previewRef })

    const toggleDark = () => {
      store.theme = store.theme === 'dark' ? 'light' : 'dark'
    }

    let devtoolsLoaded = $ref(mode === 'devtools')

    return (
      <SplitPane inline={true} layout="vertical">
        <template v-slot:left>
          <div class="flex-1 h-full">
            <div
              class={['tab-buttons', layout === 'horizontal' && 'border-t-0!']}
            >
              <button class="active">
                <span>preview</span>
              </button>

              <div class="actions ml-auto flex items-center gap-2 pr-2">
                <Project v-if={!slim} />

                <button class="text-xl ml-1! i-carbon:renew" onClick={reload} />

                <button
                  v-if={!store.slim}
                  class={[
                    'text-xl',
                    store.theme === 'dark' ? 'i-carbon:moon' : 'i-carbon:light',
                  ]}
                  onClick={toggleDark}
                />

                <button
                  v-if={!store.slim}
                  class="i-carbon:logo-github text-2xl"
                  onClick={jumpToGithub}
                />

                <Login v-if={!slim} />
              </div>
            </div>
            <Preview
              v-if={!store.loading}
              ref={(e) => (previewRef = e)}
              ssr={props.ssr}
            />
            <div
              v-else
              class="i-carbon:rotate-180 text-gray h-full mt--4 w-10 m-auto animate-spin"
            />
          </div>
        </template>

        <template v-slot:right>
          <div class="flex h-full flex-1 flex-col overflow-hidden">
            <div class="tab-buttons">
              <button
                v-for={m in modes}
                key={m}
                class={{ active: mode === m, 'ml-auto!': m === 'sourcemap' }}
                onClick={() => {
                  mode = m
                  if (m === 'devtools') {
                    devtoolsLoaded = true
                  }
                }}
              >
                <span>{m}</span>
              </button>

              <CompiledSelect v-if={['js', 'ts'].includes(store.outputMode)} />
            </div>
            <Devtools
              v-if={devtoolsLoaded && previewRef?.container}
              previewContainer={previewRef.container}
              theme={store.theme}
              v-show={mode === 'devtools'}
            />
            <template v-if={mode === 'sourcemap'}>
              {/*TODO Can't use v-else-if */}
              <SourceMap />
            </template>
            <props.editorComponent
              v-else-if={mode === 'js'}
              ref={(e) => {
                store.outputEditor = e?.editor
              }}
              readonly
              filename={store.activeFile.filename + '?output'}
              mode={mode}
              value={compiledCode}
            />
            <props.editorComponent
              v-else-if={mode === 'ts'}
              ref={(e) => {
                store.outputEditor = e?.editor
              }}
              readonly
              filename={store.activeFile.filename + '?output'}
              mode={mode}
              value={compiledCode}
            />
            <props.editorComponent
              v-else-if={mode === 'css'}
              ref={(e) => {
                store.outputEditor = e?.editor
              }}
              readonly
              filename={store.activeFile.filename + '?output'}
              mode={mode}
              value={compiledCode}
            />
            <props.editorComponent
              v-else-if={mode === 'ast'}
              ref={(e) => {
                store.outputEditor = e?.editor
              }}
              readonly
              filename={store.activeFile.filename + '?output'}
              mode={mode}
              value={compiledCode}
            />
          </div>
        </template>
      </SplitPane>
    ) as JSX.Element

    defineStyle(`
      .tab-buttons {
        display: flex;
        box-sizing: border-box;
        border-top: 1px solid var(--border);
        border-bottom: 1px solid var(--border);
        background-color: var(--bg);
        min-height: var(--header-height);
        overflow: hidden;
      }
      
      .tab-buttons button {
        padding: 0;
        box-sizing: border-box;
      }
      
      .tab-buttons .actions button {
        background-color: currentColor;
      }
      
      .tab-buttons span {
        font-size: 13px;
        font-family: var(--font-code);
        text-transform: uppercase;
        color: var(--text-light);
        display: inline-block;
        padding: 8px 16px 6px;
        line-height: 20px;
      }
      
      button.active {
        color: var(--color-branding-dark);
        border-bottom: 3px solid var(--color-branding-dark);
      }
    `)
  },
  { props: ['editorComponent', 'showCompileOutput', 'ssr'] },
)
