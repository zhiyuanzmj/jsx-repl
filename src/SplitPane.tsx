import { injectKeyPreviewRef, injectKeyProps } from './types'
import type { Props } from './Repl'

export default defineVaporComponent(
  (props: { layout?: Props['layout']; inline?: boolean }) => {
    const isVertical = $computed(() => props.layout === 'vertical')

    let containerRef = $useRef()
    const previewRef = $inject(injectKeyPreviewRef)!

    // mobile only
    const { store, splitPaneOptions, layout } = $inject(injectKeyProps)!

    let getOffset = () =>
      ((37.2 * (layout === 'vertical' ? 0 : 1)) /
        document.querySelector('.jsx-repl')!.clientHeight) *
      100
    const state = reactive({
      dragging: false,
      split: props.inline && store.slim ? 100 - getOffset() : 50,
      viewHeight: 0,
      viewWidth: 0,
    })

    const boundSplit = $computed(() => {
      const { split } = state
      const offset = getOffset()
      let rightOffset = 100 - offset
      return split < offset ? offset : split > rightOffset ? rightOffset : split
    })

    let startPosition = 0
    let startSplit = 0

    function dragStart(e: any) {
      state.dragging = true
      startPosition = isVertical ? e.pageY : e.pageX
      startSplit = boundSplit

      changeViewSize()
    }

    function dragMove(e: any) {
      if (containerRef && state.dragging) {
        const position = isVertical ? e.pageY : e.pageX
        const totalSize = isVertical
          ? containerRef.offsetHeight
          : containerRef.offsetWidth
        const dp = position - startPosition
        state.split = startSplit + +((dp / totalSize) * 100).toFixed(2)

        changeViewSize()
      }
    }

    function dragEnd() {
      state.dragging = false
    }

    function changeViewSize() {
      const el = previewRef
      if (!el) return
      state.viewHeight = el.offsetHeight
      state.viewWidth = el.offsetWidth
    }

    const slots = defineSlots({
      left: () => <div />,
      right: () => <div />,
    })

    return (
      <div
        ref={(e) => (containerRef = e)}
        class={[
          'split-pane',
          state.dragging && 'dragging',
          store.showOutput && 'show-output',
          isVertical && 'vertical',
          !isVertical && 'horizontal',
        ]}
        onMouseleave={dragEnd}
        onMousemove={dragMove}
        onMouseup={dragEnd}
        onTouchend={dragEnd}
        onTouchmove={dragMove}
      >
        <div
          class="left"
          style={{
            [isVertical ? 'height' : 'width']: boundSplit + '%',
          }}
        >
          <slots.left />
          <div
            class="dragger"
            onMousedown_prevent={dragStart}
            onTouchstart_prevent={dragStart}
          />
        </div>
        <div
          class="right"
          style={{
            [isVertical ? 'height' : 'width']: 100 - boundSplit + '%',
          }}
        >
          <div class="view-size" v-show={state.dragging}>
            {`${state.viewWidth}px x ${state.viewHeight}px`}
          </div>
          <slots.right />
        </div>

        <button
          class="toggler"
          onClick={() => (store.showOutput = !store.showOutput)}
        >
          {store.showOutput
            ? splitPaneOptions?.codeTogglerText || '< Code'
            : splitPaneOptions?.outputTogglerText || 'Output >'}
        </button>
      </div>
    )

    defineStyle(`
      .split-pane {
        display: flex;
        height: 100%;
        position: relative;
      }
      .split-pane.dragging {
        cursor: ew-resize;
      }
      .dragging .left,
      .dragging .right {
        pointer-events: none;
      }
      .left,
      .right {
        position: relative;
        height: 100%;
      }
      .view-size {
        position: absolute;
        top: 40px;
        left: 10px;
        font-size: 12px;
        color: var(--text-light);
        z-index: 100;
      }
      .left {
        border-right: 1px solid var(--border);
      }
      .dragger {
        position: absolute;
        z-index: 3;
        top: 0;
        bottom: 0;
        right: -5px;
        width: 10px;
        cursor: ew-resize;
      }
      .toggler {
        display: none;
        z-index: 3;
        font-family: var(--font-code);
        color: var(--text-light);
        position: absolute;
        left: 50%;
        bottom: 20px;
        margin-bottom: 5px;
        background-color: var(--border);
        padding: 8px 12px;
        border-radius: 8px;
        transform: translateX(-50%);
        box-shadow: 0 3px 8px rgba(0, 0, 0, 0.25);
      }
      
      .dark .toggler {
        background-color: var(--border);
      }
      
      /* vertical */
      .split-pane.vertical {
        display: block;
      }
      
      .split-pane.vertical.dragging {
        cursor: ns-resize;
      }
      
      .vertical .dragger {
        top: auto;
        height: 10px;
        width: 100%;
        left: 0;
        right: 0;
        bottom: -5px;
        cursor: ns-resize;
      }
      
      .vertical .left,
      .vertical .right {
        width: 100%;
      }
      .vertical .left {
        border-right: none;
      }
      /* mobile */
      @media (max-width: 720px) {
        .horizontal > .left,
        .horizontal > .right {
          position: absolute;
          inset: 0;
          width: auto !important;
          height: auto !important;
        }
        .horizontal > .dragger {
          display: none;
        }
      
        .split-pane.horizontal > .toggler {
          display: block;
        }
        .split-pane.horizontal > .right {
          z-index: -1;
          pointer-events: none;
        }
        .split-pane.horizontal > .left {
          z-index: 0;
          pointer-events: all;
        }
        .split-pane.show-output.horizontal > .right {
          z-index: 0;
          pointer-events: all;
        }
        .split-pane.show-output.horizontal > .left {
          z-index: -1;
          pointer-events: none;
        }
      }
    `)
  },
)
