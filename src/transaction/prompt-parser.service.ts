import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { QuerySpec, normalizeQuerySpec } from './types/query-spec';
import { PromptParseException } from '../common/exceptions/prompt-parse.exception';
import { ForbiddenCategoryException } from '../common/exceptions/forbidden-category.exception';
import { parseJsonFromLlmResponse } from '../common/utils/llm-json.util';
import { EVM_ADDRESS_REGEX } from '../common/constants/patterns';

const VALID_DIRECTIONS = ['IN', 'OUT'];
const VALID_CATEGORIES = ['EXTERNAL', 'INTERNAL', 'ERC20', 'ERC721', 'ERC1155'];
const ASSET_PATTERN = /^[A-Z0-9]{1,20}$/;

@Injectable()
export class PromptParserService {
  private readonly logger = new Logger(PromptParserService.name);
  private readonly client: Anthropic | null;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('anthropic.apiKey');
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
    this.model = this.configService.get<string>('anthropic.promptParserModel')!;
    this.maxTokens = this.configService.get<number>('anthropic.promptParserMaxTokens')!;
  }

  async parse(prompt: string, walletId: string, role: string): Promise<QuerySpec> {
    if (prompt.length > 2000) {
      throw new PromptParseException('Prompt exceeds maximum length of 2000 characters');
    }

    if (!this.client) {
      throw new PromptParseException(
        'Prompt parsing unavailable — no Anthropic API key configured',
      );
    }

    const today = new Date().toISOString().split('T')[0];
    const systemPrompt = this.buildSystemPrompt(today);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const parsed = this.parseJson(text);
    return this.validate(parsed, walletId, role);
  }

  private buildSystemPrompt(today: string): string {
    return `You are a structured data extractor for a wallet transaction query system.
Today's date is ${today}.

Given a natural-language prompt about wallet transactions, extract the query parameters as JSON.

Return ONLY a JSON object with these fields (use null for absent values):
{
  "direction": "IN" | "OUT" | null,
  "categories": ["EXTERNAL","INTERNAL","ERC20","ERC721","ERC1155"] or [],
  "assets": ["ETH","USDC",...] or [],
  "minValue": "numeric string" | null,
  "maxValue": "numeric string" | null,
  "counterparty": "0x... address" | null,
  "startTime": "ISO-8601 datetime with offset" | null,
  "endTime": "ISO-8601 datetime with offset" | null,
  "sort": "createdAt_desc" | "createdAt_asc" | null,
  "limit": integer | null,
  "needsClarification": ["question1", ...] or []
}

Rules:
- "incoming", "received", "deposits" → direction "IN"
- "outgoing", "sent", "withdrawals" → direction "OUT"
- "nft" maps to category "ERC721"
- Resolve relative times (e.g., "last 7 days", "yesterday", "last month") to ISO-8601 datetimes in UTC
- Asset names should be UPPERCASE (e.g., "ETH", "USDC")
- If the prompt is ambiguous or you cannot determine the intent, populate "needsClarification" with specific questions
- Do NOT wrap the JSON in markdown fences`;
  }

  private parseJson(text: string): any {
    try {
      return parseJsonFromLlmResponse(text);
    } catch {
      throw new PromptParseException('Failed to parse LLM response as JSON');
    }
  }

  private validate(parsed: any, walletId: string, role: string): QuerySpec {
    // needsClarification
    if (
      parsed.needsClarification &&
      Array.isArray(parsed.needsClarification) &&
      parsed.needsClarification.length > 0
    ) {
      const sanitized = parsed.needsClarification
        .filter((q: any) => typeof q === 'string')
        .map((q: string) => q.substring(0, 200));
      throw new PromptParseException('Prompt needs clarification', sanitized);
    }

    // direction
    let direction: string | undefined;
    if (parsed.direction) {
      const dir = String(parsed.direction).toUpperCase();
      if (!VALID_DIRECTIONS.includes(dir)) {
        throw new PromptParseException(`Invalid direction: ${parsed.direction}`);
      }
      direction = dir;
    }

    // categories
    let categories: string[] | undefined;
    if (parsed.categories && Array.isArray(parsed.categories) && parsed.categories.length > 0) {
      categories = parsed.categories.map((c: string) => String(c).toUpperCase());
      for (const c of categories!) {
        if (!VALID_CATEGORIES.includes(c)) {
          throw new PromptParseException(`Invalid category: ${c}`);
        }
      }
    }

    // assets
    let assets: string[] | undefined;
    if (parsed.assets && Array.isArray(parsed.assets) && parsed.assets.length > 0) {
      if (parsed.assets.length > 10) {
        throw new PromptParseException('Too many assets (max 10)');
      }
      assets = parsed.assets.map((a: string) => String(a).toUpperCase());
      for (const a of assets!) {
        if (!ASSET_PATTERN.test(a)) {
          throw new PromptParseException(`Invalid asset: ${a}`);
        }
      }
    }

    // values
    let minValue: string | undefined;
    let maxValue: string | undefined;
    if (parsed.minValue != null) {
      const val = Number(parsed.minValue);
      if (isNaN(val) || val < 0) {
        throw new PromptParseException(`Invalid minValue: ${parsed.minValue}`);
      }
      minValue = String(parsed.minValue);
    }
    if (parsed.maxValue != null) {
      const val = Number(parsed.maxValue);
      if (isNaN(val) || val < 0) {
        throw new PromptParseException(`Invalid maxValue: ${parsed.maxValue}`);
      }
      maxValue = String(parsed.maxValue);
    }

    // counterparty
    let counterparty: string | undefined;
    if (parsed.counterparty) {
      if (!EVM_ADDRESS_REGEX.test(parsed.counterparty)) {
        throw new PromptParseException(`Invalid counterparty address: ${parsed.counterparty}`);
      }
      counterparty = parsed.counterparty;
    }

    // dates
    let startTime: string | undefined;
    let endTime: string | undefined;
    if (parsed.startTime) {
      const d = new Date(parsed.startTime);
      if (isNaN(d.getTime())) {
        throw new PromptParseException(`Invalid startTime: ${parsed.startTime}`);
      }
      startTime = parsed.startTime;
    }
    if (parsed.endTime) {
      const d = new Date(parsed.endTime);
      if (isNaN(d.getTime())) {
        throw new PromptParseException(`Invalid endTime: ${parsed.endTime}`);
      }
      endTime = parsed.endTime;
    }

    // RBAC: reject INTERNAL for non-admin
    if (role !== 'admin' && categories?.includes('INTERNAL')) {
      throw new ForbiddenCategoryException();
    }

    return normalizeQuerySpec({
      walletId,
      direction,
      categories,
      assets,
      minValue,
      maxValue,
      counterparty,
      startTime,
      endTime,
      sort: parsed.sort ?? undefined,
      limit: parsed.limit ?? undefined,
    });
  }
}
