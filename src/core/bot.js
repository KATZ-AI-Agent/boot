import TelegramBot from 'node-telegram-bot-api';
import { config } from '../core/config.js';

class Bot {
  constructor() {
    this.instance = new TelegramBot(config.botToken, { 
      polling: {
        interval: 300, // Poll every 300ms
        params: {
          timeout: 10 // Long polling timeout
        },
        autoStart: false // Don't start polling until ready
      }
    });
  }

  async stop() {
    if (this.instance) {
      await this.instance.stopPolling();
    }
  }
}

export const bot = new Bot().instance;