export class BaseTrader {
  constructor(networkConfig) {
    this.networkConfig = networkConfig;
  }

  async executeTrade(tradeParams) {
    throw new Error('executeTrade must be implemented by subclass');
  }

  async estimateTrade(tradeParams) {
    throw new Error('estimateTrade must be implemented by subclass');
  }

  async getTokenPrice(tokenAddress) {
    throw new Error('getTokenPrice must be implemented by subclass');
  }

  async getTradeHistory(walletAddress) {
    throw new Error('getTradeHistory must be implemented by subclass');
  }

  cleanup() {
    // Optional cleanup method to be implemented by subclasses
  }
}