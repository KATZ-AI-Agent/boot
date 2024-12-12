import { Command } from '../base/Command.js';
import { PriceAlert } from '../../models/PriceAlert.js';
import { TimedOrder } from '../../models/TimedOrder.js';
import { User } from '../../models/User.js';
import { notificationService } from '../../services/notifications.js';

export class NotificationsCommand extends Command {
  constructor(bot) {
    super(bot);
    this.command = '/notifications';
    this.description = 'Manage notifications';
    this.pattern = /^(\/notifications|🔔 Notifications)$/;
  }

  async execute(msg) {
    const chatId = msg.chat.id;
    await this.showNotificationsMenu(chatId);
  }

  async showNotificationsMenu(chatId) {
    const keyboard = this.createKeyboard([
      [{ text: '💰 Price Alerts', callback_data: 'price_alerts' }],
      [{ text: '⏰ Reminders', callback_data: 'reminders' }],
      [{ text: '⚡ Timed Orders', callback_data: 'timed_orders' }],
      [{ text: '⚙️ Settings', callback_data: 'notification_settings' }],
      [{ text: '↩️ Back to Menu', callback_data: '/start' }]
    ]);

    await this.bot.sendMessage(
      chatId,
      '*Notifications Center* 🔔\n\n' +
      'Manage your notifications:\n\n' +
      '• Price alerts\n' +
      '• Trading reminders\n' +
      '• Timed orders\n' +
      '• Custom settings',
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
        case 'price_alerts':
          await this.showPriceAlerts(chatId, userInfo);
          return true;

        case 'reminders':
          await this.showReminders(chatId, userInfo);
          return true;

        case 'timed_orders':
          await this.showTimedOrders(chatId, userInfo);
          return true;

        case 'notification_settings':
          await this.showNotificationSettings(chatId, userInfo);
          return true;

        case 'back_to_notifications':
          await this.showNotificationsMenu(chatId);
          return true;

        default:
          if (action.startsWith('alert_')) {
            return this.handleAlertAction(query);
          }
          if (action.startsWith('order_')) {
            return this.handleOrderAction(query);
          }
      }
    } catch (error) {
      console.error('Error handling notification action:', error);
      await this.showErrorMessage(chatId, error, 'retry_notifications');
    }
    return false;
  }

  // Additional methods for notification management...
  // Implementation continues with methods for handling different notification types
}