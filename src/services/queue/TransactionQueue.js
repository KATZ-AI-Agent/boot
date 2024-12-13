import PQueue from 'p-queue';
import { config } from '../../core/config.js';
import { EventEmitter } from 'events';
import { networkService } from '../../services/network/index.js';
import { walletService } from '../../services/wallet/index.js';
import { tradingService } from '../trading/index.js';
import { EVMProvider } from '../../services/network/providers/evm.js';
import { SolanaProvider } from '../../services/network/providers/solana.js';

class TransactionQueue extends EventEmitter {
  constructor() {
    super();
    
    // Separate queues for each network
    this.queues = {
      ethereum: new PQueue({ concurrency: 1 }),
      base: new PQueue({ concurrency: 1 }),
      solana: new PQueue({ concurrency: 1 })
    };

    // Track pending transactions
    this.pendingTransactions = new Map();
    
    // Track gas prices
    this.gasPrices = new Map();
    
    // Update gas prices every 5 minutes
    setInterval(() => this.updateGasPrices(), 300000);
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Create queues for each network
      for (const network of ['ethereum', 'base', 'solana']) {
        this.queues[network] = new PQueue({ 
          concurrency: 1,
          interval: network === 'solana' ? 500 : 1000, // Faster for Solana
          intervalCap: 1
        });
      }

      this.initialized = true;
      this.emit('✅ Transaction queue initialized');
    } catch (error) {
      console.error('❌ Error initializing transaction queue:', error);
      throw error;
    }
  }

  async addTransaction(tx) {
    try {
      // Validate transaction
      this.validateTransaction(tx);

      // Add to pending transactions
      this.pendingTransactions.set(tx.id, {
        ...tx,
        status: 'pending',
        addedAt: Date.now()
      });

      // Queue the transaction
      const result = await this.queues[tx.network].add(
        () => this.processTransaction(tx),
        {
          priority: tx.priority || 0
        }
      );

      this.emit('transactionComplete', {
        id: tx.id,
        result
      });

      return result;
    } catch (error) {
      console.error('❌ Error adding transaction:', error);
      this.emit('transactionFailed', {
        id: tx.id,
        error
      });
      throw error;
    }
  }

  validateTransaction(tx) {
    if (!tx.id || !tx.type || !tx.network || !tx.userId) {
      throw new Error('❌ Invalid transaction format');
    }

    if (!this.queues[tx.network]) {
      throw new Error(`❌ Unsupported network: ${tx.network}`);
    }
  }

  async processTransaction(tx) {
    try {
      // Check wallet balance
      const wallet = await walletService.getActiveWallet(tx.userId);
      const balance = await walletService.getBalance(tx.userId, wallet.address);

      if (balance < tx.estimatedGas) {
        throw new Error('❌ Insufficient balance for gas');
      }

      // Execute trade
      const result = await tradingService.executeTrade(
        tx.network,
        {
          action: tx.type,
          tokenAddress: tx.tokenAddress,
          amount: tx.amount,
          walletAddress: wallet.address
        }
      );

      // Update transaction status
      this.pendingTransactions.set(tx.id, {
        ...this.pendingTransactions.get(tx.id),
        status: 'complete',
        result,
        completedAt: Date.now()
      });

      return result;
    } catch (error) {
      // Update transaction status
      this.pendingTransactions.set(tx.id, {
        ...this.pendingTransactions.get(tx.id),
        status: 'failed',
        error: error.message,
        completedAt: Date.now()
      });

      throw error;
    }
  }

  async updateGasPrices() {
    try {
      const networks = Object.keys(this.queues);
      for (const network of networks) {
        try {
          let gasPrice;
          if (network === 'ethereum' || network === 'base') {
            // Initialize EVMProvider with the respective network config
            const evmProvider = new EVMProvider({ rpcUrl: config.networks[network].rpcUrl, name: network });
            await evmProvider.initialize();
            gasPrice = await evmProvider.getGasPrice();
          } else if (network === 'solana') {
            // Initialize SolanaProvider with the respective network config
            const solanaProvider = new SolanaProvider({ rpcUrl: config.networks[network].rpcUrl, name: network });
            await solanaProvider.initialize();
            gasPrice = await solanaProvider.getGasPrice();
          } else {
            throw new Error(`❌ Unsupported network type: ${network}`);
          }
  
          this.gasPrices.set(network, {
            price: gasPrice,
            timestamp: Date.now(),
          });
  
          console.log(`✅ Gas price for ${network}: ${gasPrice}`);
        } catch (error) {
          console.error(`❌ Error fetching gas price for ${network}:`, error);
          this.gasPrices.set(network, {
            price: 'unavailable',
            timestamp: Date.now(),
          });
        }
      }
    } catch (error) {
      console.error('❌ Error updating gas prices globally:', error);
    }
  }  

  getQueueStatus(network) {
    return {
      pending: this.queues[network].pending,
      size: this.queues[network].size,
      gasPrice: this.gasPrices.get(network)?.price
    };
  }

  getPendingTransactions(userId) {
    return Array.from(this.pendingTransactions.values())
      .filter(tx => tx.userId === userId && tx.status === 'pending');
  }

  pauseNetwork(network) {
    const queue = this.queues[network];
    if (queue) {
      queue.pause();
      this.emit('queuePaused', { network });
    }
  }

  resumeNetwork(network) {
    const queue = this.queues[network];
    if (queue) {
      queue.start();
      this.emit('queueResumed', { network });
    }
  }

  cleanup() {
    // Clear all queues
    Object.values(this.queues).forEach(queue => queue.clear());
    
    // Clear pending transactions
    this.pendingTransactions.clear();
    
    // Clear gas prices
    this.gasPrices.clear();
    
    // Remove all listeners
    this.removeAllListeners();
  }
}

export const transactionQueue = new TransactionQueue();

// Initialize queue
transactionQueue.initialize().catch(console.error);

// Handle cleanup
process.on('SIGINT', () => {
  transactionQueue.cleanup();
});

process.on('SIGTERM', () => {
  transactionQueue.cleanup();
});