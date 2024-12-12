import { Command } from '../base/Command.js';
import { User } from '../../models/User.js';
import { walletService } from '../../services/wallet/index.js';
import { networkState } from '../../services/networkState.js';
import { WelcomeCard } from './WelcomeCard.js';
import { RegistrationHandler } from './RegistrationHandler.js';
import { MenuHandler } from './MenuHandler.js';
import { USER_STATES } from '../../core/constants.js';

export class StartCommand extends Command {
  constructor(bot) {
    super(bot);
    this.command = '/start';
    this.description = 'Start the bot';
    this.pattern = /^\/start$/;
    this.registrationHandler = new RegistrationHandler(bot);
    this.menuHandler = new MenuHandler(bot);
  }

  async execute(msg) {
    const chatId = msg.chat.id;
    await this.handleStart(chatId, msg.from);
  }

  async handleStart(chatId, userInfo) {
    await this.clearState(userInfo.id);

    try {
      const currentNetwork = await networkState.getCurrentNetwork(userInfo.id);
      const user = await User.findOne({ telegramId: userInfo.id.toString() }).lean();

      // Send welcome animation with message
      const startMessage = `
🐈‍⬛ *KATZ - Autonomous Trench Agent...* 🐈‍⬛

_AI trench pawtner on Eth, Base, SOL_ 

🔍 *Personal meme trading agent:* 😼
• 🦴 Meme Analysis
• 🦴 AI Ape Suggestions
• 🦴 AI Loan Matching
• 🦴 Token Scanning
• 🦴 Autonomous Voice Trading
• 🦴 Pump.fun, Moonshot and more...

🐕 *Origins:* Courage The Cowardly Dog (meme)

Chain: *${networkState.getNetworkDisplay(currentNetwork)}*
`.trim();

      await this.bot.sendAnimation(
        chatId,
        'https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExa2JkenYycWk0YjBnNXhhaGliazI2dWxwYm94djNhZ3R1dWhsbmQ2MCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/xouqS1ezHDrNkhPWMI/giphy.gif',
        {
          caption: startMessage,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }
      );

      if (!user) {
        await this.showRegistrationPrompt(chatId);
        await this.setState(userInfo.id, USER_STATES.AWAITING_REGISTRATION);
        return;
      }

      await this.menuHandler.showWelcomeMessage(chatId, userInfo.username, false);
    } catch (error) {
      console.error('Error in start command:', error);
      await this.showErrorMessage(chatId, error, 'retry_start');
    }
  }

  async showRegistrationPrompt(chatId) {
    const keyboard = this.createKeyboard([
      [{ text: '🎯 Register Now', callback_data: 'register_user' }],
      [{ text: '❌ Cancel', callback_data: 'cancel_registration' }]
    ]);

    await this.bot.sendMessage(
      chatId,
      `*🆕 First Time?...*\n\n` +
      `_Let's get you set up with your own secure wallets and access to all KATZ features!_\n\n` +
      `• Secure wallet creation\n` +
      `• Multi-chain trenching\n` +
      `• AI-powered trading\n` +
      `• And much more...\n\n` +
      `Ready to start? 🚀`,
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
        case 'register_user':
          const state = await this.getState(userInfo.id);
          if (state === USER_STATES.AWAITING_REGISTRATION) {
            await this.registrationHandler.handleRegistration(chatId, userInfo);
            return true;
          }
          break;

        case 'cancel_registration':
          await this.bot.sendMessage(
            chatId,
            '❌ Registration cancelled. Use /start when you\'re ready to begin.'
          );
          await this.clearState(userInfo.id);
          return true;

        case 'start_menu':
          await this.menuHandler.showMainMenu(chatId);
          return true;

        case 'retry_start':
          await this.handleStart(chatId, userInfo);
          return true;
      }
    } catch (error) {
      console.error('Error in start callback:', error);
      await this.showErrorMessage(chatId, error);
    }
    return false;
  }
}