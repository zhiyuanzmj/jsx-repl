# jsx-repl

Supports Vite plugins and Volar plugins.

## Setup

```ts
// vite.config.ts
import { defineConfig } from 'vite'
export default defineConfig({
  optimizeDeps: {
    exclude: ['jsx-repl'],
  },
  // ...
})
```

## Usage

```jsx
// src/App.jsx
import { Repl } from 'jsx-repl'

export default () => <Repl />
```
