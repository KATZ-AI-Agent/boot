export const NETWORKS = {
  ETHEREUM: 'ethereum',
  BASE: 'base', 
  SOLANA: 'solana'
};

export const NETWORK_DISPLAY_NAMES = {
  [NETWORKS.ETHEREUM]: 'Ethereum',
  [NETWORKS.BASE]: 'Base',
  [NETWORKS.SOLANA]: 'Solana'
};

export const USER_STATES = {
  AWAITING_REGISTRATION: 'AWAITING_REGISTRATION',
  WAITING_MEME_INPUT: 'WAITING_MEME_INPUT',
  WAITING_MEME_VOICE: 'WAITING_MEME_VOICE',
  WAITING_INVESTMENT_INPUT: 'WAITING_INVESTMENT_INPUT',
  WAITING_INVESTMENT_VOICE: 'WAITING_INVESTMENT_VOICE',
  WAITING_LOAN_ANALYSIS: 'WAITING_LOAN_ANALYSIS',
  WAITING_SCAN_INPUT: 'WAITING_SCAN_INPUT',
  WAITING_PRICE_ALERT: 'WAITING_PRICE_ALERT',
  WAITING_TRANSFER_ADDRESS: 'WAITING_TRANSFER_ADDRESS',
  WAITING_TRANSFER_AMOUNT: 'WAITING_TRANSFER_AMOUNT',
  WAITING_EVENT_VOICE: 'WAITING_EVENT_VOICE',
  MAIN_MENU: 'MAIN_MENU'
};

export const ERROR_MESSAGES = {
  GENERAL_ERROR: '❌ An error occurred. Please try again.',
  NETWORK_ERROR: '❌ Network error. Please check your connection.',
  WALLET_NOT_FOUND: '❌ Wallet not found. Please check your settings.',
  INSUFFICIENT_FUNDS: '❌ Insufficient funds for this operation.',
  INVALID_ADDRESS: '❌ Invalid address format.',
  API_ERROR: '❌ Service temporarily unavailable.',
  NOT_CONFIGURED: '❌ Please configure your settings first.'
};

export const DB_POOL_SIZE = 10;
export const DB_IDLE_TIMEOUT = 30000;
export const DB_CONNECT_TIMEOUT = 30000;

export const CANVAS_DIMENSIONS = {
  WIDTH: 800,
  HEIGHT: 1250
};