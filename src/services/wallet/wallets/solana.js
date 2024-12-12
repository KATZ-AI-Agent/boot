import { BaseWallet } from './base.js';
import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  getMint,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import * as bip39 from 'bip39';
import HDKey from 'hdkey';

export class SolanaWallet extends BaseWallet {
  constructor(networkConfig) {
    super(networkConfig);
    this.connection = new Connection(networkConfig.rpcUrl);
  }

  /**
   * Health check for Solana Wallet.
   * Verifies RPC connection and fetches the latest block height to ensure the connection is live.
   */
  async checkHealth() {
    try {
      const version = await this.connection.getVersion(); // Get Solana RPC version
      const latestBlockhash = await this.connection.getLatestBlockhash(); // Fetch latest blockhash

      if (!version || !latestBlockhash) {
        throw new Error('Failed Solana RPC health check.');
      }

      console.log('✅ Solana RPC is healthy:', version);
      return { status: 'healthy', rpcVersion: version, latestBlockhash };
    } catch (error) {
      console.error('❌ Solana RPC health check failed:', error.message);
      throw new Error('Solana RPC health check failed: ' + error.message);
    }
  }

  async createWallet() {
    try {
      const mnemonic = bip39.generateMnemonic();
      const seed = await bip39.mnemonicToSeed(mnemonic);
      const hdkey = HDKey.fromMasterSeed(seed);
      const childKey = hdkey.derive("m/44'/501'/0'/0'");
      const keypair = Keypair.fromSeed(childKey.privateKey);

      // Setup token accounts for the new wallet
      await this.setupTokenReception(keypair.publicKey.toString());

      return {
        address: keypair.publicKey.toString(),
        privateKey: Buffer.from(keypair.secretKey).toString('hex'),
        mnemonic,
      };
    } catch (error) {
      console.error('Error creating Solana wallet:', error);
      throw error;
    }
  }

  /**
   * Sets up token reception accounts for a given wallet address.
   * @param {string} walletAddress - The public key of the wallet to set up token accounts for.
   */
  async setupTokenReception(walletAddress) {
    try {
      const publicKey = new PublicKey(walletAddress);
      const tokenAccounts = await this.connection.getTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      });

      if (!tokenAccounts.value.length) {
        const commonTokens = await this.getCommonTokens();
        console.log('No associated token accounts found. Creating a default account...');
        for (const token of commonTokens) {
          try {
            await this.createTokenAccountIfNeeded(pubkey, token);
          } catch (err) {
            console.warn(`Warning: Could not create token account for ${token}:`, err);
          }
        }
      }
    } catch (error) {
      console.error('Error setting up token reception:', error);
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
      // If the account doesn't exist, create it
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

  async getBalance(address) {
    try {
      const pubkey = new PublicKey(address);
      const balance = await this.connection.getBalance(pubkey);
      return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
      console.error('Error getting Solana balance:', error);
      throw error;
    }
  }

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

      const balance = await this.connection.getTokenAccountBalance(
        tokenAccounts.value[0].pubkey
      );

      return balance.value.amount;
    } catch (error) {
      console.error('Error getting Solana token balance:', error);
      throw error;
    }
  }

  async signTransaction(transaction, privateKey) {
    try {
      const keypair = Keypair.fromSecretKey(Buffer.from(privateKey, 'hex'));
      transaction.sign(keypair);
      return transaction;
    } catch (error) {
      console.error('Error signing Solana transaction:', error);
      throw error;
    }
  }

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
      console.error('Error validating transaction:', error);
      throw error;
    }
  }

  async requestPhantomApproval(transaction, walletAddress) {
    const connection = new Connection(this.networkConfig.rpcUrl);

    const signedTransaction = await window.phantom.solana.signTransaction(transaction);

    const signature = await connection.sendRawTransaction(signedTransaction.serialize());

    return signature;
  }

  async executeExternalTransaction(txInstructions, walletAddress) {
    const transaction = new Transaction().add(...txInstructions);

    if (this.isPhantomWallet(walletAddress)) {
      return this.requestPhantomApproval(transaction, walletAddress);
    }

    throw new Error('Unsupported external wallet');
  }

  async getCommonTokens() {
    return [
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    ];
  }
}
