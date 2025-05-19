import Redis, { RedisOptions } from 'ioredis'

class RedisClient {
  private static instance: Redis | null = null

  private static options: RedisOptions = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
  }

  public static getInstance(): Redis {
    if (!RedisClient.instance) {
      RedisClient.instance = new Redis(RedisClient.options)

      RedisClient.instance.on('error', err => {
        console.error('Redis Client Error:', err)
      })

      RedisClient.instance.on('connect', () => {
        console.info('Redis Client Connected')
      })
    }

    return RedisClient.instance
  }
}

export default RedisClient
