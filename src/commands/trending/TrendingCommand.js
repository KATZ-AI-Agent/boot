import { Command } from '../base/Command.js';
import { dextools } from '../../services/dextools/index.js';
import { networkService } from '../../services/network/index.js';

export class TrendingCommand extends Command {
  constructor(bot) {
    super(bot);
    this.command = '/trending';
    this.description = 'View trending tokens';
    this.pattern = /^(\/trending|🔥 Trending Tokens)$/;
  }

  async execute(msg) {
    const chatId = msg.chat.id;
    await this.handleTrendingCommand(chatId);
  }

  async handleTrendingCommand(chatId) {
    const currentNetwork = await networkService.getCurrentNetwork(chatId);
    const loadingMsg = await this.showLoadingMessage(
      chatId, 
      `😼 Katz fetching... Loading trending tokens on ${networkService.getNetworkDisplay(currentNetwork)}`
    );

    try {
      const tokens = await dextools.fetchTrendingTokens(currentNetwork);
      await this.deleteMessage(chatId, loadingMsg.message_id);

      let message = `🔥 *Top Trending Tokens on ${networkService.getNetworkDisplay(currentNetwork)}*\n\n`;
      message += tokens.map(token => (
        `${token.rank}. *${token.symbol}*\n` +
        `• Name: ${token.name}\n` +
        `• Address: \`${token.address.slice(0, 6)}...${token.address.slice(-4)}\`\n` +
        `• [View on Dextools](${token.dextoolsUrl})\n`
      )).join('\n');

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
      console.error('Error fetching trending tokens:', error);
      if (loadingMsg) {
        await this.deleteMessage(chatId, loadingMsg.message_id);
      }
      await this.showErrorMessage(chatId, error, 'retry_trending');
    }
  }

  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const action = query.data;

    try {
      switch (action) {
        case 'refresh_trending':
          await this.bot.deleteMessage(chatId, query.message.message_id);
          await this.handleTrendingCommand(chatId);
          return true;

        case 'retry_trending':
          await this.handleTrendingCommand(chatId);
          return true;
      }
    } catch (error) {
      console.error('Error handling trending action:', error);
      await this.showErrorMessage(chatId, error, 'retry_trending');
    }
    return false;
  }
}