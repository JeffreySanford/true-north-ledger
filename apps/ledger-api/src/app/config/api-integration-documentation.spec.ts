import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function workspacePath(...segments: string[]): string {
  const fromCwd = join(process.cwd(), ...segments);
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  return resolve(process.cwd(), '..', '..', ...segments);
}

describe('API integration documentation', () => {
  const guide = readFileSync(
    workspacePath('documentation', 'platform', 'api-integration-guide.md'),
    'utf8',
  );
  const troubleshooting = readFileSync(
    workspacePath('documentation', 'platform', 'api-troubleshooting.md'),
    'utf8',
  );

  it('documents auth flows, bearer tokens, request examples, and response examples', () => {
    expect(guide).toContain('## Authentication Flow');
    expect(guide).toContain('## Authentication Documentation');
    expect(guide).toContain('Authorization: Bearer <accessToken>');
    expect(guide).toContain('X-Device-Key');
    expect(guide).toContain('POST /api/v1/auth/refresh');
    expect(guide).toContain('POST /api/v1/auth/logout');
    expect(guide).toContain('## Bearer Token Example');
    expect(guide).toContain('POST /api/v1/auth/login');
    expect(guide).toContain('POST /api/v1/device-events');
    expect(guide).toContain('"accessToken": "<jwt>"');
    expect(guide).toContain('"eventId"');
  });

  it('documents error examples, rate limiting, and curl Python Node.js snippets', () => {
    for (const expected of [
      '"statusCode": 400',
      '"statusCode": 401',
      '"statusCode": 403',
      '"statusCode": 429',
      'RATE_LIMIT_EXCEEDED',
      '### curl',
      '### Python',
      '### Node.js',
    ]) {
      expect(guide).toContain(expected);
    }
  });

  it('documents API troubleshooting paths for common status codes', () => {
    for (const expected of [
      '## 400 Bad Request',
      '## 401 Unauthorized',
      '## 403 Forbidden',
      '## 404 Not Found',
      '## 409 Conflict',
      '## 429 Rate Limit Exceeded',
      '## 5xx Server Errors',
      '/api/health',
      '/api/ready',
      '/api/metrics',
    ]) {
      expect(troubleshooting).toContain(expected);
    }
  });
});
