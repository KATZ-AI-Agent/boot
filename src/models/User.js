import mongoose from 'mongoose';

const WalletSchema = new mongoose.Schema({
    address: {
        type: String,
        required: true
    },
    encryptedPrivateKey: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const UserSchema = new mongoose.Schema({
    "telegramId": {
    "type": String,
    "required": true,
    "unique": true,
    "index": true
  },
  "username": String,
  "wallets": {
    "ethereum": [{
      "address": String,
      "encryptedPrivateKey": String,
      "encryptedMnemonic": String,
      "createdAt": Date,
      "isAutonomous": Boolean,
      "type": {
        "type": String,
        "enum": ["internal", "walletconnect"],
        "default": "internal"
      }
    }],
    "base": [{
      "address": String,
      "encryptedPrivateKey": String,
      "encryptedMnemonic": String,
      "createdAt": Date,
      "isAutonomous": Boolean,
      "type": {
        "type": String,
        "enum": ["internal", "walletconnect"],
        "default": "internal"
      }
    }],
    "solana": [{
      "address": String,
      "encryptedPrivateKey": String,
      "encryptedMnemonic": String,
      "createdAt": Date,
      "isAutonomous": Boolean,
      "type": {
        "type": String,
        "enum": ["internal", "walletconnect"],
        "default": "internal"
      }
    }]
  },
  "settings": {
    "defaultNetwork": {
      "type": String,
      "enum": ["ethereum", "base", "solana"],
      "default": "ethereum"
    },
    "notifications": {
      "enabled": {
        "type": Boolean,
        "default": true
      },
      "showInChat": {
        "type": Boolean,
        "default": true
      }
    },
    "trading": {
      "autonomousEnabled": {
        "type": Boolean,
        "default": true
      },
      "slippage": {
        "ethereum": {
          "type": Number,
          "default": 3,
          "min": 0.1,
          "max": 50
        },
        "base": {
          "type": Number,
          "default": 3,
          "min": 0.1,
          "max": 50
        },
        "solana": {
          "type": Number,
          "default": 3,
          "min": 0.1,
          "max": 50
        }
      }
    }
  },
  "registeredAt": {
    "type": Date,
    "default": Date.now
  }
}, {
    timestamps: true,
    collection: 'users'
});

// Indexes for better query performance
UserSchema.index({ 'wallets.ethereum.address': 1 });
UserSchema.index({ 'wallets.base.address': 1 });
UserSchema.index({ 'wallets.solana.address': 1 });
UserSchema.index({ 'settings.autonomousWallet.address': 1 });

// Pre-save middleware to ensure telegramId is a string
UserSchema.pre('save', function(next) {
    if (this.telegramId && typeof this.telegramId !== 'string') {
        this.telegramId = this.telegramId.toString();
    }
    next();
});

// Instance method to get user's active wallet for current network
UserSchema.methods.getActiveWallet = function(network) {
    if (!this.wallets || !this.wallets[network] || !this.wallets[network].length) {
        return null;
    }
    return this.wallets[network][0]; // Return first wallet for the network
};

// Static method to find user by telegram ID
UserSchema.statics.findByTelegramId = async function(telegramId) {
    return await this.findOne({ telegramId: telegramId.toString() }).lean();
};

// Create the model
const User = mongoose.model('User', UserSchema);

export { User };
