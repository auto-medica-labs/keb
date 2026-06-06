/**
 * Extend the ws WebSocket type with Keb's internal tracking properties
 * used by bridge-server.js for the /api/status endpoint.
 */
export {};

declare module "ws" {
  interface WebSocket {
    _authenticatedUser?: string | null;
    _connectedAt?: number;
  }
}
