import dotenv from 'dotenv';
dotenv.config();

import { bot } from './core/bot.js';
import { setupCommands } from './commands/index.js';
import { setupEventHandlers } from './events/index.js';
import { db } from './core/database.js';
import { pumpFunService } from './services/pumpfun/index.js';
import { gemsService } from './services/gems/GemsService.js';
import { walletService } from './services/wallet/index.js';
import { networkService } from './services/network/index.js';
import { healthMonitor } from './core/health/HealthMonitor.js';
import { monitoringSystem } from './core/monitoring/Monitor.js';
import { rateLimiter } from './core/rate-limiting/RateLimiter.js';
import { startMonitoringDashboard } from './core/monitoring/Dashboard.js';
import { ErrorHandler } from './core/errors/index.js';
import { setTimeout } from 'timers/promises';

let isShuttingDown = false;

async function cleanup(botInstance) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('🛑 Shutting down AI Agent...');
  try {
    await db.disconnect();
    if (pumpFunService.disconnect) {
      await pumpFunService.disconnect();
    } else {
      console.warn('pumpFunService does not have a disconnect method.');
    }
    walletService.cleanup();
    networkService.cleanup();
    healthMonitor.cleanup();

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

async function monitoredInitialization(serviceName, service) {
  console.log(`Initializing ${serviceName}...`);
  try {
    await service.initialize();
    console.log(`✅ ${serviceName} initialized successfully.`);
  } catch (error) {
    console.error(`❌ ${serviceName} failed to initialize:`, error.message);
    throw error;
  }
}

async function startAgent() {
  try {
    console.log('🚀 Starting KATZ! AI Agent...');

    // 1. **Database Connection**
    console.log('📡 Connecting to MongoDB...');
    await db.connect();

    // 2. **Initialize Independent Services in Parallel**
    console.log('🔧 Initializing independent services...');
    await Promise.all([
      monitoredInitialization('RateLimiter', rateLimiter),
      monitoredInitialization('WalletService', walletService),
      monitoredInitialization('NetworkService', networkService),
    ]);

    // 3. **Sequential Initialization for Dependent Services**
    console.log('🔗 Connecting Pumpfun services...');
    await pumpFunService.connect(); // pumpFun may depend on networkService or walletService.

    // 4. Gem Service
    console.log('🔗 Connecting Gem services...');
    await gemsService.initialize();

    // 5. System Monitoring Stats Service
    console.log('🔍 Initializing System Stat Service...');
    await monitoringSystem.initialize();

    // 6. Services Health Monitors
    console.log('🔍 Initializing Health Monitor...');
    await healthMonitor.initialize();

    // 7. **Start Telegram Bot**
    console.log('🤖 Starting Telegram Interface...');
    const botInstance = bot;

    console.log('📜 Setting up Telegram command handlers...');
    setupCommands(botInstance);

    console.log('🎛 Setting up Telegram event handlers...');
    setupEventHandlers(botInstance, { rateLimiter });

    // 8. **Start Health Monitoring and Dashboard**
    console.log('🔍 Starting Agent health monitoring...');
    healthMonitor.startMonitoring();

    console.log('📊 Starting Agent monitoring dashboard...');
    startMonitoringDashboard();

    console.log('✅ KATZ AI Agent is up and running!');
    return botInstance;

  } catch (error) {
    console.error('❌ Error starting KATZ AI Agent:', error);
    await cleanup(bot);
    process.exit(1);
  }
}

function setupErrorHandlers(botInstance) {
  process.on('SIGINT', async () => {
    console.log('🛑 Received SIGINT. Shutting down...');
    await cleanup(botInstance);
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('🛑 Received SIGTERM. Shutting down...');
    await cleanup(botInstance);
    process.exit(0);
  });

  process.on('uncaughtException', async (error) => {
    console.error('❌ Uncaught Exception:', error);
    await ErrorHandler.handle(error);
  });

  process.on('unhandledRejection', async (reason) => {
    console.error('❌ Unhandled Promise Rejection:', reason);
    await ErrorHandler.handle(reason);
  });
}

// Install global error handlers
ErrorHandler.initializeGlobalHandlers();

// Start the agent
(async () => {
  const botInstance = await startAgent();
  setupErrorHandlers(botInstance);
})();
