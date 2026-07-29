/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Optional build-time API key, for hosted test builds only.
   *
   * Vite inlines this into the bundle, so it is readable by anyone who can
   * fetch the built assets — set it only on a deployment with access control,
   * and never on a public one. Absent in native builds and in local dev, where
   * the key comes from Settings instead (REQ-P4).
   */
  readonly VITE_ANTHROPIC_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
