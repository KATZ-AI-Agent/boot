import { BaseWallet } from './base.js';
import { ethers } from 'ethers';
import { Alchemy } from 'alchemy-sdk';

export class EVMWallet extends BaseWallet {
  constructor(networkConfig) {
    super(networkConfig);
    this.provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
    this.alchemy = new Alchemy({
      apiKey: networkConfig.alchemyApiKey,
      network: networkConfig.name.toLowerCase()
    });
  }

  async checkHealth() {
    // Check RPC connection
    const blockNumber = await this.provider.getBlockNumber();
    if (!blockNumber) throw new Error('Unable to fetch block number');
  }

  async createWallet() {
    try {
      const wallet = ethers.Wallet.createRandom();
      return {
        address: wallet.address,
        privateKey: wallet.privateKey,
        mnemonic: wallet.mnemonic.phrase
      };
    } catch (error) {
      console.error('Error creating EVM wallet:', error);
      throw error;
    }
  }

  async getBalance(address) {
    try {
      const balance = await this.provider.getBalance(address);
      return ethers.formatEther(balance);
    } catch (error) {
      console.error('Error getting EVM balance:', error);
      throw error;
    }
  }

  async getTokenBalance(address, tokenAddress) {
    try {
      const contract = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)'],
        this.provider
      );
      const balance = await contract.balanceOf(address);
      return balance.toString();
    } catch (error) {
      console.error('Error getting EVM token balance:', error);
      throw error;
    }
  }

  async signTransaction(transaction, privateKey) {
    try {
      const wallet = new ethers.Wallet(privateKey, this.provider);
      return wallet.signTransaction(transaction);
    } catch (error) {
      console.error('Error signing EVM transaction:', error);
      throw error;
    }
  }

  cleanup() {
    if (this.provider.destroy) {
      this.provider.destroy();
    }
  }
}