import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { LibSQLStore } from "@mastra/libsql";
import { assistantAgent } from "./agents/index";
import { handsOnWorkflow } from "./workflows/handson";

export const mastra = new Mastra({
  workflows: { handsOnWorkflow },
  agents: { assistantAgent },
  storage: new LibSQLStore({
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
});
