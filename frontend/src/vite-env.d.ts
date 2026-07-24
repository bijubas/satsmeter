/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL pública do backend (Railway) p/ o WebSocket em produção. Vazio = same-origin. */
  readonly VITE_WS_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
