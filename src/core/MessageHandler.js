import { EventEmitter } from 'events';
import { ErrorHandler } from './errors/index.js';
import { aiService } from '../services/ai/index.js';
import { USER_STATES } from './constants.js';

export class MessageHandler extends EventEmitter {
  constructor(bot, commandRegistry) {
    super();
    this.bot = bot;
    this.commandRegistry = commandRegistry;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Set up core message handlers
      this.bot.on('message', this.handleMessage.bind(this));

      this.// Handle callback queries
      bot.on('callback_query', async (query) => {
        try {
          const handled = await registry.handleCallback(query);
          if (!handled) {
            console.warn('Unhandled callback query:', query.data);
          }
          await bot.answerCallbackQuery(query.id);
        } catch (error) {
          await ErrorHandler.handle(error, bot, query.from.id);
          console.error('Error handling callback query:', error);
          await bot.answerCallbackQuery(query.id, {
            text: '❌ An error occurred while processing your request.',
            show_alert: true
          });
        }
      });

      //Setup Voice message handlers
      this.bot.on('voice', this.handleVoice.bind(this));

      this.initialized = true;
      console.log('✅ MessageHandler initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing MessageHandler:', error);
      throw error;
    }
  }

  async handleMessage(msg) {
    try {
      // Skip non-text messages
      if (!msg.text) return;

      // Check for command pattern match
      for (const command of this.commandRegistry.commands.values()) {
        if (command.pattern?.test(msg.text)) {
          await command.execute(msg);
          this.emit('commandExecuted', {
            command: command.command,
            userId: msg.from.id
          });
          return;
        }
      }

      // Handle natural language input
      if (msg.text.toLowerCase().startsWith('hey katz')) {
        await this.handleNaturalLanguage(msg);
        return;
      }

      // Handle state-based input
      for (const command of this.commandRegistry.commands.values()) {
        if (command.handleInput && await command.handleInput(msg)) {
          this.emit('inputHandled', {
            command: command.command,
            userId: msg.from.id
          });
          return;
        }
      }
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, msg.chat.id);
    }
  }

  async handleCallback(query) {
    try {
      // Handle command-specific callbacks
      for (const command of this.commandRegistry.commands.values()) {
        if (await command.handleCallback?.(query)) {
          this.emit('callbackHandled', {
            command: command.command,
            action: query.data,
            userId: query.from.id
          });
          return;
        }
      }

      // Answer callback query to remove loading state
      await this.bot.answerCallbackQuery(query.id);
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, query.message.chat.id);
      await this.bot.answerCallbackQuery(query.id, {
        text: '❌ An error occurred',
        show_alert: true
      });
    }
  }

  async handleVoice(msg) {
    try {
      const result = await aiService.processVoiceCommand(msg.voice.file_id, msg.from.id);
      
      await this.bot.sendMessage(msg.chat.id, result.response, {
        parse_mode: 'Markdown'
      });

      if (result.audio) {
        await this.bot.sendVoice(msg.chat.id, result.audio);
      }

      this.emit('voiceHandled', {
        userId: msg.from.id,
        duration: msg.voice.duration
      });
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, msg.chat.id);
    }
  }

  async handleNaturalLanguage(msg) {
    try {
      const response = await aiService.generateResponse(
        msg.text,
        'chat',
        msg.from.id
      );

      await this.bot.sendMessage(msg.chat.id, response, {
        parse_mode: 'Markdown'
      });

      this.emit('naturalLanguageHandled', {
        userId: msg.from.id,
        text: msg.text
      });
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, msg.chat.id);
    }
  }

  cleanup() {
    this.removeAllListeners();
    this.initialized = false;
  }
}