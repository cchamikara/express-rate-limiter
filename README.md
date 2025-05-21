# ExpressJS Rate Limiter

A TypeScript middleware for Express.js applications that enforces rate limiting on API requests

## Prerequisites

- NVM
- Redis server
- TypeScript

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/cchamikara/express-rate-limiter
   cd express-rate-limiter
   ```
2. Set NodeJS version
   ```
   nvm use
   ```

3. Install dependencies:
   ```
   npm install
   ```

4. Configure Redis connection:
   ```
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=
   REDIS_DB=0
   ```

## Running the server

```
npm run dev
```

## Testing

Run the test suite:

```
npm test
```

## Usage

### Basic Usage

```typescript
import express from 'express';
import { rateLimiter } from './middleware/rateLimiter';

const app = express();

// Apply rate limiter to all routes
app.use(rateLimiter);

// Or apply to specific routes
app.use('/api', rateLimiter);

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

### Custom Configuration

```typescript
import express from 'express';
import { createRateLimiter } from './middleware/rateLimiter';

const app = express();

const customRateLimiter = createRateLimiter({
  keyPrefix: 'rl:',
  isAuthenticated: (req) => req.headers['x-api-key'] === 'your-api-key',
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
    // Temporary overrides
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
});

app.use('/api', customRateLimiter);
```