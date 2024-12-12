import { EVMWallet } from './wallets/evm.js';
import { SolanaWallet } from './wallets/solana.js';
import { NETWORKS } from '../../core/constants.js';
import { config } from '../../core/config.js';
import { db } from '../../core/database.js';
import { encrypt, decrypt } from '../../utils/encryption.js';
import { EventEmitter } from 'events';
import { ErrorHandler } from '../../core/errors/index.js'; // Centralized error handling

class WalletService extends EventEmitter {
  constructor() {
    super();
    this.walletProviders = {
      [NETWORKS.ETHEREUM]: new EVMWallet(config.networks.ethereum),
      [NETWORKS.BASE]: new EVMWallet(config.networks.base),
      [NETWORKS.SOLANA]: new SolanaWallet(config.networks.solana),
    };
    this.walletCache = new Map();
    this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    this.usersCollection = null;
    this.metricsCollection = null; // For storing wallet tallies
  }

  async initialize() {
    try {
      const database = db.getDatabase();
      this.usersCollection = database.collection('users');
      this.metricsCollection = database.collection('walletMetrics');

      // Ensure tallies are initialized in the database
      await this.initializeMetrics();

      console.log('✅ WalletService initialized successfully.');
      this.emit('initialized');
    } catch (error) {
      await ErrorHandler.handle(error, null, null, 'Error initializing WalletService');
      throw error;
    }
  }

  async initializeMetrics() {
    try {
      // Ensure metrics for each network exist
      const networks = [NETWORKS.ETHEREUM, NETWORKS.BASE, NETWORKS.SOLANA];
      for (const network of networks) {
        await this.metricsCollection.updateOne(
          { network },
          { $setOnInsert: { network, walletCount: 0 } }, // Initialize walletCount if it doesn't exist
          { upsert: true }
        );
      }
      console.log('✅ Wallet metrics initialized.');
    } catch (error) {
      console.error('❌ Error initializing wallet metrics:', error);
      throw error;
    }
  }

  async createWallet(userId, network) {
    try {
      const provider = this.getProvider(network);
      const wallet = await provider.createWallet();

      const encryptedData = {
        address: wallet.address,
        encryptedPrivateKey: encrypt(wallet.privateKey),
        encryptedMnemonic: encrypt(wallet.mnemonic),
        createdAt: new Date(),
      };

      await this.usersCollection.updateOne(
        { telegramId: userId.toString() },
        { $push: { [`wallets.${network}`]: encryptedData } },
        { upsert: true }
      );

      // Increment wallet tally
      await this.incrementWalletTally(network);

      this.cacheWallet(userId, wallet.address, { ...wallet, network });

      this.emit('walletCreated', { userId, network, address: wallet.address });

      return wallet;
    } catch (error) {
      await ErrorHandler.handle(error, null, null, 'Error creating wallet');
      throw error;
    }
  }

  async incrementWalletTally(network) {
    try {
      await this.metricsCollection.updateOne(
        { network },
        { $inc: { walletCount: 1 } } // Increment the tally for the network
      );
      console.log(`✅ Incremented wallet tally for ${network}`);
    } catch (error) {
      console.error(`❌ Error incrementing wallet tally for ${network}:`, error);
      throw error;
    }
  }

  async fetchWalletMetrics() {
    try {
      const metrics = await this.metricsCollection.find({}).toArray();

      const formattedMetrics = metrics.map((metric) => ({
        network: metric.network,
        walletCount: metric.walletCount,
        lastUpdated: metric.lastUpdated || new Date(),
      }));

      console.log('✅ Fetched wallet metrics successfully:', formattedMetrics);

      return formattedMetrics;
    } catch (error) {
      console.error('❌ Error fetching wallet metrics:', error);
      throw new Error('Failed to fetch wallet metrics');
    }
  }

  async getWallet(userId, address) {
    try {
      const cachedWallet = this.getFromCache(userId, address);
      if (cachedWallet) {
        return cachedWallet;
      }

      const user = await this.usersCollection.findOne({ telegramId: userId.toString() }).lean();
      if (!user?.wallets) return null;

      for (const [network, wallets] of Object.entries(user.wallets)) {
        const wallet = wallets.find(w => w.address.toLowerCase() === address.toLowerCase());
        if (wallet) {
          const decryptedWallet = {
            address: wallet.address,
            network,
            privateKey: decrypt(wallet.encryptedPrivateKey),
            mnemonic: wallet.encryptedMnemonic ? decrypt(wallet.encryptedMnemonic) : null,
            createdAt: wallet.createdAt,
          };

          this.cacheWallet(userId, address, decryptedWallet);
          return decryptedWallet;
        }
      }

      return null;
    } catch (error) {
      await ErrorHandler.handle(error, null, null, 'Error fetching wallet');
      throw error;
    }
  }

  async getWallets(userId) {
    try {
      const user = await this.usersCollection.findOne(
        { telegramId: userId.toString() },
        { projection: { wallets: 1 } }
      ).lean();

      if (!user?.wallets) return [];

      return Object.entries(user.wallets).flatMap(([network, wallets]) =>
        wallets.map(w => ({
          address: w.address,
          network,
          createdAt: w.createdAt,
        }))
      );
    } catch (error) {
      await ErrorHandler.handle(error, null, null, 'Error fetching wallets');
      throw error;
    }
  }

  async deleteWallet(userId, network, address) {
    try {
      const result = await this.usersCollection.updateOne(
        { telegramId: userId.toString() },
        { $pull: { [`wallets.${network}`]: { address } } }
      );

      if (result.modifiedCount > 0) {
        this.removeFromCache(userId, address);
        this.emit('walletDeleted', { userId, network, address });
        return true;
      }

      return false;
    } catch (error) {
      await ErrorHandler.handle(error, null, null, 'Error deleting wallet');
      throw error;
    }
  }

  cacheWallet(userId, address, walletData) {
    const key = `${userId}-${address}`;
    this.walletCache.set(key, { data: walletData, timestamp: Date.now() });
  }

  getFromCache(userId, address) {
    const key = `${userId}-${address}`;
    const cached = this.walletCache.get(key);

    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }

    if (cached) {
      this.walletCache.delete(key);
    }

    return null;
  }

  removeFromCache(userId, address) {
    const key = `${userId}-${address}`;
    this.walletCache.delete(key);
  }

  cleanup() {
    this.walletCache.clear();
    this.removeAllListeners();
    Object.values(this.walletProviders).forEach(provider => provider.cleanup?.());
    console.log('✅ WalletService cleaned up successfully.');
  }

  async checkHealth() {
    const results = [];
    for (const [network, provider] of Object.entries(this.walletProviders)) {
      try {
        await provider.checkHealth(); // Assuming each provider has a `checkHealth` method
        results.push({ network, status: 'healthy' });
      } catch (error) {
        results.push({ network, status: 'unhealthy', error: error.message });
        console.error(`❌ Health check failed for ${network}:`, error.message);
      }
    }
    return results;
  }
}

export const walletService = new WalletService();

// Set up periodic cache cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of walletService.walletCache.entries()) {
    if (now - value.timestamp > walletService.CACHE_DURATION) {
      walletService.walletCache.delete(key);
    }
  }
}, 300000); // Run every 5 minutes
