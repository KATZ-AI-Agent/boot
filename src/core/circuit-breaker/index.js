export * from './CircuitBreaker.js';
export * from './CircuitBreakerRegistry.js';

// Default circuit breaker configurations
export const BREAKER_CONFIGS = {
  
  botErrors: {
    timeout: 60000,
    maxFailures: 5, 
    resetTimeout: 100000, 
  },

  // Polling Errors: More lenient settings to accommodate slower or failing services
  pollingErrors: {
    timeout: 300000, 
    maxFailures: 5, 
    resetTimeout: 60000, 
  },

  // DEXTools: More cautious as these requests are often external and prone to transient failures
  dextools: {
    failureThreshold: 8,
    resetTimeout: 30000,
    halfOpenRetries: 3, 
  },

  // OpenAI: Critical service, requires aggressive handling to prevent long disruptions
  openai: {
    failureThreshold: 7, 
    resetTimeout: 20000, 
    halfOpenRetries: 3,
  },

  // PumpFun: Allows faster recovery since it seems to process transactions in real time
  pumpfun: {
    failureThreshold: 10,
    resetTimeout: 5000, 
    halfOpenRetries: 3, 
  }
};
