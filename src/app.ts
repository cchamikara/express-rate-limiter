import express, { Request, Response } from 'express'
import { createRateLimiter } from './middleware/rateLimiter'

const app = express()
app.use(express.json())

const isAuthenticated = (req: Request): boolean => {
  // In a real-world app, this would check for a valid session, JWT token, etc.
  const apiKey = req.headers['x-api-key']
  return apiKey === 'secret-api-key'
}

const apiRateLimiter = createRateLimiter({
  keyPrefix: 'rl:',
  isAuthenticated,
  customLimits: {
    authenticated: {
      windowSizeInSeconds: 60 * 60, // 1 hour
      maxRequests: 200,
    },
    unauthenticated: {
      windowSizeInSeconds: 60 * 60, // 1 hour
      maxRequests: 100,
    },
  },
  overrides: [
    {
      startTime: Date.now(),
      endTime: Date.now() + 7 * 24 * 60 * 60 * 1000, // week from now
      limitConfig: {
        windowSizeInSeconds: 60 * 60,
        maxRequests: 1000,
      },
      criteria: (req: Request) => req.headers['x-user'] === 'jaycar',
      endpoints: ['/auth'],
    },
  ],
})

app.use('/api', apiRateLimiter)

app.get('/api/public', (req: Request, res: Response) => {
  res.json({
    message: 'This is a public API endpoint',
    authenticated: isAuthenticated(req),
  })
})

app.get('/api/auth', (req: Request, res: Response) => {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  res.json({ message: 'This is a protected API endpoint' })
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

export default app
