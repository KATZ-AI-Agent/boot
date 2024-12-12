import { Command } from '../base/Command.js';
import { aiService } from '../../services/ai/index.js';
import { USER_STATES } from '../../core/constants.js';

export class MemeCommand extends Command {
  constructor(bot) {
    super(bot);
    this.command = '/meme';
    this.description = 'Analyze meme potential';
    this.pattern = /^(\/meme|🎭 Meme Analysis)$/;
  }

  async execute(msg) {
    const chatId = msg.chat.id;
    await this.showMemeOptions(chatId);
  }

  async showMemeOptions(chatId) {
    const keyboard = this.createKeyboard([
      [{ text: '📝 Enter CA or Symbol', callback_data: 'meme_ca' }],
      [{ text: '🎤 Send Voice Message', callback_data: 'meme_voice' }],
      [{ text: '↩️ Back to Menu', callback_data: '/start' }]
    ]);

    await this.bot.sendMessage(
      chatId,
      '*Meme Analysis* 🎭\n\n' +
      'Choose how to analyze a meme:\n\n' +
      '• Enter Contract Address (CA) or Symbol\n' +
      '• Send a Voice Message\n\n' +
      '_Get AI-powered insights on meme potential_',
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
        case 'meme_ca':
          await this.setState(query.from.id, USER_STATES.WAITING_MEME_INPUT);
          await this.bot.sendMessage(
            chatId, 
            '*Enter Meme Details* 📝\n\n' +
            'Please provide either:\n' +
            '• Contract Address (CA)\n' +
            '• Token Symbol\n' +
            '• Meme Name/Description',
            { parse_mode: 'Markdown' }
          );
          return true;

        case 'meme_voice':
          await this.setState(query.from.id, USER_STATES.WAITING_MEME_VOICE);
          await this.bot.sendMessage(
            chatId,
            '*Voice Analysis* 🎤\n\n' +
            'Send a voice message describing the meme:\n\n' +
            '• What is the meme about?\n' +
            '• Why do you think it has potential?\n' +
            '• Current market context?',
            { parse_mode: 'Markdown' }
          );
          return true;

        case 'retry_meme':
          await this.showMemeOptions(chatId);
          return true;
      }
    } catch (error) {
      console.error('Error handling meme action:', error);
      await this.showErrorMessage(chatId, error, 'retry_meme');
    }
    return false;
  }

  async handleInput(msg) {
    const chatId = msg.chat.id;
    const state = await this.getState(msg.from.id);

    if (!state) return false;

    try {
      switch (state) {
        case USER_STATES.WAITING_MEME_INPUT:
          await this.handleTextAnalysis(msg);
          return true;

        case USER_STATES.WAITING_MEME_VOICE:
          if (msg.voice) {
            await this.handleVoiceAnalysis(msg);
            return true;
          }
          break;
      }
    } catch (error) {
      console.error('Error handling meme input:', error);
      await this.showErrorMessage(chatId, error);
    }
    return false;
  }

  async handleTextAnalysis(msg) {
    const chatId = msg.chat.id;
    const loadingMsg = await this.showLoadingMessage(chatId, '😼 Analyzing meme...');

    try {
      const analysis = await aiService.generateResponse(msg.text, 'memeCapital', msg.from.id);
      await this.deleteMessage(chatId, loadingMsg.message_id);
      await this.simulateTyping(chatId);

      const keyboard = this.createKeyboard([
        [{ text: '🔄 Analyze Another', callback_data: 'meme_ca' }],
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
            { text: '🔄 Analyze Another', callback_data: 'meme_voice' },
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