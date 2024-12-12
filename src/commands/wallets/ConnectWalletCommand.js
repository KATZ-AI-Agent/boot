import { Command } from '../base/Command.js';
import { walletConnectService } from '../../services/wallet/WalletConnect.js';

export class ConnectWalletCommand extends Command {
  constructor(bot) {
    super(bot);
    this.command = '/connectwallet';
    this.description = 'Connect external wallet';
    this.pattern = /^(\/connectwallet|🔗 Connect Wallet)$/;
  }

  async execute(msg) {
    const chatId = msg.chat.id;
    await this.showConnectOptions(chatId, msg.from);
  }

  async showConnectOptions(chatId, userInfo) {
    const keyboard = this.createKeyboard([
      [{ text: '🔗 Connect with Reown', callback_data: 'connect_wallet' }],
      [{ text: '❌ Cancel', callback_data: 'back_to_wallets' }],
    ]);

    await this.bot.sendMessage(
      chatId,
      '*Connect External Wallet* 🔗\n\n' +
        'Connect your existing wallet:\n\n' +
        '• MetaMask\n' +
        '• Trust Wallet\n' +
        '• Solana-Compatible Wallets\n' +
        '• Any Reown-compatible wallet\n\n' +
        'Choose your connection method:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
  }

  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const action = query.data;
    const userInfo = query.from;

    try {
      switch (action) {
        case 'connect_wallet':
          await this.initiateWalletConnect(chatId, userInfo);
          return true;

        case 'disconnect_wallet':
          await this.disconnectWallet(chatId, userInfo);
          return true;
      }
    } catch (error) {
      console.error('Error handling wallet connect action:', error);
      await this.showErrorMessage(chatId, error, 'retry_connect');
    }
    return false;
  }

  async initiateWalletConnect(chatId, userInfo) {
    const loadingMsg = await this.showLoadingMessage(chatId, '🔗 Initiating connection...');

    try {
      // Initialize WalletConnect if not already initialized
      if (!walletConnectService.signClient || !walletConnectService.walletModal) {
        await walletConnectService.initializeWalletConnect();
      }

      // Trigger connection
      const session = await walletConnectService.createConnection(userInfo.id);

      await this.bot.deleteMessage(chatId, loadingMsg.message_id);

      // Set up connection listener
      walletConnectService.once('connected', async ({ address, network }) => {
        await this.bot.sendMessage(
          chatId,
          '✅ *Wallet Connected Successfully!*\n\n' +
            `Address: \`${address}\`\n` +
            `Network: ${network}\n\n` +
            'Your wallet is now connected and can be used for trading.',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '👛 View Wallets', callback_data: 'view_wallets' }],
                [{ text: '🔄 Disconnect', callback_data: 'disconnect_wallet' }],
              ],
            },
          }
        );
      });

      console.log(`Reown session established for user ${userInfo.id}.`);
    } catch (error) {
      console.error('Error initiating wallet connection:', error);
      if (loadingMsg) {
        await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      }
      await this.showErrorMessage(chatId, error, 'retry_connect');
    }
  }

  async disconnectWallet(chatId, userInfo) {
    const loadingMsg = await this.showLoadingMessage(chatId, '🔄 Disconnecting wallet...');

    try {
      await walletConnectService.disconnect(userInfo.id);

      await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      await this.bot.sendMessage(
        chatId,
        '✅ Wallet disconnected successfully!',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔗 Connect Another', callback_data: 'connect_wallet' }],
              [{ text: '↩️ Back', callback_data: 'back_to_wallets' }],
            ],
          },
        }
      );
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
      if (loadingMsg) {
        await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      }
      await this.showErrorMessage(chatId, error, 'retry_disconnect');
    }
  }
}
