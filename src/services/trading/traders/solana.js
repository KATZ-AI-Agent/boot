import { BaseTrader } from './base.js';
import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  getMint,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { pumpFunService } from '../../pumpfun/index.js';

export class SolanaTrader extends BaseTrader {
  constructor(networkConfig) {
    super(networkConfig);
    this.connection = new Connection(networkConfig.rpcUrl);
  }

  async executeTrade({ action, tokenAddress, amount, walletAddress }) {
    try {
      const hasTokenAccount = await this.checkTokenAccountExists(walletAddress, tokenAddress);
      
      if (!hasTokenAccount) {
        await this.createTokenAccountIfNeeded(walletAddress, tokenAddress);
      }
      
      const result = await pumpFunService.executeSwap({
        action,
        tokenAddress,
        amount,
        walletAddress,
      });

      return {
        signature: result.signature,
        status: result.status,
        from: walletAddress,
        to: tokenAddress,
        amount: amount.toString(),
      };
    } catch (error) {
      console.error('Solana trade error:', error);
      throw error;
    }
  }

  async checkTokenAccountExists(walletAddress, tokenAddress) {
    const walletPubkey = new PublicKey(walletAddress);
    const tokenPubkey = new PublicKey(tokenAddress);

    const tokenAccounts = await this.connection.getTokenAccountsByOwner(walletPubkey, {
      mint: tokenPubkey,
    });

    return tokenAccounts.value.length > 0;
  }

  async createTokenAccountIfNeeded(walletAddress, tokenAddress) {
    const walletPubkey = new PublicKey(walletAddress);
    const tokenPubkey = new PublicKey(tokenAddress);
    const associatedTokenAddress = await getAssociatedTokenAddress(
      tokenPubkey,
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
          tokenPubkey
        )
      );
      const signature = await this.connection.sendTransaction(transaction, [walletPubkey]);
      await this.connection.confirmTransaction(signature);
    }
  }

  async estimateTrade({ action, tokenAddress, amount }) {
    try {
      const { feeCalculator } = await this.connection.getRecentBlockhash();
      const lamportsPerSignature = feeCalculator.lamportsPerSignature;

      const overhead = tokenAddress === 'native' ? 0 : 5000;

      return {
        estimatedFee: lamportsPerSignature + overhead,
        formattedFee: `${(lamportsPerSignature + overhead) / 1e9} SOL`,
      };
    } catch (error) {
      console.error('Solana trade estimation error:', error);
      throw error;
    }
  }

  async getTokenPrice(tokenAddress) {
    try {
      const tokenMint = new PublicKey(tokenAddress);
      const mintInfo = await getMint(this.connection, tokenMint);

      // Fetch token metadata using external API (e.g., Solscan)
      const response = await fetch(`https://api.solscan.io/token/meta?address=${tokenAddress}`);
      const data = await response.json();

      return data?.data?.price || 0; // Fallback to 0 if no price available
    } catch (error) {
      console.error('Error getting Solana token price:', error);
      throw error;
    }
  }

  async getTradeHistory(walletAddress) {
    try {
      const pubkey = new PublicKey(walletAddress);
      const signatures = await this.connection.getSignaturesForAddress(pubkey);

      const history = await Promise.all(
        signatures.map(async (sig) => {
          const tx = await this.connection.getTransaction(sig.signature);
          return {
            signature: sig.signature,
            blockTime: sig.blockTime,
            fee: tx.meta.fee,
            status: tx.meta.err ? 'failed' : 'success',
          };
        })
      );

      return history;
    } catch (error) {
      console.error('Error getting Solana trade history:', error);
      throw error;
    }
  }
}
