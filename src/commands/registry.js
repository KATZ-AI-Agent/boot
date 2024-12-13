import { EventEmitter } from 'events';
import { ErrorHandler } from '../core/errors/index.js';
import { MessageHandler } from '../core/MessageHandler.js';

export class CommandRegistry extends EventEmitter {
  constructor(bot) {
    super();
    this.bot = bot;
    this.commands = new Map();
    this.messageHandler = new MessageHandler(bot, this);
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      await this.messageHandler.initialize();
      this.initialized = true;
      this.emit('initialized');
      return true;
    } catch (error) {
      await ErrorHandler.handle(error);
      throw error;
    }
  }

  registerCommand(command) {
    if (!command.command || !command.description) {
      throw new Error('Invalid command format');
    }

    this.commands.set(command.command, command);
    command.register?.();

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

  cleanup() {
    this.messageHandler.cleanup();
    this.commands.clear();
    this.removeAllListeners();
    this.initialized = false;
  }
}
