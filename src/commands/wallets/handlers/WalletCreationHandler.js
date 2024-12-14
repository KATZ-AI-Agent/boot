import { ErrorHandler } from '../../../core/errors/index.js';
import { walletService } from '../../../services/wallet/index.js';
import { networkState } from '../../../services/networkState.js';

export class WalletCreationHandler {
  constructor(bot) {
    this.bot = bot;
  }

  async showNetworkSelection(chatId, userInfo) {
    const currentNetwork = await networkState.getCurrentNetwork(userInfo.id);
    const networks = ['ethereum', 'base', 'solana'];

    const keyboard = {
      inline_keyboard: [
        ...networks.map(network => [{
          text: network === currentNetwork ? 
            `${networkState.getNetworkDisplay(network)} ✓` : 
            networkState.getNetworkDisplay(network),
          callback_data: `select_network_${network}`
        }]),
        [{ text: '↩️ Back', callback_data: 'back_to_wallets' }]
      ]
    };

    await this.bot.sendMessage(
      chatId,
      '*Select Network* 🌐\n\nChoose the network for your new wallet:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  async createWallet(chatId, userInfo, network, showLoadingMessage) {
    const loadingMsg = await showLoadingMessage(chatId, '🔐 Creating your wallet...');

    try {
      const wallet = await walletService.createWallet(userInfo.id, network);
      
      await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      await this.bot.sendMessage(
        chatId,
        `✅ Wallet created successfully!\n\n` +
        `Network: ${networkState.getNetworkDisplay(network)}\n` +
        `Address: \`${wallet.address}\``,
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
      if (loadingMsg) {
        await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      }
      throw error;
    }
  }
}