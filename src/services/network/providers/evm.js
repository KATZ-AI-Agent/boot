import { NetworkProvider } from './base.js';
import { ethers } from 'ethers';
import { Alchemy } from 'alchemy-sdk';
import { config } from '../../../core/config.js';

export class EVMProvider extends NetworkProvider {
  constructor(networkConfig) {
    super();

    if (!networkConfig || typeof networkConfig.rpcUrl !== 'string' || typeof networkConfig.name !== 'string') {
      throw new Error('Invalid network configuration passed to EVMProvider.');
    }

    this.networkConfig = networkConfig;
    this.provider = null;
    this.alchemy = null;
    this.isInitialized = false;
  }

  /**
   * Initializes the provider by setting up ethers.js and Alchemy instances.
   */
  async initialize() {
    try {
      console.log(`🔄 Initializing EVMProvider for network: ${this.networkConfig.name}...`);

      // Create Ethers.js provider
      this.provider = new ethers.JsonRpcProvider(this.networkConfig.rpcUrl);

      // Create Alchemy instance (if API key is provided)
      if (config.alchemyApiKey) {
        this.alchemy = new Alchemy({
          apiKey: config.alchemyApiKey,
          network: this.networkConfig.name.toLowerCase(),
        });
      }

      // Test the provider by fetching the latest block number
      const blockNumber = await this.provider.getBlockNumber();
      console.log(`✅ EVMProvider initialized for ${this.networkConfig.name}. Latest Block: ${blockNumber}`);

      this.isInitialized = true;
    } catch (error) {
      console.error(`❌ Error initializing EVMProvider for ${this.networkConfig.name}:`, error);
      throw error;
    }
  }

    /**
   * Fetches the current gas price for a given network.
   * Dynamically creates instances of the provider based on the network type.
   *
   * @param {string} network - The name of the network (e.g., 'ethereum', 'base', 'solana').
   * @returns {Promise<number>} The gas price in Gwei (for EVM) or lamports (for Solana).
   */
    async fetchGasPrice(network) {
      try {
        if (!network || typeof network !== 'string') {
          throw new Error('Invalid network specified.');
        }

        let gasPrice;

        if (network === 'ethereum' || network === 'base') {
          // Create an EVMProvider instance dynamically
          const evmProvider = new EVMProvider({
            name: network,
            rpcUrl: config.networks[network]?.rpcUrl,
          });

          // Initialize the EVMProvider instance
          await evmProvider.initialize();

          // Fetch gas price using EVMProvider
          const rawGasPrice = await evmProvider.provider.getGasPrice(); // Native ethers.js method
          gasPrice = parseFloat(ethers.utils.formatUnits(rawGasPrice, 'gwei')); // Convert to Gwei

          console.log(`✅ Gas price for ${network}: ${gasPrice} Gwei`);
        } else if (network === 'solana') {
          // Create a SolanaProvider instance dynamically
          const solanaProvider = new SolanaProvider({
            name: network,
            rpcUrl: config.networks[network]?.rpcUrl,
          });

          // Initialize the SolanaProvider instance
          await solanaProvider.initialize();

          // Fetch gas price for Solana
          const feeCalculator = await solanaProvider.connection.getRecentBlockhash();
          gasPrice = feeCalculator?.feeCalculator?.lamportsPerSignature;

          console.log(`✅ Gas price for Solana: ${gasPrice} lamports`);
        } else {
          throw new Error(`Unsupported network type: ${network}`);
        }

        return gasPrice;
      } catch (error) {
        console.error(`❌ Error fetching gas price for ${network}:`, error.message);
        throw new Error(`Failed to fetch gas price for ${network}: ${error.message}`);
      }
    }

  /**
   * Fetches the latest block number from the Ethereum network.
   * @returns {number} The latest block number.
   */
  async getBlockNumber() {
    if (!this.isInitialized) {
      throw new Error('EVMProvider is not initialized. Call initialize() first.');
    }

    try {
      return await this.provider.getBlockNumber();
    } catch (error) {
      console.error(`❌ Error fetching block number for ${this.networkConfig.name}:`, error);
      throw error;
    }
  }

  /**
   * Checks whether a given address is a contract address.
   * @param {string} address The address to check.
   * @returns {boolean} True if the address is a contract, false otherwise.
   */
  async isContractAddress(address) {
    if (!this.isInitialized) {
      throw new Error('EVMProvider is not initialized. Call initialize() first.');
    }

    try {
      const code = await this.provider.getCode(address);
      return code !== '0x';
    } catch (error) {
      console.error(`❌ Error checking contract address for ${this.networkConfig.name}:`, error);
      throw error;
    }
  }

  /**
   * Cleans up the provider and releases resources.
   */
  cleanup() {
    try {
      if (this.provider) {
        console.log(`🧹 Cleaning up EVM Provider for ${this.networkConfig.name}...`);
        this.provider = null;
      }

      if (this.alchemy) {
        console.log(`🧹 Cleaning up Alchemy instance for ${this.networkConfig.name}...`);
        this.alchemy = null;
      }

      this.isInitialized = false;
      console.log(`✅ EVMProvider for ${this.networkConfig.name} cleaned up successfully.`);
    } catch (error) {
      console.error(`❌ Error during cleanup for ${this.networkConfig.name}:`, error);
    }
  }
}

// Helper to dynamically create providers based on config
export const createEVMProviders = () => {
  const providers = {};
  for (const [networkName, rpcUrl] of Object.entries(config.rpcUrls)) {
    providers[networkName] = new EVMProvider({ name: networkName, rpcUrl });
  }
  return providers;
};
