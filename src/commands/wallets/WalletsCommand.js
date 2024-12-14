import { Command } from '../base/Command.js';
import { User } from '../../models/User.js';
import { WalletDetailsHandler } from './handlers/WalletDetailsHandler.js';
import { SettingsHandler } from './handlers/WalletListHandler.js';
import { WalletCreationHandler } from './handlers/WalletCreationHandler.js';
import { WalletSettingsHandler } from './handlers/SettingsHandler.js';
import { ErrorHandler } from '../../core/errors/index.js';
import { circuitBreakers } from '../../core/circuit-breaker/index.js';
import { BREAKER_CONFIGS } from '../../core/circuit-breaker/index.js';
import { walletService } from '../../services/wallet/index.js';

export class WalletsCommand extends Command {
  constructor(bot) {
    super(bot);
    this.command = '/wallets';
    this.description = 'Manage wallets';
    this.pattern = /^(\/wallets|👛 Wallets)$/;

    // Initialize handlers
    this.detailsHandler = new WalletDetailsHandler(bot);
    this.listHandler = new SettingsHandler(bot);
    this.creationHandler = new WalletCreationHandler(bot);
    this.settingsHandler = new WalletSettingsHandler(bot);

    // Initialize wallet service
    this.initializeWalletService();
  }

  async initializeWalletService() {
    try {
      if (!walletService.isInitialized) {
        await walletService.initialize();
      }
    } catch (error) {
      console.error('Failed to initialize wallet service:', error);
    }
  }

  async execute(msg) {
    return circuitBreakers.executeWithBreaker(
      'wallets',
      async () => {
        const chatId = msg.chat.id;
        try {
          await this.showWalletsMenu(chatId, msg.from);
        } catch (error) {
          await ErrorHandler.handle(error, this.bot, chatId);
        }
      },
      BREAKER_CONFIGS.botErrors
    );
  }

  async handleCallback(query) {
    return circuitBreakers.executeWithBreaker(
      'wallets',
      async () => {
        const chatId = query.message.chat.id;
        const action = query.data;
        const userInfo = query.from;

        console.log('Processing wallet callback:', action);

        try {
          switch (action) {
            case 'view_wallets':
              await this.listHandler.showWalletList(chatId, userInfo, this.showLoadingMessage.bind(this));
              return true;

            case 'create_wallet':
              await this.creationHandler.showNetworkSelection(chatId, userInfo);
              return true;

            case 'wallet_settings':
              await this.settingsHandler.showWalletSettings(chatId, userInfo);
              return true;

            case 'slippage_settings':
              await this.settingsHandler.showSlippageSettings(chatId, userInfo);
              return true;

            case 'back_to_wallets':
              await this.showWalletsMenu(chatId, userInfo);
              return true;

            case 'toggle_autonomous':
              await this.settingsHandler.toggleAutonomousTrading(chatId, userInfo);
              return true;

            default:
              if (action.startsWith('select_network_')) {
                const network = action.replace('select_network_', '');
                await this.creationHandler.createWallet(chatId, userInfo, network, this.showLoadingMessage.bind(this));
                return true;
              }
              
              if (action.startsWith('wallet_')) {
                const address = action.replace('wallet_', '');
                await this.detailsHandler.showWalletDetails(chatId, userInfo, address, this.showLoadingMessage.bind(this));
                return true;
              }
              
              if (action.startsWith('set_autonomous_')) {
                const address = action.replace('set_autonomous_', '');
                await this.detailsHandler.setAutonomousWallet(chatId, userInfo, address, this.showLoadingMessage.bind(this));
                return true;
              }

              if (action.startsWith('adjust_') && action.endsWith('_slippage')) {
                const network = action.replace('adjust_', '').replace('_slippage', '');
                await this.settingsHandler.handleSlippageAdjustment(chatId, userInfo, network);
                return true;
              }

              return false;
          }
        } catch (error) {
          await ErrorHandler.handle(error, this.bot, chatId);
          return false;
        }
      },
      BREAKER_CONFIGS.botErrors
    );
  }

  async showWalletsMenu(chatId, userInfo) {
    const keyboard = this.createKeyboard([
      [{ text: '👛 View Wallets', callback_data: 'view_wallets' }],
      [{ text: '➕ Create Wallet', callback_data: 'create_wallet' }],
      [{ text: '⚙️ Wallet Settings', callback_data: 'wallet_settings' }],
      [{ text: '↩️ Back to Menu', callback_data: '/start' }],
    ]);

    await this.bot.sendMessage(
      chatId,
      '*Wallet Management* 👛\n\n' +
        'Choose an option:\n\n' +
        '• View your wallets\n' +
        '• Create a new wallet\n' +
        '• Configure settings',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
  }
}