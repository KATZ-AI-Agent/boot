import { NetworkProvider } from './base.js';
import { Connection, PublicKey } from '@solana/web3.js';

export class SolanaProvider extends NetworkProvider {
  constructor(networkConfig) {
    super();
    this.networkConfig = networkConfig;
    this.connection = null;
  }

  async initialize() {
    try {
      this.connection = new Connection(this.networkConfig.rpcUrl);
      return true;
    } catch (error) {
      console.error('Error initializing Solana provider:', error);
      throw error;
    }
  }

  async getGasPrice() {
    try {
      const { feeCalculator } = await this.connection.getRecentBlockhash();
      return {
        price: feeCalculator.lamportsPerSignature.toString(),
        formatted: `${feeCalculator.lamportsPerSignature / 1e9} SOL`
      };
    } catch (error) {
      console.error('Error getting Solana fees:', error);
      throw error;
    }
  }

  async getBlockNumber() {
    try {
      return this.connection.getSlot();
    } catch (error) {
      console.error('Error getting Solana slot:', error);
      throw error;
    }
  }

  async isContractAddress(address) {
    try {
      const pubkey = new PublicKey(address);
      const accountInfo = await this.connection.getAccountInfo(pubkey);
      return accountInfo?.executable || false;
    } catch (error) {
      console.error('Error checking Solana program:', error);
      throw error;
    }
  }
}