import { Command } from '../base/Command.js';
import { timedOrderService } from '../../services/timedOrders.js';
import { User } from '../../models/User.js';
import { networkState } from '../../services/networkState.js';
import { dextools } from '../../services/dextools/index.js';
import { USER_STATES } from '../../core/constants.js';
import { format } from 'date-fns';

export class TimedOrdersCommand extends Command {
  constructor(bot) {
    super(bot);
    this.command = '/timedorders';
    this.description = 'Set timed orders';
    this.pattern = /^(\/timedorders|⚡ Timed Orders)$/;
  }

  async execute(msg) {
    const chatId = msg.chat.id;
    await this.showTimedOrdersMenu(chatId, msg.from);
  }

  async showTimedOrdersMenu(chatId, userInfo) {
    const keyboard = this.createKeyboard([
      [{ text: '⚡ Set Auto Swap Order', callback_data: 'set_timed_order' }],
      [{ text: '📋 View Active Orders', callback_data: 'view_active_orders' }],
      [{ text: '↩️ Back', callback_data: 'back_to_notifications' }]
    ]);

    await this.bot.sendMessage(
      chatId,
      '*Timed Orders* ⚡\n\n' +
      'Schedule automatic token swaps:',
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
        case 'set_timed_order':
          await this.startOrderCreation(chatId, userInfo);
          return true;

        case 'view_active_orders':
          await this.showActiveOrders(chatId, userInfo);
          return true;

        case 'confirm_order':
          await this.handleOrderConfirmation(chatId, userInfo);
          return true;

        case 'cancel_order':
          await this.handleOrderCancellation(chatId, userInfo);
          return true;

        default:
          if (action.startsWith('order_delete_')) {
            const orderId = action.replace('order_delete_', '');
            await this.confirmOrderDeletion(chatId, orderId, userInfo);
            return true;
          }
          if (action.startsWith('order_delete_confirm_')) {
            const orderId = action.replace('order_delete_confirm_', '');
            await this.handleOrderDeletion(chatId, orderId, userInfo);
            return true;
          }
      }
    } catch (error) {
      console.error('Error handling timed order action:', error);
      await this.showErrorMessage(chatId, error, 'retry_timed_orders');
    }
    return false;
  }

  async startOrderCreation(chatId, userInfo) {
    // Check if user has autonomous wallet set
    const user = await User.findOne({ telegramId: userInfo.id.toString() }).lean();
    if (!user?.settings?.autonomousWallet?.address) {
      await this.bot.sendMessage(
        chatId,
        '❌ Please set up an autonomous wallet first in Settings.',
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '⚙️ Go to Settings', callback_data: 'settings' }
            ]]
          }
        }
      );
      return;
    }

    await this.setState(userInfo.id, USER_STATES.WAITING_ORDER_ADDRESS);
    await this.setUserData(userInfo.id, { 
      pendingOrder: { 
        step: 1,
        network: await networkState.getCurrentNetwork(userInfo.id)
      }
    });
    
    await this.bot.sendMessage(
      chatId,
      '*Step 1/5: Token Address* 📝\n\n' +
      'Please enter the token address:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '❌ Cancel', callback_data: 'back_to_timed_orders' }
          ]]
        }
      }
    );
  }

  async handleInput(msg) {
    const chatId = msg.chat.id;
    const state = await this.getState(msg.from.id);
    const userData = await this.getUserData(msg.from.id);

    if (!state || !msg.text) return false;

    try {
      switch (state) {
        case USER_STATES.WAITING_ORDER_ADDRESS:
          await this.handleAddressInput(chatId, msg.text, msg.from);
          return true;

        case USER_STATES.WAITING_ORDER_AMOUNT:
          await this.handleAmountInput(chatId, msg.text, msg.from);
          return true;

        case USER_STATES.WAITING_ORDER_DATE:
          await this.handleDateInput(chatId, msg.text, msg.from);
          return true;

        case USER_STATES.WAITING_ORDER_TIME:
          await this.handleTimeInput(chatId, msg.text, msg.from);
          return true;
      }
    } catch (error) {
      console.error('Error handling order input:', error);
      await this.showErrorMessage(chatId, error);
    }
    return false;
  }

  async handleAddressInput(chatId, address, userInfo) {
    try {
      const userData = await this.getUserData(userInfo.id);
      const tokenInfo = await dextools.getTokenInfo(
        userData.pendingOrder.network,
        address.trim()
      );

      userData.pendingOrder = {
        ...userData.pendingOrder,
        tokenAddress: address.trim(),
        tokenInfo,
        step: 2
      };
      await this.setUserData(userInfo.id, userData);

      const keyboard = this.createKeyboard([
        [
          { text: '📈 Buy', callback_data: 'order_action_buy' },
          { text: '📉 Sell', callback_data: 'order_action_sell' }
        ],
        [{ text: '❌ Cancel', callback_data: 'back_to_timed_orders' }]
      ]);

      await this.bot.sendMessage(
        chatId,
        '*Step 2/5: Select Action* 🎯\n\n' +
        `Token: ${tokenInfo.symbol}\n` +
        'Choose the action to perform:',
        { 
          parse_mode: 'Markdown',
          reply_markup: keyboard 
        }
      );
    } catch (error) {
      console.error('Error handling address input:', error);
      throw error;
    }
  }

  async handleAmountInput(chatId, amount, userInfo) {
    if (isNaN(amount) || parseFloat(amount) <= 0) {
      await this.bot.sendMessage(
        chatId,
        '❌ Invalid amount. Please enter a valid number:',
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '❌ Cancel', callback_data: 'back_to_timed_orders' }
            ]]
          }
        }
      );
      return;
    }

    const userData = await this.getUserData(userInfo.id);
    userData.pendingOrder.amount = parseFloat(amount);
    userData.pendingOrder.step = 4;
    await this.setUserData(userInfo.id, userData);
    await this.setState(userInfo.id, USER_STATES.WAITING_ORDER_DATE);

    await this.bot.sendMessage(
      chatId,
      '*Step 4/5: Enter Date* 📅\n\n' +
      'Enter the date (DD/MM/YYYY):',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '❌ Cancel', callback_data: 'back_to_timed_orders' }
          ]]
        }
      }
    );
  }

  async handleDateInput(chatId, date, userInfo) {
    const dateRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    if (!dateRegex.test(date)) {
      await this.bot.sendMessage(
        chatId,
        '❌ Invalid date format. Please use DD/MM/YYYY:',
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '❌ Cancel', callback_data: 'back_to_timed_orders' }
            ]]
          }
        }
      );
      return;
    }

    const userData = await this.getUserData(userInfo.id);
    userData.pendingOrder.date = date;
    userData.pendingOrder.step = 5;
    await this.setUserData(userInfo.id, userData);
    await this.setState(userInfo.id, USER_STATES.WAITING_ORDER_TIME);

    await this.bot.sendMessage(
      chatId,
      '*Step 5/5: Enter Time* ⏰\n\n' +
      'Enter the time (HH:MM):',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '❌ Cancel', callback_data: 'back_to_timed_orders' }
          ]]
        }
      }
    );
  }

  async handleTimeInput(chatId, time, userInfo) {
    const timeRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;
    if (!timeRegex.test(time)) {
      await this.bot.sendMessage(
        chatId,
        '❌ Invalid time format. Please use HH:MM (24-hour):',
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '❌ Cancel', callback_data: 'back_to_timed_orders' }
            ]]
          }
        }
      );
      return;
    }

    const userData = await this.getUserData(userInfo.id);
    const [date, month, year] = userData.pendingOrder.date.split('/');
    const [hours, minutes] = time.split(':');
    
    const executeAt = new Date(year, month - 1, date, hours, minutes);
    
    if (executeAt <= new Date()) {
      await this.bot.sendMessage(
        chatId,
        '❌ Execution time must be in the future. Please try again:',
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '❌ Cancel', callback_data: 'back_to_timed_orders' }
            ]]
          }
        }
      );
      return;
    }

    userData.pendingOrder.executeAt = executeAt;
    await this.setUserData(userInfo.id, userData);

    await this.showOrderConfirmation(chatId, userInfo);
  }

  async showOrderConfirmation(chatId, userInfo) {
    const userData = await this.getUserData(userInfo.id);
    const { pendingOrder } = userData;

    const keyboard = this.createKeyboard([
      [
        { text: '✅ Submit', callback_data: 'confirm_order' },
        { text: '❌ Cancel', callback_data: 'back_to_timed_orders' }
      ]
    ]);

    await this.bot.sendMessage(
      chatId,
      '*Order Confirmation* ✅\n\n' +
      `Token: ${pendingOrder.tokenInfo.symbol}\n` +
      `Action: ${pendingOrder.action}\n` +
      `Amount: ${pendingOrder.amount}\n` +
      `Execute at: ${format(pendingOrder.executeAt, 'PPpp')}\n\n` +
      'Please confirm your order:',
      { 
        parse_mode: 'Markdown',
        reply_markup: keyboard 
      }
    );
  }

  async handleOrderConfirmation(chatId, userInfo) {
    try {
      const userData = await this.getUserData(userInfo.id);
      const { pendingOrder } = userData;

      const user = await User.findOne({ telegramId: userInfo.id.toString() }).lean();
      const walletAddress = user.settings.autonomousWallet.address;

      const order = await timedOrderService.createOrder(userInfo.id, {
        walletAddress,
        tokenAddress: pendingOrder.tokenAddress,
        network: pendingOrder.network,
        action: pendingOrder.action,
        amount: pendingOrder.amount,
        executeAt: pendingOrder.executeAt
      });

      await this.bot.sendMessage(
        chatId,
        '✅ Order created successfully!\n\n' +
        `Token: ${pendingOrder.tokenInfo.symbol}\n` +
        `Action: ${pendingOrder.action}\n` +
        `Amount: ${pendingOrder.amount}\n` +
        `Execute at: ${format(pendingOrder.executeAt, 'PPpp')}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '📋 View Orders', callback_data: 'view_active_orders' },
              { text: '↩️ Back', callback_data: 'back_to_notifications' }
            ]]
          }
        }
      );

      await this.clearState(userInfo.id);
    } catch (error) {
      console.error('Error confirming order:', error);
      await this.showErrorMessage(chatId, error);
    }
  }

  async showActiveOrders(chatId, userInfo) {
    try {
      const orders = await timedOrderService.getActiveOrders(userInfo.id);

      if (!orders || orders.length === 0) {
        await this.bot.sendMessage(
          chatId,
          'No active orders found.',
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '➕ Create Order', callback_data: 'set_timed_order' },
                { text: '↩️ Back', callback_data: 'back_to_notifications' }
              ]]
            }
          }
        );
        return;
      }

      const ordersList = await Promise.all(orders.map(async (order, index) => {
        const tokenInfo = await dextools.getTokenInfo(order.network, order.tokenAddress);
        return `${index + 1}. ${tokenInfo.symbol}\n` +
               `• Action: ${order.action}\n` +
               `• Amount: ${order.amount}\n` +
               `• Execute at: ${format(order.executeAt, 'PPpp')}\n`;
      }));

      const keyboard = {
        inline_keyboard: [
          ...orders.map((order, index) => ([{
            text: `🗑️ Delete Order #${index + 1}`,
            callback_data: `order_delete_${order._id}`
          }])),
          [
            { text: '➕ Create Order', callback_data: 'set_timed_order' },
            { text: '↩️ Back', callback_data: 'back_to_notifications' }
          ]
        ]
      };

      await this.bot.sendMessage(
        chatId,
        '*Active Orders* 📋\n\n' + ordersList.join('\n'),
        { 
          parse_mode: 'Markdown',
          reply_markup: keyboard 
        }
      );
    } catch (error) {
      console.error('Error showing active orders:', error);
      await this.showErrorMessage(chatId, error);
    }
  }

  async confirmOrderDeletion(chatId, orderId, userInfo) {
    try {
      const order = await timedOrderService.getOrder(orderId);
      if (!order || order.userId !== userInfo.id.toString()) {
        throw new Error('Order not found');
      }

      const tokenInfo = await dextools.getTokenInfo(order.network, order.tokenAddress);

      const keyboard = this.createKeyboard([
        [
          { text: '✅ Confirm Delete', callback_data: `order_delete_confirm_${orderId}` },
          { text: '❌ Cancel', callback_data: 'view_active_orders' }
        ]
      ]);

      await this.bot.sendMessage(
        chatId,
        '*Confirm Delete Order* ⚠️\n\n' +
        'Are you sure you want to delete this order?\n\n' +
        `Token: ${tokenInfo.symbol}\n` +
        `Action: ${order.action}\n` +
        `Amount: ${order.amount}\n` +
        `Execute at: ${format(order.executeAt, 'PPpp')}`,
        { 
          parse_mode: 'Markdown',
          reply_markup: keyboard 
        }
      );
    } catch (error) {
      console.error('Error confirming order deletion:', error);
      throw error;
    }
  }

  async handleOrderDeletion(chatId, orderId, userInfo) {
    try {
      await timedOrderService.cancelOrder(userInfo.id, orderId);

      await this.bot.sendMessage(
        chatId,
        '✅ Order cancelled successfully!',
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '📋 View Orders', callback_data: 'view_active_orders' },
              { text: '↩️ Back', callback_data: 'back_to_notifications' }
            ]]
          }
        }
      );
    } catch (error) {
      console.error('Error deleting order:', error);
      await this.showErrorMessage(chatId, error);
    }
  }
}