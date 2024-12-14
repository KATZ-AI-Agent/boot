import { Command } from '../base/Command.js';
import { walletService } from '../../services/wallet/index.js';
import { networkState } from '../../services/networkState.js';
import { walletConnectService } from '../../services/wallet/WalletConnect.js';
import { ErrorHandler } from '../../core/errors/index.js';
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
        try {
            await this.showWalletsMenu(chatId, msg.from);
        } catch (error) {
            await ErrorHandler.handle(error, this.bot, chatId);
        }
    }

    async handleCallback(query) {
        const chatId = query.message.chat.id;
        const action = query.data;
        const userInfo = query.from;
        
        console.log('Received callback action:', action); // Debugging log
        try {
            switch (true) {
                case action === 'view_wallets':
                    await this.showWalletList(chatId, userInfo);
                    break;
                case action === 'create_wallet':
                    await this.showNetworkSelection(chatId, userInfo);
                    break;
                case action === 'wallet_settings':
                    await this.showWalletSettings(chatId, userInfo);
                    break;
                case action === 'connect_wallet':
                    await this.handleConnectWallet(chatId, userInfo);
                    break;
                case action === 'back_to_wallets':
                    await this.showWalletsMenu(chatId, userInfo);
                    break;
                case action.startsWith('select_network_'):
                    const network = action.replace('select_network_', '');
                    await this.createWallet(chatId, userInfo, network);
                    break;
                case action.startsWith('wallet_'):
                    const address = action.replace('wallet_', '');
                    await this.showWalletDetails(chatId, userInfo, address);
                    break;
                case action.startsWith('set_autonomous_'):
                    const autonomousAddress = action.replace('set_autonomous_', '');
                    await this.setAutonomousWallet(chatId, userInfo, autonomousAddress);
                    break;
                case action === 'slippage_settings':
                    await this.showSlippageSettings(chatId, userInfo);
                    break;
                case action.startsWith('adjust_'):
                    const slippageNetwork = action.replace('adjust_', '').replace('_slippage', '');
                    await this.showSlippageInput(chatId, slippageNetwork, userInfo);
                    break;
                default:
                    console.log('Unrecognized callback action:', action);
            }
        } catch (error) {
            await ErrorHandler.handle(error, this.bot, chatId);
        }
    }

    async showWalletsMenu(chatId, userInfo) {
        const keyboard = this.createKeyboard([
            [{ text: '👛 View Wallets', callback_data: 'view_wallets' }],
            [{ text: '➕ Create Wallet', callback_data: 'create_wallet' }],
            [{ text: '🔗 Connect External Wallet', callback_data: 'connect_wallet' }],
            [{ text: '⚙️ Wallet Settings', callback_data: 'wallet_settings' }],
            [{ text: '↩️ Back to Menu', callback_data: '/start' }],
        ]);

        await this.bot.sendMessage(
            chatId,
            '*Wallet Management* 👛\n\n' +
                'Choose an option:\n\n' +
                '• View your wallets\n' +
                '• Create a new wallet\n' +
                '• Connect external wallet\n' +
                '• Configure settings',
            {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
            }
        );
    }

    async showWalletList(chatId, userInfo) {
        try {
            const wallets = await walletService.getWallets(userInfo.id);
            const currentNetwork = await networkState.getCurrentNetwork(userInfo.id);
            const networkWallets = wallets.filter((w) => w.network === currentNetwork);

            if (networkWallets.length === 0) {
                await this.bot.sendMessage(
                    chatId,
                    `*No Wallets Found* ❌\n\nYou don’t have any wallets on ${networkState.getNetworkDisplay(currentNetwork)}.\n\nCreate one now or switch networks.`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: this.createKeyboard([
                            [{ text: '➕ Create Wallet', callback_data: 'create_wallet' }],
                            [{ text: '🌐 Switch Network', callback_data: 'switch_network' }],
                            [{ text: '↩️ Back', callback_data: 'back_to_wallets' }],
                        ]),
                    }
                );
                return;
            }

            const keyboard = this.createKeyboard([
                ...networkWallets.map((wallet) => [
                    {
                        text: `${wallet.type === 'walletconnect' ? '🔗' : '👛'} ${this.formatWalletAddress(wallet.address)}`,
                        callback_data: `wallet_${wallet.address}`,
                    },
                ]),
                [{ text: '🌐 Switch Network', callback_data: 'switch_network' }],
                [{ text: '↩️ Back', callback_data: 'back_to_wallets' }],
            ]);

            await this.bot.sendMessage(
                chatId,
                `*Your ${networkState.getNetworkDisplay(currentNetwork)} Wallets* 👛\n\nSelect a wallet to view details:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard,
                }
            );
        } catch (error) {
            throw error;
        }
    }

    async showWalletDetails(chatId, userInfo, address) {
      try {
          const wallet = await walletService.getWallet(userInfo.id, address);
          const balance = await walletService.getBalance(userInfo.id, address);
          const isAutonomous = await this.isAutonomousWallet(userInfo.id, wallet.network, address);
  
          const keyboard = this.createKeyboard([
              [
                  {
                      text: isAutonomous ? '🔴 Remove Autonomous' : '🟢 Set as Autonomous',
                      callback_data: `set_autonomous_${address}`,
                  },
              ],
              [{ text: '↩️ Back', callback_data: 'view_wallets' }],
          ]);
  
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
                  reply_markup: keyboard,
              }
          );
      } catch (error) {
          throw error;
      }
  }
  
  async showNetworkSelection(chatId, userInfo) {
      try {
          const currentNetwork = await networkState.getCurrentNetwork(userInfo.id);
          const networks = ['ethereum', 'base', 'solana'];
  
          const keyboard = this.createKeyboard([
              ...networks.map((network) => [
                  {
                      text: network === currentNetwork
                          ? `${networkState.getNetworkDisplay(network)} ✓`
                          : networkState.getNetworkDisplay(network),
                      callback_data: `select_network_${network}`,
                  },
              ]),
              [{ text: '↩️ Back', callback_data: 'back_to_wallets' }],
          ]);
  
          await this.bot.sendMessage(
              chatId,
              '*Select Network* 🌐\n\nChoose the network for your new wallet:',
              {
                  parse_mode: 'Markdown',
                  reply_markup: keyboard,
              }
          );
      } catch (error) {
          throw error;
      }
  }
  
  async createWallet(chatId, userInfo, network) {
      try {
          const loadingMsg = await this.showLoadingMessage(chatId, '🔐 Creating your wallet...');
          const wallet = await walletService.createWallet(userInfo.id, network);
  
          await this.bot.deleteMessage(chatId, loadingMsg.message_id);
          await this.bot.sendMessage(
              chatId,
              `✅ Wallet created successfully!\n\nNetwork: ${networkState.getNetworkDisplay(network)}\nAddress: \`${wallet.address}\``,
              {
                  parse_mode: 'Markdown',
                  reply_markup: {
                      inline_keyboard: [
                          [{ text: '👛 View Wallets', callback_data: 'view_wallets' }],
                          [{ text: '↩️ Back', callback_data: 'back_to_wallets' }],
                      ],
                  },
              }
          );
      } catch (error) {
          throw error;
      }
  }
  
  async handleConnectWallet(chatId, userInfo) {
      try {
          await walletConnectService.initializeWalletConnect();
          const session = await walletConnectService.createConnection(userInfo.id);
  
          await this.bot.sendMessage(
              chatId,
              '🔗 *Connect Your Wallet*\n\nPlease approve the connection request in your wallet.',
              {
                  parse_mode: 'Markdown',
                  reply_markup: {
                      inline_keyboard: [[{ text: '↩️ Cancel', callback_data: 'back_to_wallets' }]],
                  },
              }
          );
      } catch (error) {
          throw error;
      }
  }
  
  async showWalletSettings(chatId, userInfo) {
      try {
          const user = await User.findOne({ telegramId: userInfo.id.toString() }).lean();
          const isAutonomousEnabled = user?.settings?.trading?.autonomousEnabled;
  
          const keyboard = this.createKeyboard([
              [
                  {
                      text: `${isAutonomousEnabled ? '🔴 Disable' : '🟢 Enable'} Autonomous Trading`,
                      callback_data: 'toggle_autonomous',
                  },
              ],
              [{ text: '⚙️ Adjust Slippage', callback_data: 'slippage_settings' }],
              [{ text: '↩️ Back', callback_data: 'back_to_wallets' }],
          ]);
  
          await this.bot.sendMessage(
              chatId,
              '*Wallet Settings* ⚙️\n\n' +
                  `Autonomous Trading: ${isAutonomousEnabled ? '✅' : '❌'}\n\nConfigure your wallet settings:`,
              {
                  parse_mode: 'Markdown',
                  reply_markup: keyboard,
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
              solana: 3,
          };
  
          const keyboard = this.createKeyboard([
              [{ text: `ETH (${slippage.ethereum}%)`, callback_data: 'adjust_eth_slippage' }],
              [{ text: `Base (${slippage.base}%)`, callback_data: 'adjust_base_slippage' }],
              [{ text: `Solana (${slippage.solana}%)`, callback_data: 'adjust_sol_slippage' }],
              [{ text: '↩️ Back', callback_data: 'wallet_settings' }],
          ]);
  
          await this.bot.sendMessage(
              chatId,
              '*Slippage Settings* ⚙️\n\n' +
                  `Current slippage tolerance:\n\n` +
                  `• Ethereum: ${slippage.ethereum}%\n` +
                  `• Base: ${slippage.base}%\n` +
                  `• Solana: ${slippage.solana}%\n\nSelect a network to adjust:`,
              {
                  parse_mode: 'Markdown',
                  reply_markup: keyboard,
              }
          );
      } catch (error) {
          throw error;
      }
  }
  
  async showSlippageInput(chatId, network, userInfo) {
      try {
          await this.setState(userInfo.id, USER_STATES.WAITING_SLIPPAGE_INPUT);
          await this.setUserData(userInfo.id, { pendingSlippage: { network } });
  
          await this.bot.sendMessage(
              chatId,
              '*Enter New Slippage* ⚙️\n\nEnter a number between 0.1 and 50:',
              {
                  parse_mode: 'Markdown',
                  reply_markup: {
                      inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'slippage_settings' }]],
                  },
              }
          );
      } catch (error) {
          throw error;
      }
  }
  
  async handleSlippageInput(chatId, input, userInfo) {
      const slippage = parseFloat(input);
      if (isNaN(slippage) || slippage < 0.1 || slippage > 50) {
          await this.bot.sendMessage(
              chatId,
              '❌ Invalid slippage value. Please enter a number between 0.1 and 50:',
              {
                  reply_markup: {
                      inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'slippage_settings' }]],
                  },
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
          throw error;
      }
  }
  
  async setAutonomousWallet(chatId, userInfo, address) {
      try {
          await walletService.setAutonomousWallet(userInfo.id, address);
          await this.bot.sendMessage(chatId, '✅ Autonomous wallet updated successfully!', {
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '👛 View Wallet', callback_data: `wallet_${address}` }],
                      [{ text: '↩️ Back', callback_data: 'view_wallets' }],
                  ],
              },
          });
      } catch (error) {
          throw error;
      }
  }
  
  async isAutonomousWallet(userId, network, address) {
      try {
          const user = await User.findOne({ telegramId: userId.toString() }).lean();
          const wallet = user?.wallets[network]?.find((w) => w.address === address);
          return wallet?.isAutonomous || false;
      } catch (error) {
          throw error;
      }
  }
  
  formatWalletAddress(address) {
      return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
  
  async showLoadingMessage(chatId, text) {
      return await this.bot.sendMessage(chatId, text);
  }  
}
