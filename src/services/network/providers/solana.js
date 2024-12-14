import { NetworkProvider } from './base.js';
import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';

export class SolanaProvider extends NetworkProvider {
  constructor(networkConfig) {
    super();
    this.networkConfig = networkConfig;
    this.connection = null;
  }

  async initialize() {
    try {
      this.connection = new Connection(this.networkConfig.rpcUrl, 'confirmed');
      return true;
    } catch (error) {
      console.error('Error initializing Solana provider:', error);
      throw error;
    }
  }

  async getGasPrice() {
    try {
      // Use getLatestBlockhash instead of deprecated getRecentBlockhash
      const { value } = await this.connection.getLatestBlockhash('finalized');
      
      if (!value) {
        throw new Error('Failed to get latest blockhash');
      }

      return {
        price: value.feeCalculator?.lamportsPerSignature?.toString() || '0',
        formatted: `${(value.feeCalculator?.lamportsPerSignature || 0) / 1e9} SOL`
      };
    } catch (error) {
      // Fallback to RPC call if getLatestBlockhash fails
      try {
        const response = await axios.post(this.networkConfig.rpcUrl, {
          jsonrpc: '2.0',
          id: 1,
          method: 'getFees',
          params: []
        });

        if (response.data?.result?.feeCalculator?.lamportsPerSignature) {
          const fee = response.data.result.feeCalculator.lamportsPerSignature;
          return {
            price: fee.toString(),
            formatted: `${fee / 1e9} SOL`
          };
        }

        // If both methods fail, return default values
        return {
          price: '5000',
          formatted: '0.000005 SOL'
        };
      } catch (rpcError) {
        console.error('Error getting Solana fees:', rpcError);
        // Return default values as last resort
        return {
          price: '5000',
          formatted: '0.000005 SOL'
        };
      }
    }
  }

  async getBlockNumber() {
    try {
      return await this.connection.getSlot('finalized');
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

  async estimateGas(transaction) {
    try {
      const { value } = await this.connection.getLatestBlockhash('finalized');
      return value.feeCalculator.lamportsPerSignature;
    } catch (error) {
      console.error('Error estimating Solana gas:', error);
      throw error;
    }
  }

  async sendTransaction(signedTransaction) {
    try {
      const signature = await this.connection.sendRawTransaction(
        signedTransaction.serialize(),
        { skipPreflight: false, preflightCommitment: 'confirmed' }
      );
      return signature;
    } catch (error) {
      console.error('Error sending Solana transaction:', error);
      throw error;
    }
  }

  async getTransactionReceipt(signature) {
    try {
      return await this.connection.getTransaction(signature, {
        commitment: 'confirmed'
      });
    } catch (error) {
      console.error('Error getting Solana transaction:', error);
      throw error;
    }
  }

  async validateTransaction(transaction) {
    try {
      const { feeCalculator } = await this.connection.getLatestBlockhash('finalized');
      const fee = feeCalculator.lamportsPerSignature;
      return { isValid: true, fee };
    } catch (error) {
      console.error('Error validating Solana transaction:', error);
      throw error;
    }
  }

  cleanup() {
    if (this.connection) {
      // Close any open WebSocket connections
      this.connection.disconnect();
    }
  }
}