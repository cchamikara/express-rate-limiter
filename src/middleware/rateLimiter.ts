import { Request, Response, NextFunction } from 'express'
import RedisClient from '../utils/redisClient'
import { RateLimitConfig, defaultRateLimits } from '../config/rateLimitConfig'

export interface RateLimiterOptions {
  keyPrefix?: string
  isAuthenticated?: (req: Request) => boolean
  customLimits?: {
    authenticated?: RateLimitConfig
    unauthenticated?: RateLimitConfig
    endpoints?: Record<string, RateLimitConfig>
  }
}

export const createRateLimiter = (options: RateLimiterOptions = {}) => {
  const redisClient = RedisClient.getInstance()

  const keyPrefix = options.keyPrefix || 'rl'
  const isAuthenticated = options.isAuthenticated || (() => false)

  const limits = {
    authenticated: options.customLimits?.authenticated || defaultRateLimits.authenticated,
    unauthenticated: options.customLimits?.unauthenticated || defaultRateLimits.unauthenticated,
    endpoints: { ...defaultRateLimits.endpoints, ...options.customLimits?.endpoints },
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress
      const endpoint = req.path
      const authenticated = isAuthenticated(req)

      let limitConfig: RateLimitConfig
      // check for endpoint-specific limits
      if (limits.endpoints[endpoint]) {
        limitConfig = limits.endpoints[endpoint]
      } else {
        limitConfig = authenticated ? limits.authenticated : limits.unauthenticated
      }

      const key = `${keyPrefix}${ip}:${endpoint}`
      const currentCount = await redisClient.get(key)
      const count = currentCount ? parseInt(currentCount) : 0

      if (count >= limitConfig.maxRequests) {
        return res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
        })
      }

      const newCount = await redisClient.incr(key)
      if (newCount === 1) {
        await redisClient.expire(key, limitConfig.windowSizeInSeconds)
      }

      next()
    } catch (error) {
      console.error('Rate limiter error:', error)
      next()
    }
  }
}
