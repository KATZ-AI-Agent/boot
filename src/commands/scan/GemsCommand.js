import { Command } from '../base/Command.js';
import { gemsService } from '../../services/gems/GemsService.js';
import { GemScan } from '../../models/GemScan.js';
import { User } from '../../models/User.js';
import { createCanvas, loadImage } from 'canvas';
import { format } from 'date-fns';

export class GemsCommand extends Command {
  constructor(bot) {
    super(bot);
    this.command = '/gems';
    this.description = 'View trending gems';
    this.pattern = /^(\/gems|💎 Gems Today)$/;
  }

  async execute(msg) {
    const chatId = msg.chat.id;
    await this.showGemsMenu(chatId, msg.from);
  }

  async showGemsMenu(chatId, userInfo) {
    const user = await User.findOne({ telegramId: userInfo.id.toString() }).lean();
    const notificationsEnabled = user?.settings?.notifications?.gemsToday || false;

    const keyboard = this.createKeyboard([
      [{ text: '💎 View Today\'s Gems', callback_data: 'view_gems' }],
      [{
        text: `${notificationsEnabled ? '🔕 Disable' : '🔔 Enable'} Notifications`,
        callback_data: 'toggle_gems_notifications'
      }],
      [{ text: '↩️ Back to Scan', callback_data: 'back_to_scan' }]
    ]);

    await this.bot.sendMessage(
      chatId,
      '*Gems Today* 💎\n\n' +
      'Discover trending tokens with high social interest:\n\n' +
      '• Hourly scans across all chains\n' +
      '• Social media analysis\n' +
      '• Interest rating system\n' +
      `• Notifications: ${notificationsEnabled ? '✅' : '❌'}\n\n` +
      '_Note: This is an experimental feature based on social metrics._',
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
        case 'view_gems':
          await this.showTodayGems(chatId, userInfo);
          return true;

        case 'toggle_gems_notifications':
          await this.toggleNotifications(chatId, userInfo);
          return true;

        case 'retry_gems':
          await this.showGemsMenu(chatId, userInfo);
          return true;
      }
    } catch (error) {
      console.error('Error handling gems action:', error);
      await this.showErrorMessage(chatId, error, 'retry_gems');
    }
    return false;
  }

  async showTodayGems(chatId, userInfo) {
    const loadingMsg = await this.showLoadingMessage(chatId, '💎 Generating gems report...');

    try {
      const today = new Date().setHours(0, 0, 0, 0);
      const scan = await GemScan.findOne({ date: today }).lean();

      if (!scan || !scan.tokens.length) {
        await this.bot.deleteMessage(chatId, loadingMsg.message_id);
        await this.bot.sendMessage(
          chatId,
          'No gems found for today yet. Check back later!',
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '↩️ Back', callback_data: 'back_to_gems' }
              ]]
            }
          }
        );
        return;
      }

      // Generate canvas report
      const canvas = await this.generateGemsCanvas(scan.tokens.slice(0, 10));
      
      await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      await this.bot.sendPhoto(chatId, canvas.toBuffer(), {
        caption: '*Today\'s Top Gems* 💎\n\n' +
                `Last Updated: ${format(scan.scanTime, 'HH:mm')}\n\n` +
                '_Ratings based on social metrics & interest_',
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🔄 Refresh', callback_data: 'view_gems' },
            { text: '↩️ Back', callback_data: 'back_to_gems' }
          ]]
        }
      });
    } catch (error) {
      console.error('Error showing gems:', error);
      if (loadingMsg) {
        await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      }
      await this.showErrorMessage(chatId, error, 'retry_gems');
    }
  }

  async generateGemsCanvas(tokens) {
    const canvas = createCanvas(800, 1200);
    const ctx = canvas.getContext('2d');

    // Background
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Title
    ctx.font = 'bold 48px Arial';
    ctx.fillStyle = '#e94560';
    ctx.textAlign = 'center';
    ctx.fillText('Today\'s Gems 💎', canvas.width / 2, 80);

    // Tokens
    let y = 160;
    for (const token of tokens) {
      // Token container
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.roundRect(40, y, canvas.width - 80, 100, 10);
      ctx.fill();

      // Token info
      ctx.font = 'bold 24px Arial';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(token.symbol, 60, y + 35);

      ctx.font = '18px Arial';
      ctx.fillStyle = '#ccc';
      ctx.fillText(this.formatAddress(token.address), 60, y + 65);

      // Metrics
      ctx.textAlign = 'right';
      ctx.font = 'bold 32px Arial';
      ctx.fillStyle = '#e94560';
      ctx.fillText(`${token.metrics.rating}/10`, canvas.width - 60, y + 45);

      ctx.font = '16px Arial';
      ctx.fillStyle = '#ccc';
      ctx.fillText(`👁 ${token.metrics.impressions} | ♥️ ${token.metrics.likes} | 🔄 ${token.metrics.retweets}`, canvas.width - 60, y + 70);

      y += 120;
    }

    return canvas;
  }

  async toggleNotifications(chatId, userInfo) {
    try {
      const user = await User.findOne({ telegramId: userInfo.id.toString() }).lean();
      const newState = !user?.settings?.notifications?.gemsToday;

      await User.updateOne(
        { telegramId: userInfo.id.toString() },
        { $set: { 'settings.notifications.gemsToday': newState } }
      );

      await this.bot.sendMessage(
        chatId,
        `✅ Gems notifications ${newState ? 'enabled' : 'disabled'} successfully!`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '↩️ Back', callback_data: 'back_to_gems' }
            ]]
          }
        }
      );
    } catch (error) {
      console.error('Error toggling notifications:', error);
      await this.showErrorMessage(chatId, error, 'retry_gems');
    }
  }

  formatAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
}