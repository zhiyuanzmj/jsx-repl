import Message from '../Message'
import type { WatchStopHandle } from 'vue'
import srcdoc from './srcdoc.html?raw'
import { PreviewProxy } from './PreviewProxy'
import { compileModulesForPreview } from './moduleCompiler'
import { injectKeyProps } from '../../src/types'
import { useRef } from 'vue-jsx-vapor'
import { debounce } from 'perfect-debounce'

export default defineVaporComponent(({ ssr = false }) => {
  const { store, clearConsole, previewTheme, previewOptions } =
    $inject(injectKeyProps)!

  let containerRef = $useRef()
  let runtimeError = $ref<string>()
  let runtimeWarning = $ref<string>()

  let sandbox: HTMLIFrameElement
  let proxy: PreviewProxy
  let stopUpdateWatcher: WatchStopHandle | undefined

  // create sandbox on mount
  onMounted(createSandbox)

  // reset sandbox when import map changes
  watch(
    () => store.importMap,
    () => {
      try {
        createSandbox()
      } catch (e: any) {
        store.errors = [e as Error]
        return
      }
    },
  )

  function switchPreviewTheme() {
    if (!previewTheme) return

    const html = sandbox.contentDocument?.documentElement
    if (html) {
      html.className = store.theme
    } else {
      // re-create sandbox
      createSandbox()
    }
  }

  // reset theme
  watch(() => [store.theme, previewTheme], switchPreviewTheme)

  onUnmounted(() => {
    proxy.destroy()
    stopUpdateWatcher && stopUpdateWatcher()
  })

  function createSandbox() {
    if (sandbox) {
      // clear prev sandbox
      proxy.destroy()
      stopUpdateWatcher && stopUpdateWatcher()
      containerRef?.removeChild(sandbox)
    }

    sandbox = document.createElement('iframe')
    sandbox.setAttribute(
      'sandbox',
      [
        'allow-forms',
        'allow-modals',
        'allow-pointer-lock',
        'allow-popups',
        'allow-same-origin',
        'allow-scripts',
        'allow-top-navigation-by-user-activation',
      ].join(' '),
    )

    const importMap = store.importMap
    const sandboxSrc = srcdoc
      .replace(/<html>/, `<html class="${previewTheme ? store.theme : ''}">`)
      .replace(/<!--IMPORT_MAP-->/, JSON.stringify(importMap))
      .replace(
        /<!-- PREVIEW-OPTIONS-HEAD-HTML -->/,
        previewOptions?.headHTML || '',
      )
      .replace(
        /<!--PREVIEW-OPTIONS-PLACEHOLDER-HTML-->/,
        previewOptions?.placeholderHTML || '',
      )
    const isIosWx = /MicroMessenger/.test(navigator.userAgent)
    containerRef?.appendChild(sandbox)
    if (isIosWx) {
      sandbox?.contentWindow?.document.write(
        '由于微信浏览器的限制，不支持 iframe 沙箱模式，请使用默认浏览器打开。',
      )
    } else {
      sandbox.src = URL.createObjectURL(
        new Blob([sandboxSrc], { type: 'text/html' }),
      )
    }

    proxy = new PreviewProxy(sandbox, {
      on_fetch_progress: (progress: any) => {
        // pending_imports = progress;
      },
      on_error: (event: any) => {
        const msg =
          event.value instanceof Error ? event.value.message : event.value
        if (
          msg.includes('Failed to resolve module specifier') ||
          msg.includes('Error resolving module specifier')
        ) {
          runtimeError =
            msg.replace(/\. Relative references must.*$/, '') +
            `.\nTip: edit the "Import Map" tab to specify import paths for dependencies.`
        } else {
          runtimeError = event.value
        }
      },
      on_unhandled_rejection: (event: any) => {
        let error = event.value
        if (typeof error === 'string') {
          error = { message: error }
        }
        runtimeError = 'Uncaught (in promise): ' + error.message
      },
      on_console: (log: any) => {
        if (log.duplicate) {
          return
        }
        if (log.level === 'error') {
          if (log.args[0] instanceof Error) {
            runtimeError = log.args[0].message
          } else {
            runtimeError = log.args[0]
          }
        } else if (log.level === 'warn') {
          if (log.args[0].toString().includes('[Vue warn]')) {
            runtimeWarning = log.args
              .join('')
              .replace(/\[Vue warn\]:/, '')
              .trim()
          }
        }
      },
      on_console_group: (action: any) => {
        // group_logs(action.label, false);
      },
      on_console_group_end: () => {
        // ungroup_logs();
      },
      on_console_group_collapsed: (action: any) => {
        // group_logs(action.label, true);
      },
    })

    sandbox.addEventListener('load', () => {
      proxy.handle_links()
      stopUpdateWatcher = watch(
        [
          () =>
            Object.values(store.files).map((file) => [
              file.code,
              file.filename,
            ]),
          () => store.importMap,
        ],
        debounce(updatePreview, 16, {
          leading: false,
          trailing: false,
        }),
        { deep: true, immediate: true },
      )
      switchPreviewTheme()
    })
  }

  async function updatePreview() {
    if (import.meta.env.PROD && clearConsole) {
      console.clear()
    }
    runtimeError = undefined
    runtimeWarning = undefined

    try {
      // compile code to simulated module system
      const modules = compileModulesForPreview(store)
      console.info(
        `[jsx-repl] successfully compiled ${modules.length} module${
          modules.length > 1 ? `s` : ``
        }.`,
      )

      const codeToEval = [
        `window.__modules__ = {};window.__css__ = [];` +
          `if (window.__app__) window.__app__.unmount();`,
        ...modules,
        `document.querySelectorAll('style[css]').forEach(el => el.remove())
        document.head.insertAdjacentHTML('beforeend', window.__css__.map(s => \`<style css>\${s}</style>\`).join('\\n'))`,
      ]

      // eval code in sandbox
      await proxy.eval(codeToEval)
    } catch (e: any) {
      console.error(e)
      runtimeError = (e as Error).message
    }
  }

  /**
   * Reload the preview iframe
   */
  function reload() {
    sandbox.contentWindow?.location.reload()
  }

  watch(
    () => runtimeError,
    () => {
      if (runtimeError) {
        reload()
      }
    },
    { once: true },
  )

  defineExpose$({ reload, container: containerRef })

  return (
    <>
      <div
        ref={(e) => (containerRef = e)}
        class={['iframe-container', { [store.theme]: previewTheme }]}
      />
      <Message
        err={(previewOptions?.showRuntimeError ?? true) && runtimeError}
      />
    </>
  )

  defineStyle(`
    .iframe-container,
    .iframe-container :deep(iframe) {
      width: 100%;
      height: 100%;
      border: none;
      background-color: #fff;
    }
    
    .iframe-container {
      height: calc(100% - 38px);
    }
    
    .iframe-container.dark :deep(iframe) {
      background-color: #1e1e1e;
    }
  `)
})
