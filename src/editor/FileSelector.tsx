import type { WheelEvent } from 'vue-jsx'
import { injectKeyProps } from '../../src/types'
import {
  type ReplFile,
  appFile,
  configFileNames,
  indexHtmlFile,
  stripSrcPrefix,
  tsconfigFile,
} from '../store'

export default defineVaporComponent(
  (props: {
    files: Record<string, ReplFile>
    activeFile: ReplFile
    disabled?: boolean
  }) => {
    const { store, showVirtualFiles } = $inject(injectKeyProps)!

    /**
     * When `true`: indicates adding a new file
     * When `string`: indicates renaming a file, and holds the old filename in case
     * of cancel.
     */
    let pending = $ref<boolean | string>(false)
    /**
     * Text shown in the input box when editing a file's name
     * This is a display name so it should always strip off the `src/` prefix.
     */
    let pendingFilename = $ref('Comp.tsx')

    const files = $computed(() =>
      Object.entries(props.files)
        .filter(([_, file]) => (showVirtualFiles ? true : !file.hidden))
        .map(([name]) => name),
    )

    function startAddFile() {
      let i = 0
      let name = `Comp.tsx`

      while (true) {
        let hasConflict = false
        for (const filename in store.files) {
          if (stripSrcPrefix(filename) === name) {
            hasConflict = true
            name = `Comp${++i}.tsx`
            break
          }
        }
        if (!hasConflict) {
          break
        }
      }

      pendingFilename = name
      pending = true
    }

    function cancelNameFile() {
      pending = false
    }

    function focus(el: HTMLInputElement) {
      setTimeout(() => {
        el?.focus()
      })
    }

    function doneNameFile() {
      if (!pending) return
      if (!pendingFilename) {
        pending = false
        return
      }

      // add back the src prefix
      const filename =
        (configFileNames.includes(pendingFilename) ? '' : 'src/') +
        pendingFilename
      const oldFilename = pending === true ? '' : pending

      if (!/\.(vue|jsx?|tsx?|css|json)$/.test(filename)) {
        store.errors = [
          `Playground only supports *.vue, *.jsx?, *.tsx?, *.css, *.json files.`,
        ]
        return
      }

      if (filename !== oldFilename && filename in store.files) {
        store.errors = [`File "${filename}" already exists.`]
        return
      }

      store.errors = []
      cancelNameFile()

      if (filename === oldFilename) {
        return
      }

      if (oldFilename) {
        store.renameFile(oldFilename, filename)
      } else {
        store.addFile(filename)
      }
    }

    function editFileName(file: string) {
      pendingFilename = stripSrcPrefix(file)
      pending = file
    }

    let fileSelector = $useRef()
    function horizontalScroll(e: WheelEvent) {
      e.preventDefault()
      const direction =
        Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      const distance = 30 * (direction > 0 ? 1 : -1)
      fileSelector?.scrollTo({
        left: fileSelector.scrollLeft + distance,
      })
    }

    const isUpdated = $computed(
      () => (file: string) =>
        store.fileCaches[file] &&
        store.files[file].code !== store.fileCaches[file]
          ? '*'
          : '',
    )

    return (
      <div
        ref={(e) => (fileSelector = e)}
        class="file-selector"
        onWheel={horizontalScroll}
      >
        {/* TODO <template v-for={(file, i) in files} key={file}> */}
        <template v-for={(file, i) in files}>
          <div
            v-if={pending !== file}
            class={{
              file: true,
              active: props.activeFile.filename === file,
              'ml-auto': file === tsconfigFile,
            }}
            onClick={() => store.setActive(file)}
            onDblclick={() =>
              ![appFile + '', indexHtmlFile].includes(file) &&
              editFileName(file)
            }
          >
            <span class="label">{stripSrcPrefix(file)} </span>
            <span v-if={isUpdated(file)} class="pl-1!">
              {isUpdated(file)}
            </span>
            <span
              v-else-if={
                ![appFile + '', indexHtmlFile].includes(file) && !props.disabled
              }
              class="remove"
              onClick_stop={() => store.deleteFile(file)}
            >
              <svg class="icon" height="12" viewBox="0 0 24 24" width="12">
                <line stroke="#999" x1="18" x2="6" y1="6" y2="18" />
                <line stroke="#999" x1="6" x2="18" y1="6" y2="18" />
              </svg>
            </span>
          </div>
          <div
            v-if={
              (pending === true && i === files.length - 1) || pending === file
            }
            class={{ file: true, pending: true, active: pending === file }}
          >
            <span class="file pending">{pendingFilename}</span>
            <input
              ref={(el) => focus(el)}
              v-model={pendingFilename}
              spellcheck="false"
              onBlur={doneNameFile}
              onKeyup_enter={doneNameFile}
              onKeyup_esc={cancelNameFile}
            />
          </div>
        </template>
        <button v-if={!props.disabled} class="add" onClick={startAddFile}>
          +
        </button>
      </div>
    )
  },
)

defineStyle(`
  .file-selector {
    display: flex;
    box-sizing: border-box;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    background-color: var(--bg);
    overflow-y: hidden;
    overflow-x: auto;
    white-space: nowrap;
    position: relative;
    height: var(--header-height);
  }
  
  .file-selector::-webkit-scrollbar {
    height: 1px;
  }
  
  .file-selector::-webkit-scrollbar-track {
    background-color: var(--border);
  }
  
  .file-selector::-webkit-scrollbar-thumb {
    background-color: var(--color-branding);
  }
  
  .file {
    position: relative;
    display: inline-block;
    font-size: 13px;
    font-family: var(--font-code);
    cursor: pointer;
    color: var(--text-light);
    box-sizing: border-box;
  }
  .file.active {
    color: var(--color-branding);
    border-bottom: 3px solid var(--color-branding);
    cursor: text;
  }
  .file span {
    display: inline-block;
    padding: 8px 10px 6px;
    line-height: 20px;
  }
  .file.pending span {
    min-width: 50px;
    min-height: 34px;
    padding-right: 32px;
    background-color: rgba(200, 200, 200, 0.2);
    color: transparent;
  }
  .file.pending input {
    position: absolute;
    inset: 8px 7px auto;
    font-size: 13px;
    font-family: var(--font-code);
    line-height: 20px;
    outline: none;
    border: none;
    padding: 0 3px;
    min-width: 1px;
    color: inherit;
    background-color: transparent;
  }
  .file .remove {
    display: inline-block;
    vertical-align: middle;
    line-height: 12px;
    cursor: pointer;
    padding-left: 0;
  }
  .add {
    font-size: 18px;
    font-family: var(--font-code);
    color: #999;
    vertical-align: middle;
    margin-left: 6px;
    position: relative;
    top: -1px;
  }
  .add:hover {
    color: var(--color-branding);
  }
  .icon {
    margin-top: -1px;
  }
`)
