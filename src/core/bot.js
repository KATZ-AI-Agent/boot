import TelegramBot from 'node-telegram-bot-api';
import { config } from '../core/config.js';
import { rateLimiter } from '../core/rate-limiting/RateLimiter.js';
import { setupEventHandlers } from '../events/index.js';

class Bot {
  constructor() {
    this.instance = new TelegramBot(config.botToken, { polling: true });
  }

  async stop() {
    if (this.instance) {
      await this.instance.stopPolling();
    }
  }
}

export const bot = new Bot().instance;