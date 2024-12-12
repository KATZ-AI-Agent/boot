import { Command } from '../base/Command.js';
import { User } from '../../models/User.js';
import { networkService } from '../../services/network/index.js';
import { walletService } from '../../services/wallet/index.js';

export class SettingsCommand extends Command {
  constructor(bot) {
    super(bot);
    this.command = '/settings';
    this.description = 'Configure bot settings';
    this.pattern = /^(\/settings|⚙️ Settings)$/;
  }

  async execute(msg) {
    const chatId = msg.chat.id;
    await this.showSettingsMenu(chatId, msg.from);
  }

  async showSettingsMenu(chatId, userInfo) {
    try {
      const user = await User.findOne({ telegramId: userInfo.id.toString() }).lean();
      const currentNetwork = await networkService.getCurrentNetwork(userInfo.id);

      const keyboard = this.createKeyboard([
        [{ text: '🔄 Switch Network', callback_data: 'switch_network' }],
        [{ text: '⚙️ Slippage Settings', callback_data: 'slippage_settings' }],
        [{ text: '🤖 Autonomous Trading', callback_data: 'autonomous_settings' }],
        [{ text: '🔔 Notification Settings', callback_data: 'notification_settings' }],
        [{ text: '🫅 Butler Assistant', callback_data: 'butler_assistant' }],
        [{ text: '↩️ Back to Menu', callback_data: '/start' }]
      ]);

      await this.bot.sendMessage(
        chatId,
        `*Settings* ⚙️\n\n` +
        `Current Network: *${networkService.getNetworkDisplay(currentNetwork)}*\n` +
        `Slippage: ${user?.settings?.trading?.slippage[currentNetwork]}%\n` +
        `Autonomous Trading: ${user?.settings?.trading?.autonomousEnabled ? '✅' : '❌'}\n` +
        `Notifications: ${user?.settings?.notifications?.enabled ? '✅' : '❌'}\n` +
        `Butler: ${user?.settings?.butler?.enabled ? '✅' : '❌'}\n\n` +
        'Configure your preferences:',
        { 
          parse_mode: 'Markdown',
          reply_markup: keyboard 
        }
      );
    } catch (error) {
      console.error('Error showing settings menu:', error);
      await this.showErrorMessage(chatId, error, 'retry_settings');
    }
  }

  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const action = query.data;
    const userInfo = query.from;

    try {
      switch (action) {
        case 'slippage_settings':
          await this.showSlippageSettings(chatId, userInfo);
          return true;

        case 'autonomous_settings':
          await this.showAutonomousSettings(chatId, userInfo);
          return true;

        // Handle slippage adjustments for each network
        case 'adjust_eth_slippage':
        case 'adjust_base_slippage':
        case 'adjust_sol_slippage':
          const network = action.split('_')[1];
          await this.showSlippageInput(chatId, network, userInfo);
          return true;

        case 'toggle_autonomous':
          await this.toggleAutonomousTrading(chatId, userInfo);
          return true;

        // Previous cases remain...
      }
    } catch (error) {
      console.error('Error handling settings action:', error);
      await this.showErrorMessage(chatId, error, 'retry_settings');
    }
    return false;
  }

  async showSlippageSettings(chatId, userInfo) {
    const user = await User.findOne({ telegramId: userInfo.id.toString() }).lean();
    const keyboard = this.createKeyboard([
      [{ text: `ETH (${user?.settings?.trading?.slippage?.ethereum}%)`, callback_data: 'adjust_eth_slippage' }],
      [{ text: `Base (${user?.settings?.trading?.slippage?.base}%)`, callback_data: 'adjust_base_slippage' }],
      [{ text: `Solana (${user?.settings?.trading?.slippage?.solana}%)`, callback_data: 'adjust_sol_slippage' }],
      [{ text: '↩️ Back', callback_data: 'back_to_settings' }]
    ]);

    await this.bot.sendMessage(
      chatId,
      '*Slippage Settings* ⚙️\n\n' +
      'Adjust slippage tolerance for each network.\n' +
      'Current settings:\n\n' +
      `• Ethereum: ${user?.settings?.trading?.slippage?.ethereum}%\n` +
      `• Base: ${user?.settings?.trading?.slippage?.base}%\n` +
      `• Solana: ${user?.settings?.trading?.slippage?.solana}%\n\n` +
      'Select a network to adjust:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  async showAutonomousSettings(chatId, userInfo) {
    const user = await User.findOne({ telegramId: userInfo.id.toString() }).lean();
    const isEnabled = user?.settings?.trading?.autonomousEnabled;

    const keyboard = this.createKeyboard([
      [{ 
        text: isEnabled ? '🔴 Disable Autonomous Trading' : '🟢 Enable Autonomous Trading', 
        callback_data: 'toggle_autonomous' 
      }],
      [{ text: '↩️ Back', callback_data: 'back_to_settings' }]
    ]);

    await this.bot.sendMessage(
      chatId,
      '*Autonomous Trading Settings* 🤖\n\n' +
      'When enabled, AI will process voice commands and natural language for trading.\n\n' +
      `Current status: ${isEnabled ? '✅ Enabled' : '❌ Disabled'}\n\n` +
      'Select an action:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  async toggleAutonomousTrading(chatId, userInfo) {
    const user = await User.findOne({ telegramId: userInfo.id.toString() }).lean();
    const newState = !user?.settings?.trading?.autonomousEnabled;

    await User.updateOne(
      { telegramId: userInfo.id.toString() },
      { 
        $set: { 
          'settings.trading.autonomousEnabled': newState 
        } 
      }
    );

    await this.bot.sendMessage(
      chatId,
      `✅ Autonomous trading ${newState ? 'enabled' : 'disabled'} successfully!`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '↩️ Back', callback_data: 'autonomous_settings' }
          ]]
        }
      }
    );
  }

}