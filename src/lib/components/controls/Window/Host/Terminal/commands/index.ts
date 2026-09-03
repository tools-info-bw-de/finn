import type { CommandHandler } from '../types';
import { pingCommand } from './ping';

export const commandRegistry: Record<string, CommandHandler> = {
	ping: pingCommand
};
