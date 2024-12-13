export class BaseWallet {
  constructor(networkConfig) {
    this.networkConfig = networkConfig;
  }

  async createWallet() {
    throw new Error('createWallet must be implemented by subclass');
  }

  async getBalance(address) {
    throw new Error('getBalance must be implemented by subclass');
  }

  async getTokenBalance(address, tokenAddress) {
    throw new Error('getTokenBalance must be implemented by subclass');
  }

  async signTransaction(transaction, privateKey) {
    throw new Error('signTransaction must be implemented by subclass');
  }

  cleanup() {
    // Optional cleanup method to be implemented by subclasses
  }
}