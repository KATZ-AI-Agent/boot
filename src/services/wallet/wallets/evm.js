import axios from 'axios';
import { BaseWallet } from './base.js';
import { ethers } from 'ethers';
import { Alchemy } from 'alchemy-sdk';

export class EVMWallet extends BaseWallet {
    constructor(networkConfig) {
        super(networkConfig);
        this.provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
        this.alchemy = new Alchemy({
            apiKey: networkConfig.alchemyApiKey,
            network: networkConfig.name.toLowerCase(),
        });

        this.rpcUrl = networkConfig.rpcUrl;
    }

    async checkHealth() {
        try {
            // Check RPC connection using Axios
            const response = await axios.post(this.rpcUrl, {
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_blockNumber',
                params: [],
            });

            if (!response.data || !response.data.result) {
                throw new Error('Unable to fetch block number from RPC');
            }
            console.log(`✅ RPC connection is healthy. Latest block: ${parseInt(response.data.result, 16)}`);
        } catch (error) {
            console.error('❌ RPC connection health check failed:', error.message);
            throw error;
        }
    }

    async createWallet() {
        try {
            const wallet = ethers.Wallet.createRandom();
            return {
                address: wallet.address,
                privateKey: wallet.privateKey,
                mnemonic: wallet.mnemonic.phrase,
            };
        } catch (error) {
            console.error('❌ Error creating EVM wallet:', error.message);
            throw error;
        }
    }

    async getBalance(address) {
        try {
            const balance = await this.provider.getBalance(address);
            return ethers.formatEther(balance);
        } catch (error) {
            console.error(`❌ Error getting EVM balance for ${address}:`, error.message);
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
            console.error(
                `❌ Error getting EVM token balance for address ${address} and token ${tokenAddress}:`,
                error.message
            );
            throw error;
        }
    }

    async signTransaction(transaction, privateKey) {
        try {
            const wallet = new ethers.Wallet(privateKey, this.provider);
            return wallet.signTransaction(transaction);
        } catch (error) {
            console.error('❌ Error signing EVM transaction:', error.message);
            throw error;
        }
    }

    async fetchTransaction(hash) {
        try {
            // Using Axios to fetch transaction details via RPC
            const response = await axios.post(this.rpcUrl, {
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_getTransactionByHash',
                params: [hash],
            });

            if (!response.data || !response.data.result) {
                throw new Error(`Transaction not found for hash: ${hash}`);
            }

            return response.data.result;
        } catch (error) {
            console.error(`❌ Error fetching transaction with hash ${hash}:`, error.message);
            throw error;
        }
    }

    async sendRawTransaction(signedTransaction) {
        try {
            // Using Axios to send raw transaction via RPC
            const response = await axios.post(this.rpcUrl, {
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_sendRawTransaction',
                params: [signedTransaction],
            });

            if (!response.data || response.data.error) {
                throw new Error(response.data.error?.message || 'Unknown error occurred during transaction submission');
            }

            return response.data.result;
        } catch (error) {
            console.error('❌ Error sending raw EVM transaction:', error.message);
            throw error;
        }
    }

    cleanup() {
        if (this.provider.destroy) {
            this.provider.destroy();
        }
    }
}
