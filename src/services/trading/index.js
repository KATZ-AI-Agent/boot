import { EVMTrader } from './traders/evm.js';
import { SolanaTrader } from './traders/solana.js';
import { NETWORKS } from '../../core/constants.js';
import { config } from '../../core/config.js';
import { EventEmitter } from 'events';

class TradingService extends EventEmitter {
  constructor() {
    super();
    this.traders = {
      [NETWORKS.ETHEREUM]: new EVMTrader(config.networks.ethereum),
      [NETWORKS.BASE]: new EVMTrader(config.networks.base),
      [NETWORKS.SOLANA]: new SolanaTrader(config.networks.solana)
    };
  }

  getTrader(network) {
    const trader = this.traders[network];
    if (!trader) {
      throw new Error(`Unsupported network: ${network}`);
    }
    return trader;
  }

  async executeTrade(network, { action, tokenAddress, amount, walletAddress }) {
    try {
      const trader = this.getTrader(network);
      const result = await trader.executeTrade({
        action,
        tokenAddress,
        amount,
        walletAddress
      });

      this.emit('tradeExecuted', {
        network,
        action,
        tokenAddress,
        amount,
        walletAddress,
        result
      });

      return result;
    } catch (error) {
      this.emit('tradeError', {
        network,
        action,
        tokenAddress,
        amount,
        walletAddress,
        error
      });
      throw error;
    }
  }

  async estimateTrade(network, { action, tokenAddress, amount, walletAddress }) {
    try {
      const trader = this.getTrader(network);
      return await trader.estimateTrade({
        action,
        tokenAddress,
        amount,
        walletAddress
      });
    } catch (error) {
      console.error('Error estimating trade:', error);
      throw error;
    }
  }

  async getTokenPrice(network, tokenAddress) {
    try {
      const trader = this.getTrader(network);
      return await trader.getTokenPrice(tokenAddress);
    } catch (error) {
      console.error('Error getting token price:', error);
      throw error;
    }
  }

  async getTradeHistory(network, walletAddress) {
    try {
      const trader = this.getTrader(network);
      return await trader.getTradeHistory(walletAddress);
    } catch (error) {
      console.error('Error getting trade history:', error);
      throw error;
    }
  }

  cleanup() {
    this.removeAllListeners();
    Object.values(this.traders).forEach(trader => {
      if (trader.cleanup) {
        trader.cleanup();
      }
    });
  }
}

export const tradingService = new TradingService();