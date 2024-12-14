import { ErrorHandler } from '../../../core/errors/index.js';
import { User } from '../../../models/User.js';

export class WalletSettingsHandler {
  constructor(bot) {
    this.bot = bot;
  }

  async showWalletSettings(chatId, userInfo) {
    try {
      const user = await User.findOne({ telegramId: userInfo.id.toString() }).lean();
      const isAutonomousEnabled = user?.settings?.trading?.autonomousEnabled;

      const keyboard = {
        inline_keyboard: [
          [{ 
            text: `${isAutonomousEnabled ? '🔴 Disable' : '🟢 Enable'} Autonomous Trading`,
            callback_data: 'toggle_autonomous'
          }],
          [{ text: '⚙️ Adjust Slippage', callback_data: 'slippage_settings' }],
          [{ text: '↩️ Back', callback_data: 'back_to_wallets' }]
        ]
      };

      await this.bot.sendMessage(
        chatId,
        '*Wallet Settings* ⚙️\n\n' +
        `Autonomous Trading: ${isAutonomousEnabled ? '✅' : '❌'}\n\n` +
        'Configure your wallet settings:',
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );
    } catch (error) {
      throw error;
    }
  }

  async showSlippageSettings(chatId, userInfo) {
    try {
      const user = await User.findOne({ telegramId: userInfo.id.toString() }).lean();
      const slippage = user?.settings?.trading?.slippage || {
        ethereum: 3,
        base: 3,
        solana: 3
      };

      const keyboard = {
        inline_keyboard: [
          [{ text: `ETH (${slippage.ethereum}%)`, callback_data: 'adjust_eth_slippage' }],
          [{ text: `Base (${slippage.base}%)`, callback_data: 'adjust_base_slippage' }],
          [{ text: `Solana (${slippage.solana}%)`, callback_data: 'adjust_sol_slippage' }],
          [{ text: '↩️ Back', callback_data: 'wallet_settings' }]
        ]
      };

      await this.bot.sendMessage(
        chatId,
        '*Slippage Settings* ⚙️\n\n' +
        'Current slippage tolerance:\n\n' +
        `• Ethereum: ${slippage.ethereum}%\n` +
        `• Base: ${slippage.base}%\n` +
        `• Solana: ${slippage.solana}%\n\n` +
        'Select a network to adjust:',
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );
    } catch (error) {
      throw error;
    }
  }
}