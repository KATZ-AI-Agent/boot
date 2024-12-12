import { Command } from '../base/Command.js';
import { blockchain } from '../../services/blockchain/index.js';
import { aiService } from '../../services/ai/index.js';
import { networkService } from '../../services/network/index.js';
import { USER_STATES } from '../../core/constants.js';

export class LoansCommand extends Command {
  constructor(bot) {
    super(bot);
    this.command = '/loans';
    this.description = 'Analyze meme loans';
    this.pattern = /^(\/loans|📊 Vet Meme Loans)$/;
  }

  async execute(msg) {
    const chatId = msg.chat.id;
    await this.handleLoansCommand(chatId, msg.from);
  }

  async handleLoansCommand(chatId, userInfo) {
    if (!await this.validateWallet(chatId)) {
      return;
    }

    const loadingMsg = await this.showLoadingMessage(chatId, '😼 Fetching loan data...');

    try {
      const network = await networkService.getCurrentNetwork(userInfo.id);
      const loans = await blockchain.fetchLoans(userInfo.id);
      
      await this.deleteMessage(chatId, loadingMsg.message_id);
      await this.showLoansData(chatId, loans, network);
      
      const keyboard = this.createKeyboard([
        [
          { text: '✅ Analyze Loans', callback_data: 'analyze_loans' },
          { text: '❌ No, thanks', callback_data: '/start' }
        ]
      ]);
      
      await this.simulateTyping(chatId);
      await this.bot.sendMessage(
        chatId, 
        'Would you like me to analyze these loans for meme investment opportunities?',
        { reply_markup: keyboard }
      );
      
      await this.setState(userInfo.id, USER_STATES.WAITING_LOAN_ANALYSIS);
      await this.setUserData(userInfo.id, { pendingLoans: loans });
    } catch (error) {
      console.error('Error fetching loans:', error);
      if (loadingMsg) {
        await this.deleteMessage(chatId, loadingMsg.message_id);
      }
      await this.showErrorMessage(chatId, error, 'retry_loans');
    }
  }

  async validateWallet(chatId) {
    const keyboard = this.createKeyboard([
      [
        { text: '⚙️ Configure Wallet', callback_data: 'goto_settings' },
        { text: '↩️ Back to Menu', callback_data: '/start' }
      ]
    ]);
    
    await this.bot.sendMessage(
      chatId,
      '❌ Wallet not configured! Please configure your wallet before analyzing loans.',
      { reply_markup: keyboard }
    );
    return false;
  }

  async showLoansData(chatId, loans, network) {
    const message = this.formatLoansMessage(loans, network);
    await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }

  formatLoansMessage(loans, network) {
    if (!loans || loans.length === 0) {
      return `*No loans available on ${networkService.getNetworkDisplay(network)}*`;
    }

    return `*Available Loans on ${networkService.getNetworkDisplay(network)}:*\n\n${
      loans.map((loan, index) => 
        `Loan #${index + 1}:\n` +
        `• Collateral: ${loan.collateralAmount} ${loan.collateralToken}\n` +
        `• Loan Amount: ${loan.loanAmount} ${loan.loanToken}\n` +
        `• Repay Amount: ${loan.repayAmountOffered} ${loan.loanToken}\n` +
        `• Duration: ${loan.durationDays} days`
      ).join('\n\n')
    }`;
  }

  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const action = query.data;

    try {
      switch (action) {
        case 'analyze_loans':
          await this.handleLoanAnalysis(chatId, query.from);
          return true;

        case 'retry_loans':
          await this.handleLoansCommand(chatId, query.from);
          return true;

        case 'goto_settings':
          await this.bot.sendMessage(
            chatId,
            'Please configure your wallet in settings first.',
            {
              reply_markup: {
                inline_keyboard: [[
                  { text: '⚙️ Go to Settings', callback_data: 'settings' }
                ]]
              }
            }
          );
          return true;
      }
    } catch (error) {
      console.error('Error handling loans action:', error);
      await this.showErrorMessage(chatId, error, 'retry_loans');
    }
    return false;
  }

  async handleLoanAnalysis(chatId, userInfo) {
    const userData = await this.getUserData(userInfo.id);
    if (!userData?.pendingLoans) {
      await this.bot.sendMessage(
        chatId,
        '❌ No loan data available for analysis. Please fetch loans first.'
      );
      return;
    }

    const loadingMsg = await this.showLoadingMessage(chatId, '😼 Analyzing loans...');
    
    try {
      const prompt = `Analyze these loans for meme investment opportunities: ${JSON.stringify(userData.pendingLoans)}`;
      const analysis = await aiService.generateResponse(prompt, 'investment', userInfo.id);
      
      await this.deleteMessage(chatId, loadingMsg.message_id);
      await this.simulateTyping(chatId);
      
      const keyboard = this.createKeyboard([
        [{ text: '🔄 Refresh Loans', callback_data: 'retry_loans' }],
        [{ text: '↩️ Back to Menu', callback_data: '/start' }]
      ]);

      await this.bot.sendMessage(chatId, analysis, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

      await this.clearState(userInfo.id);
    } catch (error) {
      if (loadingMsg) {
        await this.deleteMessage(chatId, loadingMsg.message_id);
      }
      throw error;
    }
  }
}