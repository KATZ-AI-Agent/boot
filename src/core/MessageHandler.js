import { EventEmitter } from 'events';
import { ErrorHandler } from './errors/index.js';
import { aiService } from '../services/ai/index.js';

export class MessageHandler extends EventEmitter {
  constructor(bot, commandRegistry) {
    super();
    this.bot = bot;
    this.commandRegistry = commandRegistry;
    this.initialized = false;
    this.metrics = {
      messagesProcessed: 0,
      commandsExecuted: 0,
      callbacksHandled: 0,
      errors: 0,
    };
  }

  async initialize() {
    if (this.initialized) return;

    console.log('🚀 Initializing MessageHandler...');
    try {
      // Setup message handler
      this.bot.on('message', async (msg) => {
        try {
          this.metrics.messagesProcessed += 1;
          await this.handleMessage(msg);
        } catch (error) {
          console.error('❌ Error handling message:', error);
          this.metrics.errors += 1;
          await ErrorHandler.handle(error, this.bot, msg.chat.id);
        }
      });

      // Setup callback query handler
      this.bot.on('callback_query', async (query) => {
        try {
          this.metrics.callbacksHandled += 1;
          console.log('📥 Callback query received:', query.data);
          const handled = await this.handleCallback(query);

          // Answer callback only if it was handled
          if (handled) {
            await this.bot.answerCallbackQuery(query.id);
          } else {
            console.warn(`⚠️ Unhandled callback query: ${query.data}`);
            await this.bot.answerCallbackQuery(query.id, {
              text: '⚠️ Action not recognized.',
              show_alert: true,
            });
          }
        } catch (error) {
          console.error('❌ Error handling callback:', error);
          this.metrics.errors += 1;
          await ErrorHandler.handle(error, this.bot, query.message?.chat?.id);
          await this.bot.answerCallbackQuery(query.id, {
            text: '❌ An error occurred',
            show_alert: true,
          });
        }
      });

      this.initialized = true;
      console.log('✅ MessageHandler initialized successfully');
    } catch (error) {
      console.error('❌ Error during MessageHandler initialization:', error);
      throw error;
    }
  }

  async handleMessage(msg) {
    if (!msg.text) return; // Skip non-text messages

    console.log(`📥 Received message: "${msg.text}" from user ${msg.from.id}`);

    try {
      // Prioritize exact command matches
      if (msg.text.startsWith('/')) {
        const command = this.commandRegistry.commands.get(msg.text.split(' ')[0]);
        if (command) {
          console.log(`🎯 Executing exact command: ${command.command}`);
          this.metrics.commandsExecuted += 1;
          await command.execute(msg);
          return;
        }
      }

      // Check for pattern-based command matches
      for (const command of this.commandRegistry.commands.values()) {
        if (command.pattern?.test(msg.text)) {
          console.log(`🎯 Executing pattern-matched command: ${command.command}`);
          this.metrics.commandsExecuted += 1;
          await command.execute(msg);
          return;
        }
      }

      // Handle natural language processing
      if (msg.text.toLowerCase().startsWith('hey katz')) {
        console.log('🗣️ Handling natural language input...');
        await this.handleNaturalLanguage(msg);
        return;
      }

      // Handle state-based input
      for (const command of this.commandRegistry.commands.values()) {
        if (command.handleInput && (await command.handleInput(msg))) {
          console.log('🛠️ State-based input handled.');
          return;
        }
      }

      // Default response for unrecognized commands in private chats
      if (msg.chat.type === 'private' && msg.text.startsWith('/')) {
        await this.bot.sendMessage(
          msg.chat.id,
          '⚠️ Command not recognized. Type /help to see available commands.',
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error) {
      console.error('❌ Error processing message:', error);
      this.metrics.errors += 1;
      throw error;
    }
  }

  async handleCallback(query) {
    console.log(`📥 Processing callback: ${query.data} from user ${query.from.id}`);

    try {
      for (const command of this.commandRegistry.commands.values()) {
        if (await command.handleCallback?.(query)) {
          console.log(`🎯 Callback handled by command: ${command.command}`);
          return true; // Callback was successfully handled
        }
      }

      console.warn(`⚠️ No handler found for callback: ${query.data}`);
      return false; // Callback not handled
    } catch (error) {
      console.error('❌ Error processing callback:', error);
      this.metrics.errors += 1;
      throw error;
    }
  }

  async handleNaturalLanguage(msg) {
    try {
      console.log('🗣️ Processing natural language input...');
      const response = await aiService.generateResponse(msg.text, 'chat', msg.from.id);
      await this.bot.sendMessage(msg.chat.id, response, { parse_mode: 'Markdown' });

      this.emit('naturalLanguageProcessed', {
        userId: msg.from.id,
        text: msg.text,
      });
    } catch (error) {
      console.error('❌ Error processing natural language input:', error);
      this.metrics.errors += 1;
      throw error;
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };
  }

  cleanup() {
    try {
      console.log('🧹 Cleaning up MessageHandler...');
      this.bot.removeAllListeners(); // Remove all listeners for safety
      this.removeAllListeners(); // Remove any event listeners on MessageHandler itself
      this.metrics = { messagesProcessed: 0, commandsExecuted: 0, callbacksHandled: 0, errors: 0 };
      this.initialized = false;
      console.log('✅ MessageHandler cleanup completed.');
    } catch (error) {
      console.error('❌ Error during MessageHandler cleanup:', error);
      throw error;
    }
  }
}
