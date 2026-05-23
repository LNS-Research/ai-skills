import dotenv from "dotenv";
dotenv.config({ override: true });

import { startCoordinator } from "./coordinator.js";
import { startDiscordBot } from "./discord-bot.js";

startDiscordBot();
startCoordinator();
