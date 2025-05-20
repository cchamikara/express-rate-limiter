import { Request, Response, NextFunction } from 'express'
import { createRateLimiter } from '../../middleware/rateLimiter'
import RedisClient from '../../utils/redisClient'
import { RateLimitConfig } from '../../config/rateLimitConfig'

jest.mock('../../utils/redisClient', () => {
  const mockRedis = {
    get: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
  }

  return {
    getInstance: jest.fn(() => mockRedis),
  }
})

describe('Rate Limiter Middleware', () => {
  let req: Partial<Request>
  let res: Partial<Response>
  let next: NextFunction
  let mockRedis: any
  let originalDateNow: () => number
  let mockNow: number

  beforeEach(() => {
    jest.clearAllMocks()

    originalDateNow = Date.now
    mockNow = 1653062400000 // May 20, 2022
    Date.now = jest.fn(() => mockNow)

    req = {
      path: '/test',
      headers: { 'x-forwarded-for': '192.168.1.1' },
    }

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }

    next = jest.fn()

    mockRedis = RedisClient.getInstance()
  })

  afterEach(() => {
    // Restore the original Date.now
    Date.now = originalDateNow
  })

  it('should block requests over rate limits', async () => {
    mockRedis.get.mockResolvedValue('100')

    const apiRateLimiter = createRateLimiter()
    await apiRateLimiter(req as Request, res as Response, next)

    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded',
    })
  })

  it('should apply different limits for authenticated users', async () => {
    const isAuthenticated = jest.fn().mockReturnValue(true)
    const middleware = createRateLimiter({ isAuthenticated })

    // This would be over unauthenticated limit but under authenticated limit
    mockRedis.get.mockResolvedValue('150')
    mockRedis.incr.mockResolvedValue(151)

    await middleware(req as Request, res as Response, next)

    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('should apply endpoint-specific limits', async () => {
    const authReq = {
      ...req,
      path: '/api/auth',
    }

    const middleware = createRateLimiter()

    // Just under the endpoint-specific limit of 50
    mockRedis.get.mockResolvedValue('49')
    mockRedis.incr.mockResolvedValue(50)

    await middleware(authReq as Request, res as Response, next)

    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('should apply custom rate limits', async () => {
    const middleware = createRateLimiter({
      customLimits: {
        unauthenticated: {
          windowSizeInSeconds: 30,
          maxRequests: 5,
        },
      },
    })

    mockRedis.get.mockResolvedValue('6')

    await middleware(req as Request, res as Response, next)

    expect(res.status).toHaveBeenCalledWith(429)
  })

  describe('Rate Limiter Overrides', () => {
    const overrides = [
      {
        startTime: mockNow - 1000, // Started 1 second ago
        endTime: mockNow + 3600000, // Ends in 1 hour
        limitConfig: {
          windowSizeInSeconds: 60,
          maxRequests: 1000,
        },
        endpoints: ['/auth'],
        criteria: (req: Request) => req.headers['x-user'] === 'jaycar',
      },
    ]

    it('should apply active time-based overrides', async () => {
      const authReq = {
        ...req,
        path: '/auth',
        headers: {
          'x-forwarded-for': '192.168.1.1',
          'x-user': 'jaycar',
        },
      }

      const middleware = createRateLimiter({
        overrides,
      })

      mockRedis.get.mockResolvedValue('500')
      mockRedis.incr.mockResolvedValue(501)

      await middleware(authReq as Request, res as Response, next)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it('should not apply overrides when outside time window', async () => {
      const authReq = {
        ...req,
        path: '/auth',
        headers: {
          'x-forwarded-for': '192.168.1.1',
          'x-user': 'jaycar',
        },
      }

      const pastOverrides = overrides
      pastOverrides[0].endTime = mockNow - 1000 // Ended 1 second ago

      const middleware = createRateLimiter({
        overrides: pastOverrides,
      })

      mockRedis.get.mockResolvedValue('150')

      await middleware(authReq as Request, res as Response, next)

      expect(res.status).toHaveBeenCalledWith(429)
      expect(next).not.toHaveBeenCalled()
    })
  })
})
