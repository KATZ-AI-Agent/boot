export * from './CircuitBreaker.js';
export * from './CircuitBreakerRegistry.js';

// Default circuit breaker configurations
export const BREAKER_CONFIGS = {
  // Bot Errors: Adjust to allow more time for transient issues to resolve
  botErrors: {
    timeout: 60000, // Increased from 5000 to 7 seconds
    maxFailures: 5, // Increased from 3 to 5 failures
    resetTimeout: 100000, // Increased from 30 seconds to 45 seconds
  },

  // Polling Errors: More lenient settings to accommodate slower or failing services
  pollingErrors: {
    timeout: 300000, // Increased from 3000 to 5 minutes
    maxFailures: 5, // Same as before
    resetTimeout: 60000, // Increased from 20 seconds to 40 seconds
  },

  // DEXTools: More cautious as these requests are often external and prone to transient failures
  dextools: {
    failureThreshold: 8, // Decreased from 10 to 8 to reduce retries during poor service availability
    resetTimeout: 60000, // Increased from 20 seconds to 30 seconds
    halfOpenRetries: 3, // Increased to 3 retries in half-open state
  },

  // OpenAI: Critical service, requires aggressive handling to prevent long disruptions
  openai: {
    failureThreshold: 7, // Reduced from 10 to 7 to stop excessive retries quickly
    resetTimeout: 20000, // Increased from 10 seconds to 15 seconds
    halfOpenRetries: 3, // Allow more retries before fully reopening
  },

  // PumpFun: Allows faster recovery since it seems to process transactions in real time
  pumpfun: {
    failureThreshold: 10, // Same as before
    resetTimeout: 5000, // Increased from 2000 to 5 seconds
    halfOpenRetries: 3, // Allow more retries in half-open state
  }
};
