import { UserState } from '../../utils/userState.js';
import { createKeyboard } from '../../utils/keyboard.js';
import { ERROR_MESSAGES } from '../../core/constants.js';
import { ErrorHandler } from '../../core/errors/index.js';

export class Command {
  constructor(bot) {
    if (new.target === Command) {
      throw new Error('Command is an abstract class');
    }
    this.bot = bot;
    this.command = '';
    this.description = '';
    this.pattern = null;
  }

  /**
   * Registers the command with the bot.
   */
  register() {
    if (this.pattern) {
      this.bot.onText(this.pattern, (msg) => {
        this.safeExecute(msg);
      });
    }
  }

  /**
   * Executes the command logic safely.
   * @param {Object} msg - The Telegram message object.
   */
  async safeExecute(msg) {
    try {
      await this.execute(msg);
    } catch (error) {
      console.error(`Error executing command ${this.command}:`, error);
      await ErrorHandler.handle(error, this.bot, msg.chat.id);
      this.showErrorMessage(msg.chat.id, error);
    }
  }

  /**
   * Executes the command logic.
   * Must be implemented by subclasses.
   * @param {Object} msg - The Telegram message object.
   */
  async execute(msg) {
    throw new Error('Command execute method must be implemented');
  }

  /**
   * Handles callback queries. Optional for subclasses to override.
   * @param {Object} query - The Telegram callback query object.
   * @returns {boolean} Whether the callback was handled.
   */
  async handleCallback(query) {
    return false; // Optional callback handler
  }

  /**
   * Handles user input. Optional for subclasses to override.
   * @param {Object} msg - The Telegram message object.
   * @returns {boolean} Whether the input was handled.
   */
  async handleInput(msg) {
    return false; // Optional input handler
  }

  /**
   * Creates a custom keyboard layout.
   * @param {Array} buttons - An array of button objects.
   * @param {Object} options - Additional options for the keyboard.
   * @returns {Object} The keyboard object.
   */
  createKeyboard(buttons, options = {}) {
    return createKeyboard(buttons, options);
  }

  /**
   * Shows an error message to the user with optional retry actions.
   * @param {number} chatId - The chat ID to send the message to.
   * @param {Error} error - The error object.
   * @param {string|null} retryAction - Optional retry action callback data.
   */
  async showErrorMessage(chatId, error, retryAction = null) {
    const keyboard = this.createKeyboard([[
      retryAction ? { text: '🔄 Retry', callback_data: retryAction } : null,
      { text: '↩️ Back to Menu', callback_data: '/start' }
    ].filter(Boolean)]);

    const errorMessage = ERROR_MESSAGES[error?.code] || error?.message || ERROR_MESSAGES.GENERAL_ERROR;

    try {
      await this.bot.sendMessage(chatId, errorMessage, { 
        reply_markup: keyboard,
        parse_mode: 'Markdown'
      });
    } catch (notifyError) {
      await ErrorHandler.handle(notifyError, this.bot, chatId);
      console.error('Error sending error message:', notifyError);
    }
  }

  /**
   * Shows a loading message to the user.
   * @param {number} chatId - The chat ID to send the message to.
   * @param {string} message - The loading message to display.
   */
  async showLoadingMessage(chatId, message = '😼 Processing...') {
    return this.bot.sendMessage(chatId, message);
  }

  /**
   * Deletes a message from the chat.
   * @param {number} chatId - The chat ID of the message.
   * @param {number} messageId - The ID of the message to delete.
   */
  async deleteMessage(chatId, messageId) {
    try {
      await this.bot.deleteMessage(chatId, messageId);
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  }

  /**
   * Simulates typing in a chat for a given duration.
   * @param {number} chatId - The chat ID to simulate typing in.
   * @param {number} duration - The duration in milliseconds to simulate typing.
   */
  async simulateTyping(chatId, duration = 3000) {
    await this.bot.sendChatAction(chatId, 'typing');
    await new Promise(resolve => setTimeout(resolve, duration));
  }

  // State management helpers
  async setState(userId, state) {
    await UserState.setState(userId, state);
  }

  async getState(userId) {
    return UserState.getState(userId);
  }

  async clearState(userId) {
    await UserState.clearUserState(userId);
  }

  async setUserData(userId, data) {
    await UserState.setUserData(userId, data);
  }

  async getUserData(userId) {
    return UserState.getUserData(userId);
  }
}
