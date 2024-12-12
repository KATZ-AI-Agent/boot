import { Command } from '../base/Command.js';
import { dextools } from '../../services/dextools/index.js';
import { twitterService } from '../../services/twitter/index.js';
import { networkState } from '../../services/networkState.js';
import { USER_STATES } from '../../core/constants.js';

export class ScanCommand extends Command {
  constructor(bot) {
    super(bot);
    this.command = '/scan';
    this.description = 'Scan token details';
    this.pattern = /^(\/scan|🔍 Scan Token)$/;
  }

  async execute(msg) {
    const chatId = msg.chat.id;
    await this.showScanOptions(chatId);
  }

  async showScanOptions(chatId) {
    const currentNetwork = await networkService.getCurrentNetwork(chatId);
    
    const keyboard = this.createKeyboard([
      [{ text: '📝 Enter Token Address', callback_data: 'scan_input' }],
      [{ text: '🔄 Switch Network', callback_data: 'switch_network' }],
      [{ text: '↩️ Back to Menu', callback_data: '/start' }]
    ]);

    await this.bot.sendMessage(
      chatId,
      `*Token Scanner* 🔍\n\n` +
      `Current Network: *${networkService.getNetworkDisplay(currentNetwork)}*\n\n` +
      'Analyze any token with detailed metrics:\n\n' +
      '• Price & Volume\n' +
      '• LP Value & Distribution\n' +
      '• Security Score & Risks\n' +
      '• Social Links & Info\n\n' +
      'Enter a token address to begin scanning.',
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
        case 'scan_input':
          await this.setState(query.from.id, USER_STATES.WAITING_SCAN_INPUT);
          await this.bot.sendMessage(
            chatId,
            '*Token Address* 📝\n\n' +
            'Please enter the token contract address you want to scan:',
            { parse_mode: 'Markdown' }
          );
          return true;

        case 'retry_scan':
          await this.showScanOptions(chatId);
          return true;
      }
    } catch (error) {
      console.error('Error handling scan action:', error);
      await this.showErrorMessage(chatId, error, 'retry_scan');
    }
    return false;
  }

  async handleInput(msg) {
    const chatId = msg.chat.id;
    const state = await this.getState(msg.from.id);

    if (state === USER_STATES.WAITING_SCAN_INPUT && msg.text) {
      await this.handleTokenScan(chatId, msg.text.trim(), msg.from);
      return true;
    }

    return false;
  }

  async handleTokenScan(chatId, address, userInfo) {
    const currentNetwork = await networkService.getCurrentNetwork(userInfo.id);
    const loadingMsg = await this.showLoadingMessage(
      chatId, 
      `😼 Scanning token on ${networkService.getNetworkDisplay(currentNetwork)}`
    );
    
    try {
      const analysis = await dextools.formatTokenAnalysis(currentNetwork, address);
      
      await this.deleteMessage(chatId, loadingMsg.message_id);
      await this.simulateTyping(chatId);

      const keyboard = this.createKeyboard([
        [{ text: '🔄 Scan Another', callback_data: 'scan_input' }],
        [{ text: '🔄 Switch Network', callback_data: 'switch_network' }],
        [{ text: '↩️ Back to Menu', callback_data: '/start' }]
      ]);

      await this.bot.sendMessage(chatId, analysis, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: keyboard
      });

      await this.clearState(userInfo.id);
    } catch (error) {
      console.error('Error scanning token:', error);
      if (loadingMsg) {
        await this.deleteMessage(chatId, loadingMsg.message_id);
      }
      await this.showErrorMessage(chatId, error, 'retry_scan');
    }
  }

  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const action = query.data;

    try {
      switch (action) {
        case 'scan_input':
          await this.setState(query.from.id, USER_STATES.WAITING_SCAN_INPUT);
          await this.bot.sendMessage(
            chatId,
            'Please enter the token address you want to scan:'
          );
          return true;

        case 'kol_check':
          const userData = await this.getUserData(query.from.id);
          if (userData?.lastScannedToken) {
            await this.showKOLAnalysis(chatId, userData.lastScannedToken);
          }
          return true;

        case 'retry_scan':
          await this.showScanOptions(chatId);
          return true;

        case 'load_more_tweets':
          const tweetData = await this.getUserData(query.from.id);
          if (tweetData?.lastScannedToken) {
            await this.showKOLAnalysis(chatId, tweetData.lastScannedToken, true);
          }
          return true;
      }
    } catch (error) {
      console.error('Error handling scan action:', error);
      await this.showErrorMessage(chatId, error, 'retry_scan');
    }
    return false;
  }

  async handleTokenScan(chatId, address, userInfo) {
    const currentNetwork = await networkState.getCurrentNetwork(userInfo.id);
    const loadingMsg = await this.showLoadingMessage(
      chatId, 
      `😼 Scanning token on ${networkState.getNetworkDisplay(currentNetwork)}`
    );
    
    try {
      const analysis = await dextools.formatTokenAnalysis(currentNetwork, address);
      
      // Store scanned token for KOL check
      await this.setUserData(userInfo.id, { lastScannedToken: {
        address,
        network: currentNetwork,
        symbol: analysis.tokenInfo?.symbol
      }});

      await this.deleteMessage(chatId, loadingMsg.message_id);
      await this.simulateTyping(chatId);

      const keyboard = this.createKeyboard([
        [{ text: '🔍 KOL Check', callback_data: 'kol_check' }],
        [{ text: '🔄 Scan Another', callback_data: 'scan_input' }],
        [{ text: '🔄 Switch Network', callback_data: 'switch_network' }],
        [{ text: '↩️ Back to Menu', callback_data: '/start' }]
      ]);

      await this.bot.sendMessage(chatId, analysis, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: keyboard
      });
    } catch (error) {
      console.error('Error scanning token:', error);
      if (loadingMsg) {
        await this.deleteMessage(chatId, loadingMsg.message_id);
      }
      await this.showErrorMessage(chatId, error, 'retry_scan');
    }
  }

  async showKOLAnalysis(chatId, token, loadMore = false) {
    const loadingMsg = await this.showLoadingMessage(chatId, '🔍 Fetching KOL mentions...');

    try {
      const tweets = await twitterService.searchTweets(token.symbol);
      
      if (!tweets.length) {
        await this.bot.sendMessage(
          chatId,
          'No recent KOL mentions found for this token.',
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '↩️ Back', callback_data: 'scan_input' }
              ]]
            }
          }
        );
        return;
      }

      const keyboard = this.createKeyboard([
        [{ text: '🔄 Load More', callback_data: 'load_more_tweets' }],
        [{ text: '↩️ Back', callback_data: 'scan_input' }]
      ]);

      let message = `*KOL Analysis for ${token.symbol}* 🔍\n\n`;
      
      tweets.slice(0, loadMore ? 10 : 5).forEach((tweet, i) => {
        message += `${i+1}. *${tweet.author.name}* ${tweet.author.verified ? '✅' : ''}\n` +
                  `@${tweet.author.username} (${tweet.author.followers} followers)\n\n` +
                  `${tweet.text}\n\n` +
                  `❤️ ${tweet.stats.likes} | 🔄 ${tweet.stats.retweets} | 👁️ ${tweet.stats.views}\n` +
                  `🕒 ${new Date(tweet.createdAt).toLocaleString()}\n\n`;
      });

      await this.deleteMessage(chatId, loadingMsg.message_id);
      await this.simulateTyping(chatId);

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: keyboard
      });
    } catch (error) {
      console.error('Error fetching KOL analysis:', error);
      if (loadingMsg) {
        await this.deleteMessage(chatId, loadingMsg.message_id);
      }
      await this.showErrorMessage(chatId, error, 'retry_scan');
    }
  }
}