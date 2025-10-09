import { HttpRequest, InvocationContext } from '@azure/functions';
import { vi } from 'vitest';

/**
 * Create mock authentication payload
 */
export function createMockAuth(userId: string = 'test-user-123') {
  return {
    sub: userId,
    iss: 'https://appleid.apple.com',
    aud: 'com.yourapp.service',
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    iat: Math.floor(Date.now() / 1000)
  };
}

/**
 * Create mock HTTP request for Azure Functions
 */
export function createMockRequest(
  method: string,
  url: string,
  options: {
    auth?: any;
    body?: any;
    params?: Record<string, string>;
    query?: Record<string, string>;
  } = {}
): HttpRequest {
  const { auth, body, params = {}, query = {} } = options;

  return {
    method,
    url,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === 'authorization' && auth) {
          return `Bearer mock-token-${auth.sub}`;
        }
        if (name.toLowerCase() === 'content-type') {
          return 'application/json';
        }
        return null;
      }
    } as any,
    query: {
      get: (name: string) => query[name] || null,
      has: (name: string) => name in query,
      getAll: (name: string) => query[name] ? [query[name]] : [],
      forEach: (callback: (value: string, key: string) => void) => {
        Object.entries(query).forEach(([key, value]) => callback(value, key));
      },
      entries: () => Object.entries(query)[Symbol.iterator](),
      keys: () => Object.keys(query)[Symbol.iterator](),
      values: () => Object.values(query)[Symbol.iterator](),
      [Symbol.iterator]: () => Object.entries(query)[Symbol.iterator]()
    },
    params,
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new ArrayBuffer(0),
    formData: async () => new FormData(),
    blob: async () => new Blob()
  } as HttpRequest;
}

/**
 * Create mock InvocationContext for Azure Functions
 */
export function createMockContext(): InvocationContext {
  return {
    invocationId: `test-invocation-${Date.now()}`,
    functionName: 'testFunction',
    extraInputs: {
      get: vi.fn(),
      set: vi.fn()
    },
    extraOutputs: {
      get: vi.fn(),
      set: vi.fn()
    },
    retryContext: null,
    traceContext: {
      traceparent: '',
      tracestate: '',
      attributes: {}
    },
    triggerMetadata: {},
    options: {
      trigger: {
        type: 'httpTrigger'
      }
    },
    log: vi.fn(),
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } as any;
}

/**
 * Mock authenticateRequest middleware
 */
export function mockAuthenticateRequest(userId: string = 'test-user-123') {
  return vi.fn().mockResolvedValue(createMockAuth(userId));
}
