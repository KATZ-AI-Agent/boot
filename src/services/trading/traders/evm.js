import { BaseTrader } from './base.js';
import { Alchemy } from 'alchemy-sdk';
import { ethers } from 'ethers';

export class EVMTrader extends BaseTrader {
  constructor(networkConfig) {
    super(networkConfig);
    this.provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
    this.alchemy = new Alchemy({
      apiKey: networkConfig.alchemyApiKey,
      network: networkConfig.name.toLowerCase()
    });
  }

  async executeTrade({ action, tokenAddress, amount, walletAddress }) {
    try {
      const transaction = await this.buildTradeTransaction({
        action,
        tokenAddress,
        amount,
        walletAddress
      });

      const tx = await this.alchemy.transact.sendTransaction(transaction);
      const receipt = await tx.wait();

      return {
        hash: receipt.hash,
        status: receipt.status,
        from: receipt.from,
        to: receipt.to,
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.effectiveGasPrice.toString()
      };
    } catch (error) {
      console.error('EVM trade error:', error);
      throw error;
    }
  }

  async estimateTrade({ action, tokenAddress, amount, walletAddress }) {
    try {
      const transaction = await this.buildTradeTransaction({
        action,
        tokenAddress,
        amount,
        walletAddress,
        estimateOnly: true
      });

      const [gasLimit, gasPrice] = await Promise.all([
        this.provider.estimateGas(transaction),
        this.provider.getGasPrice()
      ]);

      return {
        estimatedGas: gasLimit.toString(),
        gasPrice: gasPrice.toString(),
        totalCost: gasLimit.mul(gasPrice).toString(),
        value: transaction.value?.toString()
      };
    } catch (error) {
      console.error('EVM trade estimation error:', error);
      throw error;
    }
  }

  async buildTradeTransaction({ action, tokenAddress, amount, walletAddress, estimateOnly = false }) {
    const isNativeToken = tokenAddress.toLowerCase() === 'native';
    const nonce = await this.provider.getTransactionCount(walletAddress, 'latest');

    if (isNativeToken) {
      return {
        from: walletAddress,
        to: action === 'sell' ? tokenAddress : walletAddress,
        value: ethers.parseEther(amount.toString()),
        nonce
      };
    } else {
      const contract = new ethers.Contract(
        tokenAddress,
        ['function transfer(address,uint256)', 'function approve(address,uint256)'],
        this.provider
      );

      const data = action === 'buy' 
        ? contract.interface.encodeFunctionData('approve', [walletAddress, amount])
        : contract.interface.encodeFunctionData('transfer', [walletAddress, amount]);

      return {
        from: walletAddress,
        to: tokenAddress,
        data,
        nonce
      };
    }
  }

  // EVMTrader class
  async checkAndRequestApproval(tokenAddress, walletAddress, amount) {
    const wallet = await walletService.getWallet(walletAddress);
    
    if (wallet.type === 'walletconnect') {
      // Request approval via WalletConnect
      const contract = new ethers.Contract(
        tokenAddress,
        ['function approve(address,uint256)'],
        this.provider
      );
      
      const approvalTx = await contract.populateTransaction.approve(
        this.routerAddress,
        ethers.MaxUint256
      );
      
      return walletConnectService.sendTransaction(wallet.userId, approvalTx);
    } else {
      // Internal wallet - use stored private key
      return super.approve(tokenAddress, walletAddress, amount);
    }
  }  

  async getTokenPrice(tokenAddress) {
    try {
      const price = await this.alchemy.core.getTokenPrice(tokenAddress);
      return price?.usd || 0;
    } catch (error) {
      console.error('Error getting EVM token price:', error);
      throw error;
    }
  }

  async getTradeHistory(walletAddress) {
    try {
      const history = await this.alchemy.core.getAssetTransfers({
        fromAddress: walletAddress,
        category: ['external', 'internal', 'erc20']
      });

      return history.transfers.map(transfer => ({
        hash: transfer.hash,
        from: transfer.from,
        to: transfer.to,
        value: transfer.value,
        asset: transfer.asset,
        timestamp: transfer.metadata.blockTimestamp
      }));
    } catch (error) {
      console.error('Error getting EVM trade history:', error);
      throw error;
    }
  }

  cleanup() {
    if (this.provider.destroy) {
      this.provider.destroy();
    }
  }
}