import { UserState } from '../utils/userState.js';
import { openAIService } from '../services/ai/openai.js'; // Updated import
import { handleTradingCommand } from '../services/ai/tradingCommands.js';
import { audioService } from '../services/ai/speech.js';
import { ErrorHandler } from '../core/errors/index.js';
import { rateLimiter } from '../core/rate-limiting/RateLimiter.js';

export function setupMessageHandler(bot) {
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    try {
      console.warn('no, we here////');
      // 1. Rate Limit Check
      const isLimited = rateLimiter.isRateLimited(msg.from.id, 'message');
      if (isLimited) {
        throw new ErrorHandler.RateLimitError('Too many messages');
      }

      // 2. Handle Voice Messages
      if (msg.voice) {
        await processVoiceMessage(bot, msg);
        return;
      }

      // 3. Handle Trading Commands
      if (msg.text && isTradingCommand(msg.text)) {
        await handleTradingCommand(bot, chatId, msg.from, msg.text);
        return;
      }

      // 4. Handle General User Input
      const userState = UserState.getState(chatId);
      if (msg.text && userState) {
        await processUserInput(bot, chatId, msg.text, userState);
      }
    } catch (error) {
      console.error('Message handling error:', error);
      await ErrorHandler.handle(error, bot, chatId);
    }
  });
}

async function processVoiceMessage(bot, msg) {
  const chatId = msg.chat.id;
  const loadingMsg = await bot.sendMessage(chatId, '🎤 Processing voice message...');
  
  try {
    const file = await bot.getFile(msg.voice.file_id);
    const voiceText = await audioService.speechToText(file);

    if (isTradingCommand(voiceText)) {
      await handleTradingCommand(bot, chatId, msg.from, voiceText);
    } else {
      await processUserInput(bot, chatId, voiceText, 'chat');
    }

    await bot.deleteMessage(chatId, loadingMsg.message_id);
  } catch (error) {
    console.error('Voice processing error:', error);
    if (loadingMsg) {
      await bot.deleteMessage(chatId, loadingMsg.message_id);
    }
    await ErrorHandler.handle(error, bot, chatId);
  }
}

async function processUserInput(bot, chatId, text, state) {
  try {
    const response = await openAIService.generateAIResponse(text, state, chatId);
    await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error generating AI response:', error);
    await ErrorHandler.handle(error, bot, chatId);
  }
}

function isTradingCommand(text) {
  const lowerText = text.toLowerCase();
  return (
    lowerText.includes('buy') ||
    lowerText.includes('sell') ||
    lowerText.includes('alert') ||
    lowerText.includes('order')
  );
}
