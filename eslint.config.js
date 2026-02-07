import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import vueJsxVapor from '@vue-jsx-vapor/eslint'
// import reactivityFunction from 'unplugin-vue-reactivity-function/eslint'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules',
      './.vercel',
      './dist',
      '**/language-configs.ts',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.base,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        parser: '@typescript-eslint/parser',
      },
    },
  },
  {
    rules: {
      'no-debugger': 'error',
      'no-unreachable': 'off',
      'prefer-const': 'off',
      'no-console': ['error', { allow: ['warn', 'error', 'info', 'clear'] }],
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'sort-imports': ['error', { ignoreDeclarationSort: true }],
      'no-duplicate-imports': 'error',
      // This rule enforces the preference for using '@ts-expect-error' comments in TypeScript
      // code to indicate intentional type errors, improving code clarity and maintainability.
      '@typescript-eslint/prefer-ts-expect-error': 'error',
      // Enforce the use of 'import type' for importing types
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          fixStyle: 'inline-type-imports',
          disallowTypeAnnotations: false,
        },
      ],
      // Enforce the use of top-level import type qualifier when an import only has specifiers with inline type qualifiers
      '@typescript-eslint/no-import-type-side-effects': 'error',
    },
  },
  vueJsxVapor(),
  // reactivityFunction(),
)
