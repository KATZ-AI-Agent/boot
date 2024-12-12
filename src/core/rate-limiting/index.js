import { RateLimiter } from './RateLimiter.js';

// Testing phase, early birds rate limiters for different actions
export const rateLimiters = {
  messages: new RateLimiter({ windowMs: 60000, max: 300 }), // 300 msgs/min
  trades: new RateLimiter({ windowMs: 300000, max: 100 }), // 100 trades/5min
  alerts: new RateLimiter({ windowMs: 60000, max: 500 }), // 500 alerts/min
  scans: new RateLimiter({ windowMs: 60000, max: 100 }) // 100 scans/min
};

export async function checkRateLimit(userId, action) {
  const limiter = rateLimiters[action];
  if (!limiter) return false;
  return limiter.isRateLimited(userId, action);
}