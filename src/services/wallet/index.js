console.log('✅ WalletService module is being loaded...');

import { User } from '../../models/User.js';
import { EVMWallet } from './wallets/evm.js';
import { SolanaWallet } from './wallets/solana.js';
import { NETWORKS } from '../../core/constants.js';
import { config } from '../../core/config.js';
import { db } from '../../core/database.js';
import { encrypt, decrypt } from '../../utils/encryption.js';
import { EventEmitter } from 'events';
import { ErrorHandler } from '../../core/errors/index.js';

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
        this.metricsCollection = null;
    }

    async initialize() {
      if (this.isInitialized) return;
  
      try {
          // Initialize database connection
          await db.connect();
          const database = db.getDatabase();
          
          // Use Mongoose model instead of raw collection
          this.usersCollection = User.model('User');
          
          // Initialize providers
          await Promise.all(Object.entries(this.networkConfig).map(async ([network, config]) => {
              const Provider = this.getProviderClass(network);
              this.walletProviders[network] = new Provider(config);
              await this.walletProviders[network].initialize();
          }));
  
          this.isInitialized = true;
          console.log('✅ WalletService initialized successfully');
          return true;
      } catch (error) {
          console.error('❌ Error initializing WalletService:', error);
          throw error;
      }
  }
  
  async getWallets(userId) {
      if (!this.isInitialized) {
          throw new Error('WalletService is not initialized. Call initialize() before use.');
      }
  
      try {
          // Use Mongoose findOne instead of raw collection
          const user = await User.findOne({ telegramId: userId.toString() });
          if (!user) return [];
  
          const wallets = [];
          for (const [network, networkWallets] of Object.entries(user.wallets)) {
              wallets.push(...networkWallets.map(wallet => ({
                  ...wallet.toObject(),
                  network
              })));
          }
  
          return wallets;
      } catch (error) {
          console.error('Error fetching wallets:', error);
          throw error;
      }
  }  

    async initializeMetrics() {
        try {
            const networks = [NETWORKS.ETHEREUM, NETWORKS.BASE, NETWORKS.SOLANA];
            for (const network of networks) {
                await this.metricsCollection.updateOne(
                    { network },
                    { $setOnInsert: { network, walletCount: 0 } },
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
            if (!this.usersCollection) {
                throw new Error('WalletService is not initialized. Call initialize() before use.');
            }

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
                { $inc: { walletCount: 1 } }
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

    async getProvider(network) {
      const provider = this.walletProviders[network];
      if (!provider) {
          throw new Error(`Unsupported network: ${network}`);
      }
      return provider;
    }

    async getWallet(userId, address) {
        if (!this.isInitialized) {
            throw new Error('WalletService is not initialized');
        }

        try {
            // Check cache first
            const cacheKey = `${userId}:${address}`;
            const cached = this.walletCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
                return cached.wallet;
            }

            const user = await User.findOne({ telegramId: userId.toString() });
            if (!user) return null;

            // Search through all networks
            for (const [network, wallets] of Object.entries(user.wallets)) {
                const wallet = wallets.find(w => w.address === address);
                if (wallet) {
                    const decryptedWallet = {
                        address: wallet.address,
                        privateKey: decrypt(wallet.encryptedPrivateKey),
                        mnemonic: decrypt(wallet.encryptedMnemonic),
                        network,
                        type: wallet.type || 'internal',
                        createdAt: wallet.createdAt
                    };

                    // Update cache
                    this.cacheWallet(userId, address, decryptedWallet);
                    return decryptedWallet;
                }
            }

            return null;
        } catch (error) {
            console.error('Error getting wallet:', error);
            throw error;
        }
    }

    async setAutonomousWallet(userId, address) {
        if (!this.isInitialized) {
            throw new Error('WalletService is not initialized');
        }

        try {
            const wallet = await this.getWallet(userId, address);
            if (!wallet) {
                throw new Error('Wallet not found');
            }

            await User.updateOne(
                { telegramId: userId.toString(), [`wallets.${wallet.network}`]: { $elemMatch: { address } } },
                { $set: { [`wallets.${wallet.network}.$.isAutonomous`]: true } }
            );

            return true;
        } catch (error) {
            console.error('Error setting autonomous wallet:', error);
            throw error;
        }
    }

    async getBalance(userId, address) {
        if (!this.isInitialized) {
            throw new Error('WalletService is not initialized');
        }

        try {
            const wallet = await this.getWallet(userId, address);
            if (!wallet) {
                throw new Error('Wallet not found');
            }

            const provider = await this.getProvider(wallet.network);
            return await provider.getBalance(address);
        } catch (error) {
            console.error('Error getting balance:', error);
            throw error;
        }
    }

    cacheWallet(userId, address, wallet) {
        const cacheKey = `${userId}:${address}`;
        this.walletCache.set(cacheKey, {
            wallet,
            timestamp: Date.now()
        });
    }

    async incrementWalletTally(network) {
        try {
            const database = db.getDatabase();
            await database.collection('walletMetrics').updateOne(
                { network },
                { $inc: { walletCount: 1 } }
            );
        } catch (error) {
            console.error('Error incrementing wallet tally:', error);
            // Non-critical error, don't throw
        }
    }

    async isAutonomousWallet(userId, network, address) {
        try {
            const user = await User.findOne({ telegramId: userId.toString() });
            if (!user?.wallets?.[network]) return false;

            const wallet = user.wallets[network].find(w => w.address === address);
            return wallet?.isAutonomous || false;
        } catch (error) {
            console.error('Error checking autonomous status:', error);
            return false;
        }
    }

    async deleteWallet(userId, network, address) {
        try {
            if (!this.usersCollection) {
                throw new Error('WalletService is not initialized. Call initialize() before use.');
            }

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

// Periodic cache cleanup
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of walletService.walletCache.entries()) {
        if (now - value.timestamp > walletService.CACHE_DURATION) {
            walletService.walletCache.delete(key);
        }
    }
}, 300000); // Every 5 minutes
