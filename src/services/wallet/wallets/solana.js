import axios from 'axios';
import { BaseWallet } from './base.js';
import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import {
    getAssociatedTokenAddress,
    getAccount,
    createAssociatedTokenAccountInstruction,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import * as bip39 from 'bip39';
import HDKey from 'hdkey';

export class SolanaWallet extends BaseWallet {
    constructor(networkConfig) {
        super(networkConfig);
        this.rpcUrl = networkConfig.rpcUrl;
        this.connection = new Connection(networkConfig.rpcUrl);
    }

    /**
     * Health check for Solana RPC.
     * Verifies the RPC connection by fetching the latest blockhash and RPC version.
     */
    async checkHealth() {
        try {
            const { data: version } = await axios.post(this.rpcUrl, {
                jsonrpc: '2.0',
                id: 1,
                method: 'getVersion',
                params: [],
            });

            const { data: latestBlockhash } = await axios.post(this.rpcUrl, {
                jsonrpc: '2.0',
                id: 1,
                method: 'getLatestBlockhash',
                params: [],
            });

            if (!version.result || !latestBlockhash.result) {
                throw new Error('Failed Solana RPC health check.');
            }

            console.log('✅ Solana RPC is healthy:', version.result);
            return {
                status: 'healthy',
                rpcVersion: version.result,
                latestBlockhash: latestBlockhash.result,
            };
        } catch (error) {
            console.error('❌ Solana RPC health check failed:', error.message);
            throw new Error('Solana RPC health check failed: ' + error.message);
        }
    }

    /**
     * Creates a new Solana wallet using a generated mnemonic.
     * Sets up token reception for common tokens.
     */
    async createWallet() {
        try {
            const mnemonic = bip39.generateMnemonic();
            const seed = await bip39.mnemonicToSeed(mnemonic);
            const hdkey = HDKey.fromMasterSeed(seed);
            const childKey = hdkey.derive("m/44'/501'/0'/0'");
            const keypair = Keypair.fromSeed(childKey.privateKey);

            await this.setupTokenReception(keypair.publicKey.toString());

            return {
                address: keypair.publicKey.toString(),
                privateKey: Buffer.from(keypair.secretKey).toString('hex'),
                mnemonic,
            };
        } catch (error) {
            console.error('❌ Error creating Solana wallet:', error.message);
            throw error;
        }
    }

    /**
     * Sets up token reception accounts for common tokens.
     */
    async setupTokenReception(walletAddress) {
        try {
            const walletPubkey = new PublicKey(walletAddress);
            const tokenAccounts = await this.connection.getTokenAccountsByOwner(walletPubkey, {
                programId: TOKEN_PROGRAM_ID,
            });

            if (!tokenAccounts.value.length) {
                const commonTokens = await this.getCommonTokens();
                console.log('No associated token accounts found. Creating a default account...');
                for (const token of commonTokens) {
                    try {
                        await this.createTokenAccountIfNeeded(walletPubkey, token);
                    } catch (error) {
                        console.warn(`⚠️ Could not create token account for ${token}:`, error.message);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error setting up token reception:', error.message);
            throw error;
        }
    }

    async createTokenAccountIfNeeded(walletPubkey, tokenMint) {
        const mint = new PublicKey(tokenMint);
        const associatedTokenAddress = await getAssociatedTokenAddress(
            mint,
            walletPubkey,
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );

        try {
            await getAccount(this.connection, associatedTokenAddress);
        } catch {
            const transaction = new Transaction().add(
                createAssociatedTokenAccountInstruction(
                    walletPubkey,
                    associatedTokenAddress,
                    walletPubkey,
                    mint
                )
            );
            const signature = await this.connection.sendTransaction(transaction, [walletPubkey]);
            await this.connection.confirmTransaction(signature);
        }
    }

    /**
     * Fetches the balance for a given Solana wallet address.
     */
    async getBalance(address) {
        try {
            const pubkey = new PublicKey(address);
            const balance = await this.connection.getBalance(pubkey);
            return balance / 1e9; // Convert lamports to SOL
        } catch (error) {
            console.error(`❌ Error getting Solana balance for ${address}:`, error.message);
            throw error;
        }
    }

    /**
     * Fetches the token balance for a given Solana wallet and token address.
     */
    async getTokenBalance(address, tokenAddress) {
        try {
            const walletPubkey = new PublicKey(address);
            const tokenPubkey = new PublicKey(tokenAddress);

            const tokenAccounts = await this.connection.getTokenAccountsByOwner(walletPubkey, {
                mint: tokenPubkey,
            });

            if (tokenAccounts.value.length === 0) {
                return '0';
            }

            const balance = await this.connection.getTokenAccountBalance(tokenAccounts.value[0].pubkey);

            return balance.value.amount;
        } catch (error) {
            console.error(`❌ Error getting token balance for ${address} on ${tokenAddress}:`, error.message);
            throw error;
        }
    }

    /**
     * Signs a transaction with a private key.
     */
    async signTransaction(transaction, privateKey) {
        try {
            const keypair = Keypair.fromSecretKey(Buffer.from(privateKey, 'hex'));
            transaction.sign(keypair);
            return transaction;
        } catch (error) {
            console.error('❌ Error signing Solana transaction:', error.message);
            throw error;
        }
    }

    /**
     * Validates a transaction by checking if sufficient funds exist to cover fees.
     */
    async validateTransaction(transaction, walletAddress) {
        try {
            const { feeCalculator } = await this.connection.getRecentBlockhash();
            const lamportsPerSignature = feeCalculator.lamportsPerSignature;
            const balance = await this.getBalance(walletAddress);

            if (balance < lamportsPerSignature) {
                throw new Error('Insufficient balance for transaction fees');
            }
            return true;
        } catch (error) {
            console.error('❌ Error validating transaction:', error.message);
            throw error;
        }
    }

    /**
     * Executes external transaction instructions for Phantom or other wallets.
     */
    async executeExternalTransaction(txInstructions, walletAddress) {
        const transaction = new Transaction().add(...txInstructions);

        if (this.isPhantomWallet(walletAddress)) {
            return this.requestPhantomApproval(transaction, walletAddress);
        }

        throw new Error('Unsupported external wallet');
    }

    /**
     * Returns a list of common Solana token addresses (e.g., USDC, USDT).
     */
    async getCommonTokens() {
        return [
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
            'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
        ];
    }
}
