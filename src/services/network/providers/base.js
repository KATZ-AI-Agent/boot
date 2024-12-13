export class NetworkProvider {
  constructor() {
    if (new.target === NetworkProvider) {
      throw new Error('NetworkProvider is an abstract class');
    }
  }

  async initialize() {
    throw new Error('initialize must be implemented by subclass');
  }

  async getGasPrice() {
    throw new Error('getGasPrice must be implemented by subclass');
  }

  async getBlockNumber() {
    throw new Error('getBlockNumber must be implemented by subclass');
  }

  async isContractAddress(address) {
    throw new Error('isContractAddress must be implemented by subclass');
  }

  cleanup() {
    // Optional cleanup method to be implemented by subclasses
  }
}