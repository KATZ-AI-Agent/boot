import { Command } from '../base/Command.js';
import { walletService } from '../../services/wallet/index.js';
import { networkService } from '../../services/network/index.js';
import { walletConnectService } from '../../services/wallet/WalletConnect.js';
import { User } from '../../models/User.js';
import { USER_STATES } from '../../core/constants.js';

export class WalletsCommand extends Command {
  constructor(bot) {
    super(bot);
    this.command = '/wallets';
    this.description = 'Manage wallets';
    this.pattern = /^(\/wallets|👛 Wallets)$/;
  }

  async execute(msg) {
    const chatId = msg.chat.id;
    await this.showWalletsMenu(chatId, msg.from);
  }

  async showWalletsMenu(chatId, userInfo) {
    const keyboard = this.createKeyboard([
      [{ text: '👛 View Wallets', callback_data: 'view_wallets' }],
      [{ text: '➕ Create Wallet', callback_data: 'create_wallet' }],
      [{ text: '🔗 Connect External Wallet', callback_data: 'connect_wallet' }],
      [{ text: '⚙️ Wallet Settings', callback_data: 'wallet_settings' }],
      [{ text: '↩️ Back to Menu', callback_data: '/start' }]
    ]);

    await this.bot.sendMessage(
      chatId,
      '*Wallet Management* 👛\n\n' +
      'Choose an option:\n\n' +
      '• View your wallets\n' +
      '• Create new wallet\n' +
      '• Connect external wallet\n' +
      '• Configure settings',
      { 
        parse_mode: 'Markdown',
        reply_markup: keyboard 
      }
    );
  }

  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const action = query.data;
    const userInfo = query.from;

    try {
      switch (action) {
        case 'view_wallets':
          await this.showWalletList(chatId, userInfo);
          return true;

        case 'create_wallet':
          await this.showNetworkSelection(chatId, userInfo);
          return true;

        case 'wallet_settings':
          await this.showWalletSettings(chatId, userInfo);
          return true;

        case 'toggle_autonomous':
          await this.toggleAutonomousTrading(chatId, userInfo);
          return true;

        case 'slippage_settings':
          await this.showSlippageSettings(chatId, userInfo);
          return true;

        case 'adjust_eth_slippage':
        case 'adjust_base_slippage':
        case 'adjust_sol_slippage':
          const network = action.split('_')[1];
          await this.showSlippageInput(chatId, network, userInfo);
          return true;

        case 'back_to_wallets':
          await this.showWalletsMenu(chatId, userInfo);
          return true;

        default:
          if (action.startsWith('select_network_')) {
            const network = action.replace('select_network_', '');
            await this.createWallet(chatId, userInfo, network);
            return true;
          }
          if (action.startsWith('wallet_')) {
            const address = action.replace('wallet_', '');
            await this.showWalletDetails(chatId, userInfo, address);
            return true;
          }
          if (action.startsWith('set_autonomous_')) {
            const address = action.replace('set_autonomous_', '');
            await this.setAutonomousWallet(chatId, userInfo, address);
            return true;
          }
      }
    } catch (error) {
      console.error('Error handling wallet action:', error);
      await this.showErrorMessage(chatId, error, 'retry_wallets');
    }
    return false;
  }

  async showWalletList(chatId, userInfo) {
    const wallets = await walletService.getWallets(userInfo.id);
    const currentNetwork = await networkService.getCurrentNetwork(userInfo.id);
    const networkWallets = wallets.filter(w => w.network === currentNetwork);

    if (networkWallets.length === 0) {
      await this.showEmptyWalletMessage(chatId, currentNetwork);
      return;
    }

    const keyboard = this.createKeyboard([
      ...networkWallets.map(wallet => [{
        text: `${wallet.type === 'walletconnect' ? '🔗' : '👛'} ${this.formatWalletAddress(wallet.address)}`,
        callback_data: `wallet_${wallet.address}`
      }]),
      [{ text: '🌐 Switch Network', callback_data: 'switch_network' }],
      [{ text: '↩️ Back', callback_data: 'back_to_wallets' }]
    ]);

    await this.bot.sendMessage(
      chatId,
      `*Your ${networkService.getNetworkDisplay(currentNetwork)} Wallets* 👛\n\n` +
      'Select a wallet to view details:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  async showWalletDetails(chatId, userInfo, address) {
    const wallet = await walletService.getWallet(userInfo.id, address);
    const balance = await walletService.getBalance(userInfo.id, address);
    const isAutonomous = await this.isAutonomousWallet(userInfo.id, wallet.network, address);

    const keyboard = this.createKeyboard([
      [{
        text: isAutonomous ? '🔴 Remove Autonomous' : '🟢 Set as Autonomous',
        callback_data: `set_autonomous_${address}`
      }],
      [
        { text: '💰 View Tokens', callback_data: `tokens_${address}` },
        { text: '📤 Transfer', callback_data: `transfer_${address}` }
      ],
      [{ text: '↩️ Back', callback_data: 'view_wallets' }]
    ]);

    await this.bot.sendMessage(
      chatId,
      '*Wallet Details* 👛\n\n' +
      `Network: ${networkService.getNetworkDisplay(wallet.network)}\n` +
      `Address: \`${address}\`\n` +
      `Balance: ${balance}\n` +
      `Type: ${wallet.type === 'walletconnect' ? 'External 🔗' : 'Internal 👛'}\n` +
      `Autonomous: ${isAutonomous ? '✅' : '❌'}`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  async showNetworkSelection(chatId, userInfo) {
    const keyboard = this.createKeyboard([
      [{ text: 'Ethereum', callback_data: 'select_network_ethereum' }],
      [{ text: 'Base', callback_data: 'select_network_base' }],
      [{ text: 'Solana', callback_data: 'select_network_solana' }],
      [{ text: '↩️ Back', callback_data: 'back_to_wallets' }]
    ]);

    await this.bot.sendMessage(
      chatId,
      '*Select Network* 🌐\n\n' +
      'Choose a network for your new wallet:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  async createWallet(chatId, userInfo, network) {
    const loadingMsg = await this.showLoadingMessage(chatId, '🔐 Creating secure wallet...');

    try {
      const wallet = await walletService.createWallet(userInfo.id, network);
      
      await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      await this.bot.sendMessage(
        chatId,
        '✅ *Wallet Created Successfully!*\n\n' +
        `Network: ${networkService.getNetworkDisplay(network)}\n` +
        `Address: \`${wallet.address}\`\n\n` +
        '_Store your recovery phrase in a safe place!_\n\n' +
        `Recovery Phrase: \`${wallet.mnemonic}\``,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '👛 View Wallets', callback_data: 'view_wallets' },
              { text: '↩️ Back', callback_data: 'back_to_wallets' }
            ]]
          }
        }
      );
    } catch (error) {
      console.error('Error creating wallet:', error);
      if (loadingMsg) {
        await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      }
      await this.showErrorMessage(chatId, error, 'retry_create_wallet');
    }
  }

  async showWalletSettings(chatId, userInfo) {
    const user = await User.findOne({ telegramId: userInfo.id.toString() }).lean();
    const isAutonomousEnabled = user?.settings?.trading?.autonomousEnabled;

    const keyboard = this.createKeyboard([
      [{
        text: `${isAutonomousEnabled ? '🔴 Disable' : '🟢 Enable'} Autonomous Trading`,
        callback_data: 'toggle_autonomous'
      }],
      [{ text: '⚙️ Adjust Slippage', callback_data: 'slippage_settings' }],
      [{ text: '↩️ Back', callback_data: 'back_to_wallets' }]
    ]);

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
  }

  async toggleAutonomousTrading(chatId, userInfo) {
    try {
      const user = await User.findOne({ telegramId: userInfo.id.toString() }).lean();
      const newState = !user.settings.trading.autonomousEnabled;

      await User.updateOne(
        { telegramId: userInfo.id.toString() },
        { $set: { 'settings.trading.autonomousEnabled': newState } }
      );

      await this.bot.sendMessage(
        chatId,
        `✅ Autonomous trading ${newState ? 'enabled' : 'disabled'} successfully!`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '↩️ Back to Settings', callback_data: 'wallet_settings' }
            ]]
          }
        }
      );
    } catch (error) {
      console.error('Error toggling autonomous trading:', error);
      await this.showErrorMessage(chatId, error, 'retry_toggle');
    }
  }

  async showSlippageSettings(chatId, userInfo) {
    const user = await User.findOne({ telegramId: userInfo.id.toString() }).lean();
    const slippage = user?.settings?.trading?.slippage || {
      ethereum: 3,
      base: 3,
      solana: 3
    };

    const keyboard = this.createKeyboard([
      [{ text: `ETH (${slippage.ethereum}%)`, callback_data: 'adjust_eth_slippage' }],
      [{ text: `Base (${slippage.base}%)`, callback_data: 'adjust_base_slippage' }],
      [{ text: `Solana (${slippage.solana}%)`, callback_data: 'adjust_sol_slippage' }],
      [{ text: '↩️ Back', callback_data: 'wallet_settings' }]
    ]);

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
  }

  async showSlippageInput(chatId, network, userInfo) {
    await this.setState(userInfo.id, USER_STATES.WAITING_SLIPPAGE_INPUT);
    await this.setUserData(userInfo.id, { pendingSlippage: { network } });

    await this.bot.sendMessage(
      chatId,
      '*Enter New Slippage* ⚙️\n\n' +
      'Enter a number between 0.1 and 50:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '❌ Cancel', callback_data: 'slippage_settings' }
          ]]
        }
      }
    );
  }

  async handleInput(msg) {
    const chatId = msg.chat.id;
    const state = await this.getState(msg.from.id);

    if (state === USER_STATES.WAITING_SLIPPAGE_INPUT && msg.text) {
      await this.handleSlippageInput(chatId, msg.text, msg.from);
      return true;
    }

    return false;
  }

  async handleSlippageInput(chatId, input, userInfo) {
    const slippage = parseFloat(input);
    if (isNaN(slippage) || slippage < 0.1 || slippage > 50) {
      await this.bot.sendMessage(
        chatId,
        '❌ Invalid slippage value. Please enter a number between 0.1 and 50:',
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '❌ Cancel', callback_data: 'slippage_settings' }
            ]]
          }
        }
      );
      return;
    }

    try {
      const userData = await this.getUserData(userInfo.id);
      const network = userData.pendingSlippage.network;

      await User.updateOne(
        { telegramId: userInfo.id.toString() },
        { $set: { [`settings.trading.slippage.${network}`]: slippage } }
      );

      await this.clearState(userInfo.id);
      await this.showSlippageSettings(chatId, userInfo);
    } catch (error) {
      console.error('Error updating slippage:', error);
      await this.showErrorMessage(chatId, error, 'retry_slippage');
    }
  }

  async setAutonomousWallet(chatId, userInfo, address) {
    try {
      const wallet = await walletService.getWallet(userInfo.id, address);
      await walletService.setAutonomousWallet(userInfo.id, wallet.network, address);

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
      console.error('Error setting autonomous wallet:', error);
      await this.showErrorMessage(chatId, error, 'retry_autonomous');
    }
  }

  async isAutonomousWallet(userId, network, address) {
    const user = await User.findOne({ telegramId: userId.toString() }).lean();
    const wallet = user?.wallets[network]?.find(w => w.address === address);
    return wallet?.isAutonomous || false;
  }

  formatWalletAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
}