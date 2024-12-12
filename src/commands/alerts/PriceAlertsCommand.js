import { Command } from '../base/Command.js';
import { PriceAlert } from '../../models/PriceAlert.js';
import { tradingService } from '../../services/trading/index.js';
import { networkService } from '../../services/network/index.js';
import { dextools } from '../../services/dextools/index.js';
import { walletService } from '../../services/wallet/index.js';
import { User } from '../../models/User.js';
import { USER_STATES } from '../../core/constants.js';

export class PriceAlertsCommand extends Command {
  constructor(bot) {
    super(bot);
    this.command = '/pricealerts';
    this.description = 'Set price alerts';
    this.pattern = /^(\/pricealerts|💰 Price Alerts)$/;
  }

  async execute(msg) {
    const chatId = msg.chat.id;
    await this.showPriceAlertsMenu(chatId, msg.from);
  }

  async showPriceAlertsMenu(chatId, userInfo) {
    const keyboard = this.createKeyboard([
      [{ text: '➕ Create Alert', callback_data: 'create_price_alert' }],
      [{ text: '📋 View Alerts', callback_data: 'view_price_alerts' }],
      [{ text: '↩️ Back', callback_data: 'back_to_notifications' }]
    ]);

    await this.bot.sendMessage(
      chatId,
      '*Price Alerts* 🔔\n\n' +
      'Create and manage price alerts:\n\n' +
      '• Set target prices\n' +
      '• Enable auto-swaps\n' +
      '• Multi-token monitoring\n' +
      '• Real-time notifications',
      { 
        parse_mode: 'Markdown',
        reply_markup: keyboard 
      }
    );
  }

  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const userInfo = query.from;
  
    try {
      const callbackData = JSON.parse(query.data);
  
      switch (callbackData.action) {
        case 'create_price_alert':
          await this.startAlertCreation(chatId, userInfo);
          return true;
  
        case 'view_price_alerts':
          await this.showUserAlerts(chatId, userInfo);
          return true;
  
        case 'enable_swap':
          await this.handleEnableSwap(
            chatId, 
            userInfo, 
            callbackData.tokenAddress, 
            callbackData.walletAddress, 
            callbackData.amount
          );
          return true;

        case 'skip_swap':
          await this.showAlertConfirmation(chatId, userInfo);
          return true;

        case 'confirm_alert':
          await this.savePriceAlert(chatId, userInfo);
          return true;

        default:
          if (action.startsWith('alert_delete_')) {
            const alertId = action.replace('alert_delete_', '');
            await this.confirmAlertDeletion(chatId, alertId, userInfo);
            return true;
          }
          if (action.startsWith('alert_delete_confirm_')) {
            const alertId = action.replace('alert_delete_confirm_', '');
            await this.handleAlertDeletion(chatId, alertId, userInfo);
            return true;
          }
      }
    } catch (error) {
      console.error('Error handling price alert action:', error);
      await this.showErrorMessage(chatId, error, 'retry_price_alerts');
    }
    return false;
  }

  async handleInput(msg) {
    const chatId = msg.chat.id;
    const state = await this.getState(msg.from.id);
    const userData = await this.getUserData(msg.from.id);

    if (state === USER_STATES.WAITING_PRICE_ALERT && msg.text) {
      await this.handlePriceInput(chatId, msg.text, msg.from);
      return true;
    }

    return false;
  }

  async startAlertCreation(chatId, userInfo) {
    await this.setState(userInfo.id, USER_STATES.WAITING_PRICE_ALERT);
    
    await this.bot.sendMessage(
      chatId,
      '*Create Price Alert* 🎯\n\n' +
      'Please enter in this format:\n' +
      '`<token_address> <target_price> [above|below]`\n\n' +
      'Example: `0x123...abc 0.5 above`',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '❌ Cancel', callback_data: 'back_to_price_alerts' }
          ]]
        }
      }
    );
  }

  async handlePriceInput(chatId, input, userInfo) {
    try {
      const [address, price, condition = 'above'] = input.split(' ');
      const network = await networkService.getCurrentNetwork(userInfo.id);

      if (!address || !price || isNaN(price)) {
        throw new Error('Invalid input format');
      }

      const tokenInfo = await dextools.getTokenInfo(network, address.trim());
      const currentPrice = await dextools.getTokenPrice(network, address.trim());

      const pendingAlert = {
        tokenAddress: address.trim(),
        tokenInfo,
        targetPrice: parseFloat(price),
        condition: condition.toLowerCase(),
        network,
        currentPrice
      };

      await this.setUserData(userInfo.id, { pendingAlert });

      const keyboard = this.createKeyboard([
        [
          { text: '🔄 Enable Auto-Swap', callback_data: 'enable_swap' },
          { text: '⏭️ Skip', callback_data: 'skip_swap' }
        ],
        [{ text: '❌ Cancel', callback_data: 'back_to_price_alerts' }]
      ]);

      await this.bot.sendMessage(
        chatId,
        '*Price Alert Details* 📊\n\n' +
        `Token: ${tokenInfo.symbol}\n` +
        `Current Price: $${currentPrice}\n` +
        `Target Price: $${price}\n` +
        `Condition: ${condition}\n\n` +
        'Would you like to enable auto-swap when the alert triggers?',
        { 
          parse_mode: 'Markdown',
          reply_markup: keyboard 
        }
      );
    } catch (error) {
      console.error('Error handling price input:', error);
      await this.showErrorMessage(chatId, error, 'retry_price_alerts');
    }
  }

  // Additional methods for price alert management...
    
  async handleEnableSwap(chatId, userInfo, tokenAddress, walletAddress, amount) {
    const user = await User.findOne({ telegramId: userInfo.id.toString() }).lean();
    const wallet = await walletService.getActiveWallet(userInfo.id);
    
    if (!wallet) {
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
      return;
    }

    if (wallet.type === 'walletconnect') {
      // Request pre-approval for external wallets
      const approvalStatus = await tradingService.checkAndRequestApproval(tokenAddress, walletAddress, amount);
      if (!approvalStatus.approved) {
        throw new Error('Token approval required');
      }
    }

    const userData = await this.getUserData(userInfo.id);
    userData.pendingAlert.walletAddress = wallet.address;
    userData.pendingAlert.walletType = wallet.type;
    await this.setUserData(userInfo.id, userData);

    const keyboard = this.createKeyboard([
      [
        { text: '📈 Buy', callback_data: 'swap_buy' },
        { text: '📉 Sell', callback_data: 'swap_sell' }
      ],
      [{ text: '❌ Cancel', callback_data: 'back_to_price_alerts' }]
    ]);

    await this.bot.sendMessage(
      chatId,
      '*Auto-Swap Settings* ⚙️\n\n' +
      'Choose the swap action that will be performed when price triggers:',
      { 
        parse_mode: 'Markdown',
        reply_markup: keyboard 
      }
    );
  }

  async savePriceAlert(chatId, userInfo) {
    try {
      const userData = await this.getUserData(userInfo.id);
      const alertData = userData?.pendingAlert;

      if (!alertData) {
        throw new Error('No pending alert data found');
      }

      const alert = new PriceAlert({
        userId: userInfo.id.toString(),
        tokenAddress: alertData.tokenAddress,
        network: alertData.network,
        targetPrice: alertData.targetPrice,
        condition: alertData.condition,
        isActive: true,
        swapAction: alertData.swapAction,
        walletAddress: alertData.walletAddress,
        walletType: alertData.walletType
      });

      await alert.save();

      let message = '✅ Price alert created!\n\n' +
                   `Token: ${alertData.tokenInfo.symbol}\n` +
                   `Target Price: $${alertData.targetPrice}\n` +
                   `Condition: ${alertData.condition}\n` +
                   `Network: ${networkService.getNetworkDisplay(alert.network)}`;

      if (alert.swapAction?.enabled) {
        message += `\n\nAuto-${alert.swapAction.type} will execute when triggered`;
        if (alertData.walletType === 'walletconnect') {
          message += '\n\n⚠️ _You will need to approve the transaction when triggered_';
        }
      }

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '📋 View Alerts', callback_data: 'view_price_alerts' },
            { text: '↩️ Back', callback_data: 'back_to_notifications' }
          ]]
        }
      });

      await this.clearState(userInfo.id);
    } catch (error) {
      console.error('Error saving price alert:', error);
      await this.showErrorMessage(chatId, error);
    }
  }
  
  async handleSwapTypeSelection(bot, chatId, type, userInfo) {
    const userData = await UserState.getUserData(userInfo.id);
    const user = await User.findOne({ telegramId: userInfo.id.toString() }).lean();
  
    userData.pendingAlert.swapAction = {
      enabled: true,
      type,
      walletAddress: user.settings.autonomousWallet.address
    };
  
    await UserState.setUserData(userInfo.id, userData);
    await UserState.setState(userInfo.id, 'WAITING_SWAP_AMOUNT');
  
    await bot.sendMessage(
      chatId,
      '*Enter Swap Amount* 💰\n\n' +
      `Please enter the amount to ${type}:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '❌ Cancel', callback_data: 'back_to_price_alerts' }
          ]]
        }
      }
    );
  }
  
  async handleSwapAmountInput(bot, chatId, amount, userInfo) {
    if (isNaN(amount) || parseFloat(amount) <= 0) {
      await bot.sendMessage(
        chatId,
        '❌ Invalid amount. Please enter a valid number:',
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '❌ Cancel', callback_data: 'back_to_price_alerts' }
            ]]
          }
        }
      );
      return;
    }
  
    const userData = await UserState.getUserData(userInfo.id);
    userData.pendingAlert.swapAction.amount = parseFloat(amount);
    await UserState.setUserData(userInfo.id, userData);
  
    await showAlertConfirmation(bot, chatId, userInfo);
  }
  
  async showAlertConfirmation(chatId, userInfo) {
    const userData = await this.getUserData(userInfo.id);
    const { pendingAlert } = userData;
    
    const wallet = await walletService.getWallet(userInfo.id, pendingAlert.walletAddress);
    const needsApproval = wallet.type === 'walletconnect' && pendingAlert.swapAction?.enabled;
    
    let message = '*Confirm Price Alert* ✅\n\n' +
                  `Token: ${pendingAlert.tokenInfo.symbol}\n` +
                  `Target Price: $${pendingAlert.targetPrice}\n` +
                  `Condition: ${pendingAlert.condition}\n` +
                  `Network: ${networkState.getNetworkDisplay(pendingAlert.network)}`;

    if (needsApproval) {
      message += '\n\n⚠️ *Note:* This alert requires token approval from your external wallet.';
    }

    const keyboard = this.createKeyboard([
      [
        { text: '✅ Confirm', callback_data: 'confirm_alert' },
        { text: '❌ Cancel', callback_data: 'cancel_alert' }
      ]
    ]);

    await this.bot.sendMessage(chatId, message, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard 
    });
  }
  
  async showUserPriceAlerts(bot, chatId, userInfo) {
    try {
      const alerts = await PriceAlert.find({ 
        userId: userInfo.id.toString(),
        isActive: true 
      });
  
      if (!alerts || alerts.length === 0) {
        await bot.sendMessage(
          chatId,
          'No active price alerts found.',
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '➕ Create Alert', callback_data: 'create_price_alert' },
                { text: '↩️ Back', callback_data: 'back_to_notifications' }
              ]]
            }
          }
        );
        return;
      }
  
      const alertsList = await Promise.all(alerts.map(async (alert, index) => {
        const tokenInfo = await dextools.getTokenInfo(alert.network, alert.tokenAddress);
        const currentPrice = await dextools.getTokenPrice(alert.network, alert.tokenAddress);
        
        return `${index + 1}. ${tokenInfo.symbol}\n` +
               `• Current: $${currentPrice}\n` +
               `• Target: $${alert.targetPrice}\n` +
               `• Condition: ${alert.condition}\n` +
               `• Auto-Swap: ${alert.swapAction?.enabled ? '✅' : '❌'}\n`;
      }));
  
      const keyboard = {
        inline_keyboard: [
          ...alerts.map((alert, index) => ([{
            text: `Manage Alert #${index + 1}`,
            callback_data: `alert_${alert._id}`
          }])),
          [
            { text: '➕ Create Alert', callback_data: 'create_price_alert' },
            { text: '↩️ Back', callback_data: 'back_to_notifications' }
          ]
        ]
      };
  
      await bot.sendMessage(
        chatId,
        '*Your Price Alerts* 📋\n\n' + alertsList.join('\n'),
        { 
          parse_mode: 'Markdown',
          reply_markup: keyboard 
        }
      );
    } catch (error) {
      console.error('Error showing price alerts:', error);
      await handlePriceAlertError(bot, chatId);
    }
  }
  
  async handleAlertAction(bot, chatId, action, userInfo) {
    try {
      const alertId = action.replace('alert_', '');
      const alert = await PriceAlert.findById(alertId);
      
      if (!alert || alert.userId !== userInfo.id.toString()) {
        throw new Error('Alert not found');
      }
  
      const tokenInfo = await dextools.getTokenInfo(alert.network, alert.tokenAddress);
      const currentPrice = await dextools.getTokenPrice(alert.network, alert.tokenAddress);
  
      const keyboard = createKeyboard([
        [{ text: '🗑️ Delete Alert', callback_data: `alert_delete_${alert._id}` }],
        [{ text: '↩️ Back', callback_data: 'view_price_alerts' }]
      ]);
  
      await bot.sendMessage(
        chatId,
        '*Alert Details* 📊\n\n' +
        `Token: ${tokenInfo.symbol}\n` +
        `Current Price: $${currentPrice}\n` +
        `Target Price: $${alert.targetPrice}\n` +
        `Condition: ${alert.condition}\n` +
        `Network: ${networkState.getNetworkDisplay(alert.network)}\n\n` +
        `Auto-Swap: ${alert.swapAction?.enabled ? '✅' : '❌'}` +
        (alert.swapAction?.enabled ? 
          `\nAction: ${alert.swapAction.type}\n` +
          `Amount: ${alert.swapAction.amount}` : ''),
        { 
          parse_mode: 'Markdown',
          reply_markup: keyboard 
        }
      );
    } catch (error) {
      console.error('Error handling alert action:', error);
      await handlePriceAlertError(bot, chatId);
    }
  }
  
  async confirmAlertDeletion(bot, chatId, alertId, userInfo) {
    try {
      const alert = await PriceAlert.findById(alertId);
      if (!alert || alert.userId !== userInfo.id.toString()) {
        throw new Error('Alert not found');
      }
  
      const tokenInfo = await dextools.getTokenInfo(alert.network, alert.tokenAddress);
  
      const keyboard = createKeyboard([
        [
          { text: '✅ Confirm Delete', callback_data: `alert_delete_confirm_${alertId}` },
          { text: '❌ Cancel', callback_data: 'view_price_alerts' }
        ]
      ]);
  
      await bot.sendMessage(
        chatId,
        '*Confirm Delete Alert* ⚠️\n\n' +
        'Are you sure you want to delete this alert?\n\n' +
        `Token: ${tokenInfo.symbol}\n` +
        `Target Price: $${alert.targetPrice}\n` +
        `Condition: ${alert.condition}`,
        { 
          parse_mode: 'Markdown',
          reply_markup: keyboard 
        }
      );
    } catch (error) {
      console.error('Error confirming alert deletion:', error);
      await handlePriceAlertError(bot, chatId);
    }
  }
  
  async handleAlertDeletion(bot, chatId, alertId, userInfo) {
    try {
      const alert = await PriceAlert.findOneAndDelete({
        _id: alertId,
        userId: userInfo.id.toString()
      });
  
      if (!alert) {
        throw new Error('Alert not found');
      }
  
      const tokenInfo = await dextools.getTokenInfo(alert.network, alert.tokenAddress);
  
      await bot.sendMessage(
        chatId,
        '✅ Price alert deleted successfully!\n\n' +
        `Token: ${tokenInfo.symbol}\n` +
        `Target Price: $${alert.targetPrice}\n` +
        `Condition: ${alert.condition}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '📋 View Alerts', callback_data: 'view_price_alerts' },
              { text: '↩️ Back', callback_data: 'back_to_notifications' }
            ]]
          }
        }
      );
    } catch (error) {
      console.error('Error deleting alert:', error);
      await handlePriceAlertError(bot, chatId);
    }
  }
  
  async handlePriceAlertError(bot, chatId) {
    const keyboard = createKeyboard([[
      { text: '🔄 Retry', callback_data: 'view_price_alerts' },
      { text: '↩️ Back', callback_data: 'back_to_notifications' }
    ]]);
  
    await bot.sendMessage(
      chatId,
      '❌ An error occurred. Please try again.',
      { reply_markup: keyboard }
    );
  }
}