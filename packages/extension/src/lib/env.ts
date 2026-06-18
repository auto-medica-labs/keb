/** Build-time constants inlined by Vite. */

/** The base bridge URL for hosted mode. The WS client appends `/ws` automatically.
 *  Override via VITE_HOSTED_BRIDGE_URL env var at build/dev time
 *  (e.g. VITE_HOSTED_BRIDGE_URL=ws://127.0.0.1:9876 pnpm dev).
 *  Falls back to the production Keb hosted server. */
export const HOSTED_BRIDGE_URL: string =
  import.meta.env.VITE_HOSTED_BRIDGE_URL || "wss://api.mdevd.co/keb/v1";
