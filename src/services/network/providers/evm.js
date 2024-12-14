import { NetworkProvider } from './base.js';
import { ethers } from 'ethers';
import { Alchemy } from 'alchemy-sdk';
import { circuitBreakers } from '../../../core/circuit-breaker/index.js';
import { BREAKER_CONFIGS } from '../../../core/circuit-breaker/index.js';
import axios from 'axios';

const NETWORK_CONFIGS = {
  ethereum: {
    chainId: 1,
    name: 'mainnet',
    ensAddress: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
  },
  base: {
    chainId: 8453,
    name: 'base',
    ensAddress: null
  }
};

export class EVMProvider extends NetworkProvider {
  constructor(networkConfig) {
    super();
    if (!networkConfig?.rpcUrl) {
      throw new Error('Invalid network configuration: RPC URL is required');
    }

    this.networkConfig = networkConfig;
    this.provider = null;
    this.alchemy = null;
    this.gasPriceCache = {
      price: null,
      timestamp: 0,
      ttl: 12000 // 12 second cache
    };
    this.fallbackProviders = [];
    this.networkName = networkConfig.name.toLowerCase();
  }

  async initialize() {
    try {
      console.log(`🔄 Initializing EVMProvider for network: ${this.networkConfig.name}...`);

      // Get network configuration
      const networkInfo = NETWORK_CONFIGS[this.networkName] || {
        chainId: this.networkConfig.chainId,
        name: this.networkName
      };

      // Initialize primary provider with proper network configuration
      this.provider = new ethers.JsonRpcProvider(
        this.networkConfig.rpcUrl,
        {
          chainId: networkInfo.chainId,
          name: networkInfo.name,
          ensAddress: networkInfo.ensAddress
        }
      );

      // Add fallback providers
      if (this.networkConfig.fallbackRpcUrls?.length) {
        this.fallbackProviders = this.networkConfig.fallbackRpcUrls.map(url => 
          new ethers.JsonRpcProvider(url, networkInfo)
        );
      }

      // Initialize Alchemy if API key is provided
      if (this.networkConfig.alchemyApiKey) {
        this.alchemy = new Alchemy({
          apiKey: this.networkConfig.alchemyApiKey,
          network: networkInfo.name
        });
      }

      // Test connection
      const blockNumber = await this.provider.getBlockNumber();
      console.log(`✅ EVMProvider initialized for ${this.networkConfig.name}. Latest Block: ${blockNumber}`);

      return true;
    } catch (error) {
      console.error(`❌ Error initializing EVMProvider for ${this.networkConfig.name}:`, error);
      throw error;
    }
  }

  async getGasPrice() {
    return circuitBreakers.executeWithBreaker(
      'network',
      async () => {
        try {
          // Check cache first
          if (this.isGasPriceCacheValid()) {
            return this.gasPriceCache.price;
          }

          // Try multiple methods to get gas price
          const gasPrice = await this.fetchGasPriceWithFallback();
          
          // Update cache
          this.gasPriceCache = {
            price: gasPrice,
            timestamp: Date.now(),
            ttl: 12000
          };

          return gasPrice;
        } catch (error) {
          console.error(`❌ Error fetching gas price for ${this.networkConfig.name}:`, error);
          throw error;
        }
      },
      BREAKER_CONFIGS.network
    );
  }

  async fetchGasPriceWithFallback() {
    const errors = [];

    // Method 1: Try primary provider
    try {
      const feeData = await this.provider.getFeeData();
      if (feeData?.gasPrice) {
        return {
          price: feeData.gasPrice.toString(),
          formatted: `${ethers.formatUnits(feeData.gasPrice, 'gwei')} Gwei`
        };
      }
    } catch (error) {
      errors.push({ method: 'primary', error });
    }

    // Method 2: Try fallback providers
    for (const provider of this.fallbackProviders) {
      try {
        const feeData = await provider.getFeeData();
        if (feeData?.gasPrice) {
          return {
            price: feeData.gasPrice.toString(),
            formatted: `${ethers.formatUnits(feeData.gasPrice, 'gwei')} Gwei`
          };
        }
      } catch (error) {
        errors.push({ method: 'fallback', error });
      }
    }

    // Method 3: Try Alchemy if available
    if (this.alchemy) {
      try {
        const gasPrice = await this.alchemy.core.getGasPrice();
        return {
          price: gasPrice.toString(),
          formatted: `${ethers.formatUnits(gasPrice, 'gwei')} Gwei`
        };
      } catch (error) {
        errors.push({ method: 'alchemy', error });
      }
    }

    // Method 4: Direct RPC call as last resort
    try {
      const response = await axios.post(this.networkConfig.rpcUrl, {
        jsonrpc: '2.0',
        method: 'eth_gasPrice',
        params: [],
        id: 1
      });

      if (response.data?.result) {
        const gasPrice = BigInt(response.data.result);
        return {
          price: gasPrice.toString(),
          formatted: `${ethers.formatUnits(gasPrice, 'gwei')} Gwei`
        };
      }
    } catch (error) {
      errors.push({ method: 'rpc', error });
    }

    // If all methods fail, throw comprehensive error
    throw new Error(`Failed to fetch gas price using all methods: ${JSON.stringify(errors)}`);
  }

  isGasPriceCacheValid() {
    return (
      this.gasPriceCache.price &&
      Date.now() - this.gasPriceCache.timestamp < this.gasPriceCache.ttl
    );
  }

  async estimateGas(transaction) {
    return circuitBreakers.executeWithBreaker(
      'network',
      async () => {
        try {
          const gasEstimate = await this.provider.estimateGas(transaction);
          const gasPrice = await this.getGasPrice();
          
          return {
            gasLimit: gasEstimate.toString(),
            gasPrice: gasPrice.price,
            totalCost: (BigInt(gasEstimate) * BigInt(gasPrice.price)).toString(),
            formatted: `${ethers.formatEther(BigInt(gasEstimate) * BigInt(gasPrice.price))} ETH`
          };
        } catch (error) {
          console.error('Error estimating gas:', error);
          throw error;
        }
      },
      BREAKER_CONFIGS.network
    );
  }

  async sendTransaction(signedTransaction) {
    return circuitBreakers.executeWithBreaker(
      'network',
      async () => {
        try {
          const tx = await this.provider.broadcastTransaction(signedTransaction);
          return await tx.wait();
        } catch (error) {
          console.error('Error sending transaction:', error);
          throw error;
        }
      },
      BREAKER_CONFIGS.network
    );
  }

  async getTransactionReceipt(txHash) {
    return circuitBreakers.executeWithBreaker(
      'network',
      async () => {
        try {
          return await this.provider.getTransactionReceipt(txHash);
        } catch (error) {
          console.error('Error getting transaction receipt:', error);
          throw error;
        }
      },
      BREAKER_CONFIGS.network
    );
  }

  async validateTransaction(transaction) {
    try {
      const [gasEstimate, balance] = await Promise.all([
        this.estimateGas(transaction),
        this.provider.getBalance(transaction.from)
      ]);

      const totalCost = BigInt(gasEstimate.totalCost);
      const hasEnoughBalance = balance >= totalCost;

      return {
        isValid: hasEnoughBalance,
        estimatedCost: gasEstimate.formatted,
        balance: ethers.formatEther(balance),
        errors: hasEnoughBalance ? [] : ['Insufficient balance for gas']
      };
    } catch (error) {
      console.error('Error validating transaction:', error);
      throw error;
    }
  }

  async cleanup() {
    try {
      if (this.provider) {
        await this.provider.destroy();
        this.provider = null;
      }

      // Cleanup fallback providers
      for (const provider of this.fallbackProviders) {
        await provider.destroy();
      }
      this.fallbackProviders = [];

      // Clear cache
      this.gasPriceCache = {
        price: null,
        timestamp: 0,
        ttl: 12000
      };

      console.log(`✅ Cleaned up EVMProvider for ${this.networkConfig.name}`);
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}