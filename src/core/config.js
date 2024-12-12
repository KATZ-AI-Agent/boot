import dotenv from 'dotenv';
import { validateConfig } from '../utils/validation.js';
import { NETWORKS } from './constants.js';

dotenv.config();

class Config {
  constructor() {
    this.botToken = process.env.BOT_TOKEN;
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.smartContractAddress = process.env.SMART_CONTRACT_ADDRESS;
    this.mongoUri = process.env.MONGO_URI;
    this.mongoEncryptionKey = process.env.MONGO_ENCRYPTION_KEY;
    this.alchemyApiKey = process.env.ALCHEMY_API_KEY || 'ip7ONCr6sDycSojM_PZoWawrVM_2c0RW';
    this.solanaApiKey = process.env.SOLANA_API_KEY || 'ip7ONCr6sDycSojM_PZoWawrVM_2c0RW';
    this.apifyApiKey = process.env.APIFY_API_KEY

    // Network configurations
    this.networks = {
      [NETWORKS.ETHEREUM]: {
        name: 'Ethereum',
        rpcUrl: process.env.ETHEREUM_RPC_URL,
        chainId: 1,
      },
      [NETWORKS.BASE]: {
        name: 'Base',
        rpcUrl: process.env.BASE_RPC_URL,
        chainId: 8453,
      },
      [NETWORKS.SOLANA]: {
        name: 'Solana',
        rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      },
    };

    this.cacheSettings = {
      duration: 5 * 60 * 1000, // 5 minutes default
    };

    // Dashboard Monitoring TG End Point for KATZ Agent
    this.monitoring = {
      dashboardPort: process.env.DASHBOARD_PORT || 3000, // Default to port 3000
    };

    // Validate and initialize configuration
    validateConfig(this);
  }

  getNetworkConfig(network) {
    const networkConfig = this.networks[network];
    if (!networkConfig) {
      throw new Error(`Invalid network requested: ${network}`);
    }
    return networkConfig;
  }
  
}

export const config = new Config();
