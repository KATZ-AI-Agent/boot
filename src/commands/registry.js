import { EventEmitter } from 'events';
import { ErrorHandler } from '../core/errors/index.js';
import { MessageHandler } from '../core/MessageHandler.js';

export class CommandRegistry extends EventEmitter {
  constructor(bot) {
    super();
    this.bot = bot;
    this.commands = new Map();
    this.messageHandler = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Initialize MessageHandler
      this.messageHandler = new MessageHandler(this.bot, this);
      await this.messageHandler.initialize();

      // Set up command list with Telegram
      const commandList = Array.from(this.commands.values()).map(cmd => ({
        command: cmd.command.replace('/', ''),
        description: cmd.description
      }));

      // Set bot commands
      await this.bot.setMyCommands(commandList);

      this.initialized = true;
      this.emit('initialized');
      console.log('✅ CommandRegistry initialized with', this.commands.size, 'commands');
      return true;
    } catch (error) {
      console.error('❌ Error initializing CommandRegistry:', error);
      await ErrorHandler.handle(error);
      throw error;
    }
  }

  registerCommand(command) {
    if (!command.command || !command.description) {
      throw new Error('Invalid command format');
    }

    // Store command in registry
    this.commands.set(command.command, command);

    // Register command's own handlers if it has any
    command.register?.();

    console.log(`✅ Registered command: ${command.command}`);
    this.emit('commandRegistered', {
      command: command.command,
      description: command.description
    });
  }

  getCommands() {
    return Array.from(this.commands.values()).map(cmd => ({
      command: cmd.command,
      description: cmd.description
    }));
  }

  async handleCallback(query) {
    for (const command of this.commands.values()) {
      if (await command.handleCallback?.(query)) {
        return true;
      }
    }
    return false;
  }

  cleanup() {
    if (this.messageHandler) {
      this.messageHandler.cleanup();
    }
    this.commands.clear();
    this.removeAllListeners();
    this.initialized = false;
  }
}