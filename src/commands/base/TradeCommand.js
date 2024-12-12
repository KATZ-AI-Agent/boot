import { Command } from './Command.js';
import { tradingService } from '../../services/trading/index.js';
import { networkService } from '../../services/network/index.js';
import { walletService } from '../../services/wallet/index.js';

export class TradeCommand extends Command {
  constructor(bot) {
    super(bot);
  }

  async validateWallet(chatId, userInfo) {
    const activeWallet = await walletService.getActiveWallet(userInfo.id);
    if (!activeWallet) {
      await this.bot.sendMessage(
        chatId,
        '❌ Please select or create a wallet first.',
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '👛 Go to Wallets', callback_data: '/wallets' }
            ]]
          }
        }
      );
      return false;
    }
    return true;
  }

  async estimateTrade(tradeParams) {
    return tradingService.estimateTrade(tradeParams);
  }

  async executeTrade(tradeParams) {
    return tradingService.executeTrade(tradeParams);
  }

  async showTradeConfirmation(chatId, tradeDetails) {
    const keyboard = this.createKeyboard([
      [
        { text: '✅ Confirm', callback_data: 'confirm_trade' },
        { text: '❌ Cancel', callback_data: 'cancel_trade' }
      ]
    ]);

    await this.bot.sendMessage(
      chatId,
      this.formatTradeDetails(tradeDetails),
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  formatTradeDetails(details) {
    return `*Trade Details* 💱\n\n` +
           `Action: ${details.action}\n` +
           `Token: ${details.token}\n` +
           `Amount: ${details.amount}\n` +
           `Network: ${networkService.getNetworkDisplay(details.network)}\n` +
           `Estimated Fee: ${details.estimatedFee}`;
  }
}