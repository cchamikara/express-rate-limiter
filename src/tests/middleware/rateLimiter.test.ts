import { Request, Response, NextFunction } from 'express'
import { createRateLimiter } from '../../middleware/rateLimiter'
import RedisClient from '../../utils/redisClient'

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

  beforeEach(() => {
    jest.clearAllMocks()

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
})
