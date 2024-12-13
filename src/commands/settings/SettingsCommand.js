import { Command } from '../base/Command.js';
import { User } from '../../models/User.js';
import { networkState } from '../../services/networkState.js';
import { ErrorHandler } from '../../core/errors/index.js';

export class SettingsCommand extends Command {
  constructor(bot, eventHandler) {
    super(bot, eventHandler);
    this.command = '/settings';
    this.description = 'Configure bot settings';
    this.pattern = /^(\/settings|⚙️ Settings)$/;

    this.eventHandler = eventHandler;
    this.registerCallbacks();
  }

  registerCallbacks() {
    this.eventHandler.on('slippage_settings', async (query) => this.showSlippageSettings(query.message.chat.id, query.from));
    this.eventHandler.on('autonomous_settings', async (query) => this.showAutonomousSettings(query.message.chat.id, query.from));
    this.eventHandler.on('toggle_autonomous', async (query) => this.toggleAutonomousTrading(query.message.chat.id, query.from));
    this.eventHandler.on('back_to_settings', async (query) => this.showSettingsMenu(query.message.chat.id, query.from));

    // Slippage adjustments for each network
    ['adjust_eth_slippage', 'adjust_base_slippage', 'adjust_sol_slippage'].forEach((action) => {
      this.eventHandler.on(action, async (query) => {
        const network = action.split('_')[1];
        await this.showSlippageInput(query.message.chat.id, network, query.from);
      });
    });
  }

  async execute(msg) {
    const chatId = msg.chat.id;
    try {
      await this.showSettingsMenu(chatId, msg.from);
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }

  async showSettingsMenu(chatId, userInfo) {
    try {
      const user = await User.findOne({ telegramId: userInfo.id.toString() }).lean();
      const currentNetwork = await networkState.getCurrentNetwork(userInfo.id);

      const keyboard = this.createKeyboard([
        [{ text: '🔄 Switch Network', callback_data: 'switch_network' }],
        [{ text: '⚙️ Slippage Settings', callback_data: 'slippage_settings' }],
        [{ text: '🤖 Autonomous Trading', callback_data: 'autonomous_settings' }],
        [{ text: '🔔 Notification Settings', callback_data: 'notification_settings' }],
        [{ text: '🫅 Butler Assistant', callback_data: 'butler_assistant' }],
        [{ text: '↩️ Back to Menu', callback_data: '/start' }],
      ]);

      await this.bot.sendMessage(
        chatId,
        `*Settings* ⚙️\n\n` +
          `Current Network: *${networkState.getNetworkDisplay(currentNetwork)}*\n` +
          `Slippage: ${user?.settings?.trading?.slippage?.[currentNetwork]}%\n` +
          `Autonomous Trading: ${user?.settings?.trading?.autonomousEnabled ? '✅' : '❌'}\n` +
          `Notifications: ${user?.settings?.notifications?.enabled ? '✅' : '❌'}\n` +
          `Butler: ${user?.settings?.butler?.enabled ? '✅' : '❌'}\n\n` +
          'Configure your preferences:',
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        }
      );
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }

  async showSlippageSettings(chatId, userInfo) {
    try {
      const user = await User.findOne({ telegramId: userInfo.id.toString() }).lean();
      const slippage = user?.settings?.trading?.slippage || {};

      const keyboard = this.createKeyboard([
        [{ text: `ETH (${slippage.ethereum || 3}%)`, callback_data: 'adjust_eth_slippage' }],
        [{ text: `Base (${slippage.base || 3}%)`, callback_data: 'adjust_base_slippage' }],
        [{ text: `Solana (${slippage.solana || 3}%)`, callback_data: 'adjust_sol_slippage' }],
        [{ text: '↩️ Back', callback_data: 'back_to_settings' }],
      ]);

      await this.bot.sendMessage(
        chatId,
        '*Slippage Settings* ⚙️\n\n' +
          'Adjust slippage tolerance for each network.\n' +
          `Current settings:\n\n` +
          `• Ethereum: ${slippage.ethereum || 3}%\n` +
          `• Base: ${slippage.base || 3}%\n` +
          `• Solana: ${slippage.solana || 3}%\n\n` +
          'Select a network to adjust:',
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        }
      );
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }

  async showAutonomousSettings(chatId, userInfo) {
    try {
      const user = await User.findOne({ telegramId: userInfo.id.toString() }).lean();
      const isEnabled = user?.settings?.trading?.autonomousEnabled;

      const keyboard = this.createKeyboard([
        [
          {
            text: isEnabled ? '🔴 Disable Autonomous Trading' : '🟢 Enable Autonomous Trading',
            callback_data: 'toggle_autonomous',
          },
        ],
        [{ text: '↩️ Back', callback_data: 'back_to_settings' }],
      ]);

      await this.bot.sendMessage(
        chatId,
        '*Autonomous Trading Settings* 🤖\n\n' +
          'When enabled, AI will process voice commands and natural language for trading.\n\n' +
          `Current status: ${isEnabled ? '✅ Enabled' : '❌ Disabled'}\n\n` +
          'Select an action:',
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        }
      );
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }

  async toggleAutonomousTrading(chatId, userInfo) {
    try {
      const user = await User.findOne({ telegramId: userInfo.id.toString() }).lean();
      const newState = !user?.settings?.trading?.autonomousEnabled;

      await User.updateOne(
        { telegramId: userInfo.id.toString() },
        {
          $set: {
            'settings.trading.autonomousEnabled': newState,
          },
        }
      );

      await this.bot.sendMessage(
        chatId,
        `✅ Autonomous trading ${newState ? 'enabled' : 'disabled'} successfully!`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '↩️ Back', callback_data: 'autonomous_settings' }]],
          },
        }
      );
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }

  async showSlippageInput(chatId, network, userInfo) {
    try {
      await this.setState(userInfo.id, USER_STATES.WAITING_SLIPPAGE_INPUT);
      await this.setUserData(userInfo.id, { pendingSlippage: { network } });

      await this.bot.sendMessage(
        chatId,
        '*Enter New Slippage* ⚙️\n\n' +
          'Enter a number between 0.1 and 50:',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'slippage_settings' }]],
          },
        }
      );
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }
}
