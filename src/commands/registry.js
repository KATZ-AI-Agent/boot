import { EventEmitter } from 'events';

export class CommandRegistry extends EventEmitter {
  constructor(bot) {
    super();
    this.bot = bot;
    this.commands = new Map();
  }

  registerCommand(command) {
    this.commands.set(command.command, command);
    command.register();
  }

  async handleCallback(query) {
    for (const command of this.commands.values()) {
      try {
        if (await command.handleCallback(query)) {
          this.emit('callback', { 
            command: command.command, 
            action: query.data,
            userId: query.from.id 
          });
          return true;
        }
      } catch (error) {
        console.error(`Error in callback handler for ${command.command}:`, error);
        this.emit('error', { command: command.command, error });
      }
    }
    return false;
  }

  async handleMessage(msg) {
    for (const command of this.commands.values()) {
      try {
        if (command.handleInput && await command.handleInput(msg)) {
          this.emit('message', {
            command: command.command,
            userId: msg.from.id,
            type: msg.voice ? 'voice' : 'text'
          });
          return true;
        }
      } catch (error) {
        console.error(`Error handling message for ${command.command}:`, error);
        this.emit('error', { command: command.command, error });
      }
    }
    return false;
  }

  getCommands() {
    return Array.from(this.commands.values()).map(cmd => ({
      command: cmd.command,
      description: cmd.description
    }));
  }

  cleanup() {
    this.commands.clear();
    this.removeAllListeners();
  }
}