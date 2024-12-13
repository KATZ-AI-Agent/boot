import { EventEmitter } from 'events';
import { NETWORKS, NETWORK_DISPLAY_NAMES } from '../../core/constants.js';
import { config } from '../../core/config.js';
import { EVMProvider } from './providers/evm.js';
import { SolanaProvider } from './providers/solana.js';
import { UserState } from '../../utils/userState.js';

class NetworkService extends EventEmitter {
  constructor() {
    super();
    this.defaultNetwork = NETWORKS.ETHEREUM;

    // Initialize providers lazily
    this.providers = {
      [NETWORKS.ETHEREUM]: null,
      [NETWORKS.BASE]: null,
      [NETWORKS.SOLANA]: null,
    };

    this.initialized = false;
  }

  async initialize() {
    try {
      console.log('🌐 Initializing network providers...');

      // Lazy-load providers only when initializing
      this.providers[NETWORKS.ETHEREUM] = new EVMProvider(config.getNetworkConfig(NETWORKS.ETHEREUM));
      this.providers[NETWORKS.BASE] = new EVMProvider(config.getNetworkConfig(NETWORKS.BASE));
      this.providers[NETWORKS.SOLANA] = new SolanaProvider(config.getNetworkConfig(NETWORKS.SOLANA));

      // Initialize all providers in parallel
      await Promise.all(
        Object.values(this.providers).map((provider) => provider.initialize())
      );

      this.initialized = true;
      console.log('✅ NetworkService initialized successfully.');
      this.emit('initialized');
      return true;
    } catch (error) {
      this.initialized = false;
      console.error('❌ NetworkService initialization failed:', error);
      this.emit('error', error);
      throw error;
    }
  }

  // Add this method for health checks
  async checkHealth() {
    const results = {};
    for (const [network, provider] of Object.entries(this.providers)) {
      if (!provider) {
        results[network] = { status: 'unhealthy', message: 'Provider not initialized' };
        continue;
      }

      try {
        const blockNumber = await provider.getBlockNumber(); // Basic connectivity test
        results[network] = { status: 'healthy', blockNumber };
      } catch (error) {
        results[network] = { status: 'unhealthy', message: error.message };
      }
    }
    return results;
  }

  cleanup() {
    console.log('🧹 Cleaning up NetworkService...');
    this.initialized = false;
    this.removeAllListeners();

    Object.values(this.providers).forEach((provider) => {
      if (provider && provider.cleanup) {
        try {
          provider.cleanup();
        } catch (error) {
          console.error('❌ Error during provider cleanup:', error);
        }
      }
    });

    console.log('✅ NetworkService cleaned up successfully.');
  }
}

export const networkService = new NetworkService();
