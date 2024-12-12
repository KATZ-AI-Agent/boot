/**
 * @typedef {Object} TradeParams
 * @property {'buy' | 'sell'} action
 * @property {string} tokenAddress
 * @property {string | number} amount
 * @property {string} walletAddress
 */

/**
 * @typedef {Object} TradeResult
 * @property {string} hash - Transaction hash (EVM) or signature (Solana)
 * @property {string} status - Transaction status
 * @property {string} from - Sender address
 * @property {string} to - Recipient address
 * @property {string} [gasUsed] - Gas used (EVM only)
 * @property {string} [effectiveGasPrice] - Effective gas price (EVM only)
 */

/**
 * @typedef {Object} TradeEstimate
 * @property {string} estimatedGas - Estimated gas (EVM) or fee (Solana)
 * @property {string} [gasPrice] - Gas price (EVM only)
 * @property {string} [totalCost] - Total cost estimate
 * @property {string} [value] - Transaction value
 */

export const TRADE_ACTIONS = {
  BUY: 'buy',
  SELL: 'sell'
};