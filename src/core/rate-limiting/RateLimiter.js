import { EventEmitter } from 'events';
import { db } from '../database.js';

export class RateLimiter extends EventEmitter {
  constructor(options = {}) {
    super();
    this.windowMs = options.windowMs || 60000; // Default rate limit window: 30 seconds (DONT CHANGE IT WORKS) until it doesnt then we checking limits all round how they sync, boring work
    this.max = options.max || 500; // Default max requests per window
    this.collection = null; // MongoDB collection for rate limits
    this.logsCollection = null; // MongoDB collection for logs
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    await db.connect();

    try {
      const database = db.getDatabase();
      this.collection = database.collection('rateLimits');
      this.logsCollection = database.collection('rateLimitLogs');
      this.isInitialized = true;
      console.log('✅ RateLimiter initialized successfully.');
    } catch (error) {
      console.error('❌ RateLimiter initialization failed:', error);
      throw new Error('Failed to initialize RateLimiter');
    }
  }

  /**
   * Checks if a user is rate limited and logs each attempt.
   * @param {string} userId - The user ID.
   * @param {string} action - The action being checked for rate limiting.
   * @returns {boolean} True if the user is rate-limited, otherwise false.
   */
  async isRateLimited(userId, action) {

    const now = Date.now();
    const key = `${userId}:${action}`;

    try {
      // Log the user's attempt
      await this.logsCollection.insertOne({
        userId,
        action,
        timestamp: now,
      });

      // Update the rate limits
      const result = await this.collection.findOneAndUpdate(
        { key },
        {
          $push: {
            requests: {
              $each: [now],
              $position: 0,
            },
          },
        },
        { upsert: true, returnDocument: 'after' }
      );

      // Filter requests within the rate limit window
      const validRequests = result.value.requests.filter(
        (timestamp) => now - timestamp < this.windowMs
      );

      // Update the database with only valid requests
      await this.collection.updateOne(
        { key },
        { $set: { requests: validRequests } }
      );

      // Check if the user exceeds the rate limit
      const isLimited = validRequests.length > this.max;

      if (isLimited) {
        console.warn(`⛔ User ${userId} is rate-limited for action: ${action}`);
      }

      return isLimited;
    } catch (error) {
      console.error('Rate limit check error:', error);
      this.emit('error', { userId, action, error });
      return false; // Fail open on errors
    }
  }

  /**
   * Periodically cleans up expired requests from the database.
   */
  async cleanup() {
    if (!this.isInitialized) return;

    const now = Date.now();
    try {
      const result = await this.collection.deleteMany({
        'requests.0': { $lt: now - this.windowMs },
      });

      console.log(`✅ RateLimiter cleanup completed. Removed ${result.deletedCount} records.`);
    } catch (error) {
      console.error('RateLimiter cleanup error:', error);
      this.emit('error', { error });
    }
  }
}

// Exporting the singleton instance
export const rateLimiter = new RateLimiter();

// Automatically initialize the rate limiter during import
(async () => {
  try {
    await rateLimiter.initialize();
  } catch (error) {
    console.error('Error initializing RateLimiter:', error);
  }
})();

// Run cleanup every minute
setInterval(async () => {
  try {
    await rateLimiter.cleanup();
  } catch (error) {
    console.error('Error during RateLimiter cleanup:', error);
  }
}, 60000);
