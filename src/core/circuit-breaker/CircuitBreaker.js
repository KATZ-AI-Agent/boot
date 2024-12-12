import { EventEmitter } from 'events';
import { checkRateLimit } from '../rate-limiting/index.js';
import { ErrorHandler } from '../errors/index.js';

const STATES = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
};

export class CircuitBreaker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.failureThreshold = options.failureThreshold || 5; // Failures before opening the circuit
    this.resetTimeout = options.resetTimeout || 60000; // Time to reset the circuit
    this.halfOpenRetries = options.halfOpenRetries || 3; // Allowed retries in HALF_OPEN
    this.rateLimit = options.rateLimit; // Optional rate-limiting configuration

    this.state = STATES.CLOSED;
    this.failures = 0;
    this.lastFailureTime = null;
    this.retryCount = 0;
  }

  async execute(fn, userId, action) {
    try {
      // Rate-limiting check (if configured)
      if (this.rateLimit) {
        const isLimited = await checkRateLimit(userId, action);
        if (isLimited) {
          console.warn(`Rate limit exceeded for user ${userId}, action: ${action}`);
          throw new Error('Rate limit exceeded');
        }
      }

      // Circuit breaker logic
      if (this.state === STATES.OPEN) {
        if (this.shouldAttemptReset()) {
          console.log('Circuit breaker moving to HALF_OPEN state');
          this.state = STATES.HALF_OPEN;
        } else {
          throw new Error('Circuit breaker is OPEN');
        }
      }

      const result = await fn();
      this.onSuccess(); // Reset state on success
      return result;
    } catch (error) {
      this.onFailure(error); // Track failure
      await ErrorHandler.handle(error, null, null, { context: 'Circuit breaker failure' });
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    this.retryCount = 0;
    if (this.state === STATES.HALF_OPEN) {
      this.state = STATES.CLOSED;
      this.emit('close');
      console.log('Circuit breaker CLOSED');
    }
  }

  onFailure(error) {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === STATES.HALF_OPEN) {
      this.retryCount++;
      if (this.retryCount >= this.halfOpenRetries) {
        this.state = STATES.OPEN;
        this.emit('open', error);
        console.warn('Circuit breaker moved to OPEN state');
      }
    } else if (this.failures >= this.failureThreshold) {
      this.state = STATES.OPEN;
      this.emit('open', error);
      console.warn('Circuit breaker moved to OPEN state');
    }
  }

  shouldAttemptReset() {
    return Date.now() - this.lastFailureTime >= this.resetTimeout;
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailure: this.lastFailureTime,
      retries: this.retryCount,
    };
  }

  reset() {
    this.state = STATES.CLOSED;
    this.failures = 0;
    this.lastFailureTime = null;
    this.retryCount = 0;
    this.emit('reset');
    console.log('Circuit breaker RESET to CLOSED state');
  }
}
