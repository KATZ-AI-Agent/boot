import { ErrorHandler } from '../../../core/errors/index.js';
import { walletService } from '../../../services/wallet/index.js';
import { networkState } from '../../../services/networkState.js';

export class WalletDetailsHandler {
  constructor(bot) {
    this.bot = bot;
  }

  async showWalletDetails(chatId, userInfo, address, showLoadingMessage) {
    const loadingMsg = await showLoadingMessage(chatId, '👛 Loading wallet details...');

    try {
      const wallet = await walletService.getWallet(userInfo.id, address);
      const balance = await walletService.getBalance(userInfo.id, address);
      const isAutonomous = await walletService.isAutonomousWallet(userInfo.id, wallet.network, address);

      await this.bot.deleteMessage(chatId, loadingMsg.message_id);

      const keyboard = {
        inline_keyboard: [
          [{
            text: isAutonomous ? '🔴 Remove Autonomous' : '🟢 Set as Autonomous',
            callback_data: `set_autonomous_${address}`
          }],
          [{ text: '↩️ Back', callback_data: 'view_wallets' }]
        ]
      };

      await this.bot.sendMessage(
        chatId,
        `*Wallet Details* 👛\n\n` +
        `Network: ${networkState.getNetworkDisplay(wallet.network)}\n` +
        `Address: \`${address}\`\n` +
        `Balance: ${balance}\n` +
        `Type: ${wallet.type === 'walletconnect' ? 'External 🔗' : 'Internal 👛'}\n` +
        `Autonomous: ${isAutonomous ? '✅' : '❌'}`,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );
    } catch (error) {
      if (loadingMsg) {
        await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      }
      throw error;
    }
  }

  async setAutonomousWallet(chatId, userInfo, address, showLoadingMessage) {
    const loadingMsg = await showLoadingMessage(chatId, '⚙️ Updating wallet settings...');

    try {
      await walletService.setAutonomousWallet(userInfo.id, address);
      
      await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      await this.bot.sendMessage(
        chatId,
        '✅ Autonomous wallet updated successfully!',
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '👛 View Wallet', callback_data: `wallet_${address}` },
              { text: '↩️ Back', callback_data: 'view_wallets' }
            ]]
          }
        }
      );
    } catch (error) {
      if (loadingMsg) {
        await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      }
      throw error;
    }
  }
}