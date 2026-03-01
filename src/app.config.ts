import * as Joi from 'joi';
import { ConfigModuleOptions } from '@nestjs/config';

export const configModuleOptions: ConfigModuleOptions = {
  isGlobal: true,
  validationSchema: Joi.object({
    DATABASE_URL: Joi.string().required(),
    ALCHEMY_API_KEY: Joi.string().required(),
    ALCHEMY_RPC_URL: Joi.string().uri().required(),
    ANTHROPIC_API_KEY: Joi.string().allow('').optional(),
    RATE_LIMIT_TOKENS_PER_SECOND: Joi.number().default(2),
    RATE_LIMIT_CAPACITY: Joi.number().default(5),
    PORT: Joi.number().default(3000),
  }),
  load: [
    () => ({
      alchemy: {
        apiKey: process.env.ALCHEMY_API_KEY,
        rpcUrl: process.env.ALCHEMY_RPC_URL,
        maxCount: 1000,
        timeout: 30000,
      },
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        promptParserModel: 'claude-sonnet-4-20250514',
        promptParserMaxTokens: 1024,
        enrichmentModel: 'claude-sonnet-4-20250514',
        enrichmentMaxTokens: 2048,
        timeout: 30000,
      },
      rateLimit: {
        tokensPerSecond: Number(process.env.RATE_LIMIT_TOKENS_PER_SECOND) || 2,
        capacity: Number(process.env.RATE_LIMIT_CAPACITY) || 5,
      },
    }),
  ],
};
