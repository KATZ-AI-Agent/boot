import { CommandRegistry } from './registry.js';
import { StartCommand } from './start/StartCommand.js';
import { HelpCommand } from './help/HelpCommand.js';
import { VoiceHelperCommand } from './help/VoiceHelperCommand.js';
import { MemeCommand } from './meme/MemeCommand.js';
import { InvestmentCommand } from './investment/InvestmentCommand.js';
import { LoansCommand } from './loans/LoansCommand.js';
import { TrendingCommand } from './trending/TrendingCommand.js';
import { ScanCommand } from './scan/ScanCommand.js';
import { GemsCommand } from './scan/GemsCommand.js';
import { PriceAlertsCommand } from './alerts/PriceAlertsCommand.js';
import { PumpFunCommand } from './pumpfun/PumpFunCommand.js';
import { WalletsCommand } from './wallets/WalletsCommand.js';
import { ConnectWalletCommand } from './wallets/ConnectWalletCommand.js';
import { SettingsCommand } from './settings/SettingsCommand.js';

export function setupCommands(bot) {
  const registry = new CommandRegistry(bot);

  // Register all commands
  const commands = [
    new StartCommand(bot),
    new HelpCommand(bot),
    new VoiceHelperCommand(bot),
    new MemeCommand(bot),
    new InvestmentCommand(bot),
    new LoansCommand(bot),
    new TrendingCommand(bot),
    new ScanCommand(bot),
    new GemsCommand(bot),
    new PriceAlertsCommand(bot),
    new PumpFunCommand(bot),
    new WalletsCommand(bot),
    new ConnectWalletCommand(bot),
    new SettingsCommand(bot)
  ];

  commands.forEach(command => registry.registerCommand(command));
  return registry;
}
