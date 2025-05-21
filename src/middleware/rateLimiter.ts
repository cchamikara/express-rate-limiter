import { Request, Response, NextFunction } from 'express'
import RedisClient from '../utils/redisClient'
import { RateLimitConfig, defaultRateLimits } from '../config/rateLimitConfig'

interface RateLimitOverride {
  startTime: number
  endTime: number
  limitConfig: RateLimitConfig
  endpoints?: string[]
  criteria?: (req: Request) => boolean
}

export interface RateLimiterOptions {
  keyPrefix?: string
  isAuthenticated?: (req: Request) => boolean
  algorithm?: 'sliding_log'
  customLimits?: {
    authenticated?: RateLimitConfig
    unauthenticated?: RateLimitConfig
    endpoints?: Record<string, RateLimitConfig>
  }
  overrides?: RateLimitOverride[]
}

const getActiveOverrides = (req: Request, options: RateLimiterOptions, endpoint: string) => {
  if (!options.overrides) {
    return []
  }
  const now = Date.now()

  return options.overrides.filter(override => {
    if (override.startTime > now || override.endTime < now) {
      return false
    }

    if (override.endpoints && override.endpoints.length > 0) {
      if (!override.endpoints.includes(endpoint)) {
        return false
      }
    }

    if (override.criteria) {
      const result = override.criteria(req)
      if (!result) {
        return false
      }
    }

    return true
  })
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
      const activeOverrides = getActiveOverrides(req, options, endpoint)

      // Check for overrides
      if (activeOverrides.length > 0) {
        activeOverrides.sort((a, b) => b.startTime - a.startTime)
        limitConfig = activeOverrides[0].limitConfig
      }
      // check for endpoint-specific limits
      else if (limits.endpoints[endpoint]) {
        limitConfig = limits.endpoints[endpoint]
      } else {
        limitConfig = authenticated ? limits.authenticated : limits.unauthenticated
      }

      const key = `${keyPrefix}${ip}:${endpoint}`

      if (options.algorithm === 'sliding_log') {
        // 1.Keep a log of request timestamps.
        // 2.When a new request comes in, remove all entries older than the window size.
        // 3.Count the remaining entries.
        // 4.If the count is less than the limit, allow the request and add its timestamp to the log.
        // 5.If the count exceeds the limit, request is denied.

        const data = await redisClient.get(key)
        let timestamps: number[] = data ? JSON.parse(data) : []

        const now = Date.now()
        const windowStartTime = now - limitConfig.windowSizeInSeconds * 1000
        // Filter out timestamps that are outside the current window
        timestamps = timestamps.filter(ts => ts > windowStartTime)

        if (timestamps.length > limitConfig.maxRequests) {
          return res.status(429).json({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded',
          })
        }

        timestamps.push(now)
        await redisClient.set(key, JSON.stringify(timestamps))
        await redisClient.expire(key, limitConfig.windowSizeInSeconds)
      } else {
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
      }

      next()
    } catch (error) {
      console.error('Rate limiter error:', error)
      next()
    }
  }
}
