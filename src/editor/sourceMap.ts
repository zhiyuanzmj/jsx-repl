import type { editor } from 'monaco-editor-core'
import { injectKeyProps } from '../types'
import { SourceMap } from '@volar/source-map'
import { type MappingItem, SourceMapConsumer } from 'source-map-js'
import remapping from '@ampproject/remapping'

export const useSourceMap = () => {
  const { store, showSourceMap } = $inject(injectKeyProps)!

  const { activeFile, editor, outputEditor, outputMode } = $(store)

  const map = $computed(() =>
    activeFile.maps.length
      ? new SourceMapConsumer(
          activeFile.compiledName
            ? activeFile.maps[activeFile.compiledIndex]
            : activeFile.maps.length === 1
              ? activeFile.maps[0]
              : (remapping(
                  activeFile.maps.slice().reverse(),
                  () => null,
                ) as any),
        )
      : null,
  )
  const tsMap = $computed(() =>
    activeFile.tsMaps.length &&
    (activeFile.tsCompiledIndex === 0 || !activeFile.tsCompiledName)
      ? new SourceMap(
          activeFile.tsMaps[
            activeFile.tsCompiledIndex === 0 ? 0 : activeFile.tsMaps.length - 1
          ],
        )
      : null,
  )

  const editorModel = $computed(() => editor?.getModel())
  const outputEditorModel = $computed(() => outputEditor?.getModel())

  function getMapping() {
    if (outputMode === 'js') {
      if (!map) return []
      const mappings: MappingItem[] = []
      map.eachMapping((mapping) => {
        if (mapping.name) {
          mappings.push(mapping)
        }
      })
      return mappings
    } else {
      if (!tsMap) return []
      return tsMap.mappings
        .map((i) => {
          const originPosition = editorModel?.getPositionAt(i.sourceOffsets[0])
          if (!originPosition) return null
          const name = editorModel?.getValueInRange({
            startLineNumber: originPosition.lineNumber,
            endLineNumber: originPosition.lineNumber,
            startColumn: originPosition.column,
            endColumn: originPosition.column + i.lengths[0],
          })
          if (!name) return null
          const generatedPosition = editorModel?.getPositionAt(
            i.generatedOffsets[0],
          )
          if (!generatedPosition) return null
          return {
            originalLine: originPosition.lineNumber,
            originalColumn: originPosition.column - 1,
            generatedLine: generatedPosition.lineNumber,
            generatedColumn: generatedPosition.column - 1,
            name,
          }
        })
        .filter((i) => !!i)
    }
  }

  function generatedPositionFor(params: {
    source: string
    column: number
    line: number
  }) {
    if (outputMode === 'js') {
      const result = map?.generatedPositionFor(params)
      if (result) {
        result.column++
        return result
      }
    } else {
      const offset = editorModel?.getOffsetAt({
        lineNumber: params.line,
        column: params.column + 1,
      })
      if (!offset || !tsMap) return null
      const location = [...tsMap.toGeneratedLocation(offset)][0]
      if (!location) return null
      const result = outputEditorModel?.getPositionAt(
        location[1].generatedOffsets[0],
      )
      if (result) {
        return {
          line: result.lineNumber,
          column: result.column,
        }
      }
    }
  }

  function originalPositionFor(params: { column: number; line: number }) {
    if (outputMode === 'js') {
      const result = map?.originalPositionFor(params)
      if (result) {
        result.column++
        return result
      }
    } else {
      const offset = outputEditorModel?.getOffsetAt({
        lineNumber: params.line,
        column: params.column + 1,
      })
      if (!offset || !tsMap) return null
      const location = [...tsMap!.toSourceLocation(offset)][0]
      if (!location) return null
      const result = editorModel?.getPositionAt(location[1].sourceOffsets[0])
      if (result) {
        const name =
          editorModel?.getValueInRange({
            startLineNumber: result.lineNumber,
            endLineNumber: result.lineNumber,
            startColumn: result.column,
            endColumn: result.column + location[1].lengths[0],
          }) || ''
        return {
          line: result.lineNumber,
          column: result.column,
          name,
          source: '',
        }
      }
    }
  }

  const sourceMapDecorations: editor.IEditorDecorationsCollection[] = []
  watch(
    () => [showSourceMap, outputMode === 'js' ? map : tsMap],
    async ([showSourceMap, map]) => {
      await new Promise((resolve) => setTimeout(resolve, 16))
      try {
        sourceMapDecorations.forEach((i) => i.clear())
      } catch (e) {
        console.error(e)
      }
      if (!showSourceMap || !map || !['js', 'ts'].includes(outputMode)) return
      const maps = getMapping()
      if (!maps.length) return
      sourceMapDecorations[0] = editor?.createDecorationsCollection(
        maps.map((mapping) => ({
          range: {
            startLineNumber: mapping.originalLine!,
            endLineNumber: mapping.originalLine!,
            startColumn: mapping.originalColumn! + 1,
            endColumn: mapping.originalColumn! + 1 + mapping.name!.length,
          },
          options: {
            className: `outline-(1px solid gray4)`,
          },
        })),
      )!
      sourceMapDecorations[1] = outputEditor?.createDecorationsCollection(
        maps.map((mapping) => ({
          range: {
            startLineNumber: mapping.generatedLine,
            startColumn: mapping.generatedColumn + 1,
            endColumn: mapping.generatedColumn + 1 + mapping.name!.length,
            endLineNumber: mapping.generatedLine,
          },
          options: {
            className: `outline-(1px solid gray4)`,
          },
        })),
      )!
    },
    { immediate: true },
  )

  onMounted(async () => {
    await nextTick()
    let decorations: editor.IEditorDecorationsCollection[] = []
    editor?.onDidBlurEditorText(() => {
      decorations.forEach((i) => i?.clear())
    })
    editor?.onDidChangeCursorPosition((e) => {
      if (!['js', 'ts'].includes(outputMode)) return
      const generated = generatedPositionFor({
        source: map?.sources[0] || '',
        column: e.position.column - 1,
        line: e.position.lineNumber,
      })
      decorations.forEach((i) => i?.clear())
      if (!generated?.line) return
      const origin = originalPositionFor(generated)
      if (!origin?.name) return
      outputEditor?.revealPositionNearTop({
        lineNumber: generated.line,
        column: generated.column,
      })
      decorations[0] = editor?.createDecorationsCollection([
        {
          range: {
            startLineNumber: origin.line,
            startColumn: origin.column,
            endLineNumber: origin.line,
            endColumn: origin.column + origin.name!.length,
          },
          options: {
            className: 'outline-(1px solid orange)',
          },
        },
      ])!
      decorations[1] = outputEditor?.createDecorationsCollection([
        {
          range: {
            startLineNumber: generated.line,
            endLineNumber: generated.line,
            startColumn:
              generated.column + e.position.column - origin.column - 1,
            endColumn: generated.column + e.position.column - origin.column,
          },
          options: {
            className: 'cursor',
          },
        },
        {
          range: {
            startLineNumber: generated.line,
            endLineNumber: generated.line,
            startColumn: generated.column,
            endColumn: generated.column + origin.name.length,
          },
          options: {
            className: 'outline-(1px solid orange)',
          },
        },
      ])!
    })

    let outputDecorations: editor.IEditorDecorationsCollection[] = []
    outputEditor?.onDidBlurEditorText(() => {
      outputDecorations.forEach((i) => i?.clear())
    })
    outputEditor?.onDidChangeCursorPosition((e) => {
      const origin = originalPositionFor({
        column: e.position.column - 1,
        line: e.position.lineNumber,
      })
      if (!origin?.name) return
      const generated = generatedPositionFor(origin)
      if (!generated?.line) return
      outputDecorations.forEach((i) => i?.clear())
      editor?.revealPositionNearTop({
        lineNumber: origin.line,
        column: origin.column,
      })
      outputDecorations[0] = outputEditor?.createDecorationsCollection([
        {
          range: {
            startLineNumber: generated.line,
            endLineNumber: generated.line,
            startColumn: generated.column,
            endColumn: generated.column + origin.name!.length,
          },
          options: {
            className: 'outline-(1px solid orange)',
          },
        },
      ])!
      outputDecorations[1] = editor?.createDecorationsCollection([
        {
          range: {
            startLineNumber: origin.line,
            endLineNumber: origin.line,
            startColumn:
              origin.column + e.position.column - generated.column - 1,
            endColumn: origin.column + e.position.column - generated.column,
          },
          options: {
            className: 'cursor',
          },
        },
        {
          range: {
            startLineNumber: origin.line,
            endLineNumber: origin.line,
            startColumn: origin.column,
            endColumn: origin.column + origin.name!.length,
          },
          options: {
            className: 'outline-(1px solid orange)',
          },
        },
      ])!
    })
  })
}
