import { Command } from '../base/Command.js';
import { aiService } from '../../services/ai/index.js';
import { USER_STATES } from '../../core/constants.js';

export class InvestmentCommand extends Command {
  constructor(bot) {
    super(bot);
    this.command = '/invest';
    this.description = 'Get investment advice';
    this.pattern = /^(\/invest|💰 Investment Advice)$/;
  }

  async execute(msg) {
    const chatId = msg.chat.id;
    await this.showInvestmentOptions(chatId);
  }

  async showInvestmentOptions(chatId) {
    const keyboard = this.createKeyboard([
      [{ text: '💭 Ask Investment Question', callback_data: 'invest_input' }],
      [{ text: '🎤 Voice Analysis', callback_data: 'invest_voice' }],
      [{ text: '↩️ Back to Menu', callback_data: '/start' }]
    ]);

    await this.bot.sendMessage(
      chatId,
      '*Investment Advisor* 💰\n\n' +
      'Get expert analysis and advice on:\n\n' +
      '• Token investments\n' +
      '• Market trends\n' +
      '• Risk assessment\n' +
      '• Strategy recommendations\n\n' +
      'Choose your preferred input method:',
      { 
        parse_mode: 'Markdown',
        reply_markup: keyboard 
      }
    );
  }

  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const action = query.data;

    try {
      switch (action) {
        case 'invest_input':
          await this.setState(query.from.id, USER_STATES.WAITING_INVESTMENT_INPUT);
          await this.bot.sendMessage(
            chatId,
            '*Investment Query* 💭\n\n' +
            'Please describe what you would like advice about:\n\n' +
            '• Specific token or project\n' +
            '• Market sector or trend\n' +
            '• Investment strategy\n' +
            '• Risk analysis',
            { parse_mode: 'Markdown' }
          );
          return true;

        case 'invest_voice':
          await this.setState(query.from.id, USER_STATES.WAITING_INVESTMENT_VOICE);
          await this.bot.sendMessage(
            chatId,
            '*Voice Analysis* 🎤\n\n' +
            'Send a voice message describing:\n\n' +
            '• Your investment query\n' +
            '• Market context\n' +
            '• Your goals and risk tolerance',
            { parse_mode: 'Markdown' }
          );
          return true;

        case 'retry_invest':
          await this.showInvestmentOptions(chatId);
          return true;
      }
    } catch (error) {
      console.error('Error handling investment action:', error);
      await this.showErrorMessage(chatId, error, 'retry_invest');
    }
    return false;
  }

  async handleInput(msg) {
    const chatId = msg.chat.id;
    const state = await this.getState(msg.from.id);

    if (!state) return false;

    try {
      switch (state) {
        case USER_STATES.WAITING_INVESTMENT_INPUT:
          await this.handleTextAnalysis(msg);
          return true;

        case USER_STATES.WAITING_INVESTMENT_VOICE:
          if (msg.voice) {
            await this.handleVoiceAnalysis(msg);
            return true;
          }
          break;
      }
    } catch (error) {
      console.error('Error handling investment input:', error);
      await this.showErrorMessage(chatId, error);
    }
    return false;
  }

  async handleTextAnalysis(msg) {
    const chatId = msg.chat.id;
    const loadingMsg = await this.showLoadingMessage(chatId, '😼 Analyzing investment...');

    try {
      const analysis = await aiService.generateResponse(msg.text, 'investment', msg.from.id);
      await this.deleteMessage(chatId, loadingMsg.message_id);
      await this.simulateTyping(chatId);

      const keyboard = this.createKeyboard([
        [{ text: '🔄 Ask Another Question', callback_data: 'invest_input' }],
        [{ text: '↩️ Back to Menu', callback_data: '/start' }]
      ]);

      await this.bot.sendMessage(chatId, analysis, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

      await this.clearState(msg.from.id);
    } catch (error) {
      if (loadingMsg) {
        await this.deleteMessage(chatId, loadingMsg.message_id);
      }
      throw error;
    }
  }

  async handleVoiceAnalysis(msg) {
    const chatId = msg.chat.id;
    const loadingMsg = await this.showLoadingMessage(chatId, '🎤 Processing voice message...');

    try {
      const result = await aiService.processVoiceCommand(msg.voice);
      await this.deleteMessage(chatId, loadingMsg.message_id);
      await this.simulateTyping(chatId);

      // Send text analysis
      await this.bot.sendMessage(chatId, result.response, {
        parse_mode: 'Markdown'
      });

      // Send voice response
      await this.bot.sendVoice(chatId, result.audio, {
        reply_markup: {
          inline_keyboard: [[
            { text: '🔄 Ask Another Question', callback_data: 'invest_voice' },
            { text: '↩️ Back to Menu', callback_data: '/start' }
          ]]
        }
      });

      await this.clearState(msg.from.id);
    } catch (error) {
      if (loadingMsg) {
        await this.deleteMessage(chatId, loadingMsg.message_id);
      }
      throw error;
    }
  }
}