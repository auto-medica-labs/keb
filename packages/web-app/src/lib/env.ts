/** Build-time constants inlined by Vite. */

/** The base bridge URL for hosted mode. The WS client appends `/ws` automatically.
 *  Override via VITE_HOSTED_BRIDGE_URL env var at build/dev time.
 *  Falls back to the production Keb hosted server. */
export const HOSTED_BRIDGE_URL: string =
  import.meta.env.VITE_HOSTED_BRIDGE_URL || "wss://api.mdevd.co/keb/v1";
