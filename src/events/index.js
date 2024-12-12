import { setupMessageHandler } from './message.js';
import { ErrorHandler } from '../core/errors/index.js';
import { circuitBreakers } from '../core/circuit-breaker/index.js';
import { BREAKER_CONFIGS } from '../core/circuit-breaker/index.js';
import { CommandRegistry } from '../commands/registry.js';

export function setupEventHandlers(bot, { rateLimiter }) {
  /**
   * Message Handler:
   * Rate limiting is bypassed for all users in testing
   */
  const commandRegistry = new CommandRegistry(bot);

  bot.on('message', async (msg) => {
    const userId = msg.from?.id;

    if (!userId) {
      console.error('No user ID found in message');
      return;
    }
    console.warn('we here////');
    try {
      // Use the handleMessage function from CommandRegistry
      await commandRegistry.handleMessage(msg);
    } catch (error) {
      // Handle other errors gracefully
      console.error('Error while handling message:', error);
      await ErrorHandler.handle(error);
    }
  });

  /**
   * Circuit Breakers for Bot Errors:
   * 
   * - Used circuitBreakers.executeWithBreaker to wrap bot-level error handling
   * - Prevents repetitive failures from overwhelming the system
   */
  bot.on('error', async (error) => {
    await circuitBreakers.executeWithBreaker(
      'bot_errors',
      async () => {
        console.error('Telegram bot error:', error);
        await ErrorHandler.handle(error, bot);
      },
      BREAKER_CONFIGS.botErrors
    );
  });

  /**
   * Polling Errors with Circuit Breakers:
   * 
   * - Polling errors are wrapped in a circuit breaker for resilience
   */
  bot.on('polling_error', async (error) => {
    await circuitBreakers.executeWithBreaker(
      'polling_errors',
      async () => {
        console.error('Polling error:', error);
        await ErrorHandler.handle(error, bot);
      },
      BREAKER_CONFIGS.pollingErrors
    );
  });

  console.log('🔧 Setting up message handlers...');
}