import { createWebSocketCorsOptions } from './websocket-cors.config';

describe('websocket CORS config', () => {
  it('disables WebSocket CORS in production so Nginx owns cross-origin policy', () => {
    expect(createWebSocketCorsOptions('production', 'https://ledger.example.com')).toBe(false);
  });

  it('allows the configured web origin outside production', () => {
    expect(createWebSocketCorsOptions('development', 'https://dev.ledger.example.com')).toEqual({
      origin: 'https://dev.ledger.example.com',
    });
  });

  it('defaults to the local Angular dev server outside production', () => {
    expect(createWebSocketCorsOptions('test')).toEqual({
      origin: 'http://localhost:4200',
    });
  });
});
