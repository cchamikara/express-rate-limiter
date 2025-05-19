export interface RateLimitConfig {
  windowSizeInSeconds: number
  maxRequests: number
}

interface DefaultRateLimits {
  authenticated: RateLimitConfig
  unauthenticated: RateLimitConfig
  endpoints: Record<string, RateLimitConfig>
}

export const defaultRateLimits: DefaultRateLimits = {
  authenticated: {
    windowSizeInSeconds: 60 * 60, // 1h
    maxRequests: 200,
  },
  unauthenticated: {
    windowSizeInSeconds: 60 * 60, // 1h
    maxRequests: 100,
  },
  endpoints: {
    '/api/public': {
      windowSizeInSeconds: 60 * 60, // 1h
      maxRequests: 100,
    },
    '/api/auth': {
      windowSizeInSeconds: 60 * 60, // 1h
      maxRequests: 50,
    },
  },
}
