/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Build-time constant — override to point hosted mode at a different server.
   *  Example: VITE_HOSTED_BRIDGE_URL=ws://127.0.0.1:1234 pnpm dev */
  readonly VITE_HOSTED_BRIDGE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
