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

  /**
   * Supabase project URL and anon key, for remote backup.
   *
   * The anon key is designed to be publishable — it carries no privileges of
   * its own, and access is decided by row-level security on the project. The
   * service_role key is the opposite: it bypasses every policy, so it must
   * never appear here or anywhere else the bundle can reach.
   */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Storage bucket for state dumps. Defaults to "bayan". */
  readonly VITE_SUPABASE_BUCKET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
