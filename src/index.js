import dotenv from 'dotenv';
dotenv.config();

import { bot } from './core/bot.js';
import { setupCommands } from './commands/index.js';
import { MessageHandler } from './core/MessageHandler.js';
import { db } from './core/database.js';
import { pumpFunService } from './services/pumpfun/index.js';
import { walletService } from './services/wallet/index.js';
import { networkService } from './services/network/index.js';
import { ErrorHandler } from './core/errors/index.js';
import { setTimeout } from 'timers/promises';

// Cleanup and Shutdown Handling
let isShuttingDown = false;

async function cleanup(botInstance) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('🛑 Shutting down AI Agent...');
  try {
    await db.disconnect();
    pumpFunService.disconnect?.();
    walletService.cleanup();
    networkService.cleanup();

    if (botInstance) {
      await botInstance.stopPolling();
    }

    console.log('✅ Cleanup completed.');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    isShuttingDown = false;
  }
}

async function initializeService(serviceName, service) {
  console.log(`🔧 Initializing ${serviceName}...`);
  await service.initialize();
  console.log(`✅ ${serviceName} initialized successfully.`);
}

async function startAgent() {
  try {
    console.log('🚀 Starting KATZ AI Agent...');

    // 1. Database Initialization
    console.log('📡 Connecting to MongoDB...');
    await db.connect();

    // 2. Command Registry Setup
    console.log('📜 Setting up command registry...');
    const commandRegistry = await setupCommands(bot);

    // 3. Message Handler Initialization
    console.log('🎛 Setting up MessageHandler...');
    const messageHandler = new MessageHandler(bot, commandRegistry);
    await messageHandler.initialize();

    // 4. Independent Services Initialization (in Parallel)
    console.log('🔧 Initializing core services...');
    await Promise.all([
      initializeService('WalletService', walletService),
      initializeService('NetworkService', networkService),
    ]);

    // 5. Start Telegram Bot Polling
    console.log('🤖 Starting Telegram bot...');
    await bot.startPolling();
    console.log('✅ Bot is now polling.');

    console.log('✅ KATZ AI Agent is up and running!');
    return bot;
  } catch (error) {
    console.error('❌ Error during agent startup:', error);
    await cleanup(bot);
    process.exit(1);
  }
}

// Error Handlers
function setupErrorHandlers(botInstance) {
  process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received. Shutting down...');
    await cleanup(botInstance);
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received. Shutting down...');
    await cleanup(botInstance);
    process.exit(0);
  });

  process.on('uncaughtException', async (error) => {
    console.error('❌ Uncaught Exception:', error);
    await ErrorHandler.handle(error);
  });

  process.on('unhandledRejection', async (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
    await ErrorHandler.handle(reason);
  });
}

// Start the Agent
(async () => {
  const botInstance = await startAgent();
  setupErrorHandlers(botInstance);
})();
