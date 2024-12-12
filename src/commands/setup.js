import { CommandRegistry } from './registry.js';
import { ErrorHandler } from '../core/errors/index.js';

export function setupCommands(bot) {
  const registry = new CommandRegistry(bot);

  // Handle callback queries
  bot.on('callback_query', async (query) => {
    try {
      const handled = await registry.handleCallback(query);
      if (!handled) {
        console.warn('Unhandled callback query:', query.data);
      }
      await bot.answerCallbackQuery(query.id);
    } catch (error) {
      await ErrorHandler.handle(error, bot, query.from.id); // Log and notify user
      console.error('Error handling callback query:', error);
      await bot.answerCallbackQuery(query.id, {
        text: '❌ An error occurred while processing your request.',
        show_alert: true
      });
    }
  });

  // Handle messages
  bot.on('message', async (msg) => {
    try {
      await registry.handleMessage(msg);
    } catch (error) {
      await ErrorHandler.handle(error, bot, msg.chat.id); // Log and notify user
      console.error('Error handling message:', error);
    }
  });

  return registry;
}
