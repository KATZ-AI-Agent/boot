import { BaseCommand } from '../base/BaseCommand.js';
import { dextools } from '../../services/dextools/index.js';
import { networkState } from '../../services/networkState.js';
import { ErrorHandler } from '../../core/errors/index.js';

export class TrendingCommand extends BaseCommand {
  constructor(bot, eventHandler) {
    super(bot, eventHandler);
    this.command = '/trending';
    this.description = 'View trending tokens';
    this.pattern = /^(\/trending|🔥 Trending Tokens)$/;
  }

  registerHandlers() {
    this.eventHandler.on('refresh_trending', async (data) => {
      const { chatId, query } = data;
      try {
        await this.bot.deleteMessage(chatId, query.message.message_id);
        await this.handleTrendingCommand(chatId);
      } catch (error) {
        await ErrorHandler.handle(error, this.bot, chatId);
      }
    });

    this.eventHandler.on('retry_trending', async (data) => {
      const { chatId } = data;
      try {
        await this.handleTrendingCommand(chatId);
      } catch (error) {
        await ErrorHandler.handle(error, this.bot, chatId);
      }
    });
  }

  async execute(msg) {
    const chatId = msg.chat.id;
    try {
      await this.handleTrendingCommand(chatId);
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }

  async handleTrendingCommand(chatId) {
    const currentNetwork = await networkState.getCurrentNetwork(chatId);
    const loadingMsg = await this.showLoadingMessage(
      chatId,
      `😼 Katz fetching... Loading trending tokens on ${networkState.getNetworkDisplay(currentNetwork)}`
    );

    try {
      const tokens = await dextools.fetchTrendingTokens(currentNetwork);
      await this.deleteMessage(chatId, loadingMsg.message_id);

      const message = this.formatTrendingMessage(tokens, currentNetwork);

      const keyboard = this.createKeyboard([
        [{ text: '🔄 Refresh', callback_data: 'refresh_trending' }],
        [{ text: '🌐 Switch Network', callback_data: 'switch_network' }],
        [{ text: '🏠 Main Menu', callback_data: '/start' }]
      ]);

      await this.simulateTyping(chatId);
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: keyboard
      });
    } catch (error) {
      await this.deleteMessage(chatId, loadingMsg.message_id);
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }

  formatTrendingMessage(tokens, network) {
    let message = `🔥 *Top Trending Tokens on ${networkState.getNetworkDisplay(network)}*\n\n`;
    message += tokens
      .map(
        (token) =>
          `${token.rank}. *${token.symbol}*\n` +
          `• Name: ${token.name}\n` +
          `• Address: \`${token.address.slice(0, 6)}...${token.address.slice(-4)}\`\n` +
          `• [View on Dextools](${token.dextoolsUrl})\n`
      )
      .join('\n');
    return message;
  }

  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const action = query.data;

    if (action === 'refresh_trending' || action === 'retry_trending') {
      this.eventHandler.emit(action, { chatId, query });
      return true;
    }

    return false;
  }
}
