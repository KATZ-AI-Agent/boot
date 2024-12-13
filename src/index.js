import { EventEmitter } from 'events';
import { bot } from './core/bot.js';
import { setupCommands } from './commands/index.js';
import { MessageHandler } from './core/MessageHandler.js';
import { db } from './core/database.js';
import { ErrorHandler } from './core/errors/index.js';

async function startAgent() {
  try {
    console.log('🚀 Starting KATZ! AI Agent...');

    // 1. Connect to database
    await db.connect();

    // 2. Set up command registry
    const commandRegistry = setupCommands(bot);

    // 3. Initialize message handler
    const messageHandler = new MessageHandler(bot, commandRegistry);
    await messageHandler.initialize();

    // 4. Set up error handlers
    ErrorHandler.initializeGlobalHandlers();

    console.log('✅ KATZ AI Agent is up and running!');
    return { bot, commandRegistry, messageHandler };
  } catch (error) {
    console.error('❌ Error starting KATZ AI Agent:', error);
    await cleanup(bot);
    process.exit(1);
  }
}

async function cleanup(botInstance) {
  console.log('🧹 Cleaning up...');
  try {
    await db.disconnect();
    if (botInstance) {
      await botInstance.stopPolling();
    }
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
}

// Start the agent
const agent = await startAgent();

// Handle shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT. Shutting down...');
  await cleanup(agent.bot);
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM. Shutting down...');
  await cleanup(agent.bot);
  process.exit(0);
});