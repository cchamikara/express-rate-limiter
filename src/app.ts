import express, { Request, Response, NextFunction } from 'express'
import RedisClient from './utils/redisClient'

const app = express()
app.use(express.json())

app.get('/api/public', (req: Request, res: Response) => {
  res.json({
    message: 'This is a public API endpoint',
  })
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

export default app
