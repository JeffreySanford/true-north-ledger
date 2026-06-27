export type WebSocketCorsOptions = false | { origin: string };

export function createWebSocketCorsOptions(
  nodeEnv = process.env.NODE_ENV ?? 'development',
  corsOrigin = process.env.CORS_ORIGIN,
): WebSocketCorsOptions {
  if (nodeEnv === 'production') {
    return false;
  }

  return { origin: corsOrigin ?? 'http://localhost:4200' };
}
