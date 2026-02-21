/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module '*.vert?raw' {
  const src: string
  export default src
}

declare module '*.frag?raw' {
  const src: string
  export default src
}