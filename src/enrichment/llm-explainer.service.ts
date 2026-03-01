import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { EvidenceItem, Explanation, ProtocolHint } from './types/evidence.types';
import { parseJsonFromLlmResponse } from '../common/utils/llm-json.util';

const HEX_ADDRESS_PATTERN = /0x[a-fA-F0-9]{40,64}/g;

@Injectable()
export class LlmExplainerService {
  private readonly logger = new Logger(LlmExplainerService.name);
  private readonly client: Anthropic | null;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('anthropic.apiKey');
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
    this.model = this.configService.get<string>('anthropic.enrichmentModel')!;
    this.maxTokens = this.configService.get<number>('anthropic.enrichmentMaxTokens')!;
  }

  async explain(
    evidenceItems: EvidenceItem[],
    protocolHints: ProtocolHint[],
  ): Promise<Explanation | null> {
    if (!this.client) {
      this.logger.warn('LLM explainer disabled — no Anthropic API key');
      return null;
    }

    const systemPrompt = this.buildSystemPrompt();
    const userMessage = this.buildUserMessage(evidenceItems, protocolHints);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const parsed = this.parseExplanation(text);
      if (!parsed) return null;

      // Validate citations
      const validIds = new Set(evidenceItems.map((e) => e.id));
      if (!this.validateCitations(parsed, validIds)) {
        this.logger.warn('Explanation failed citation validation');
        return null;
      }

      // Phantom address detection
      if (!this.validateNoPhantomAddresses(parsed, evidenceItems, protocolHints)) {
        this.logger.warn('Explanation contains phantom addresses');
        return null;
      }

      return parsed;
    } catch (error: any) {
      this.logger.error(`LLM explanation failed: ${error.message}`);
      return null;
    }
  }

  private buildSystemPrompt(): string {
    return `You are a blockchain transaction explainer.

RULES:
1. You MUST only reference facts from the provided evidence bundle.
2. Every claim you make MUST include an "evidenceIds" array citing specific evidence IDs from the bundle.
3. If evidence is insufficient for any aspect, set text to "Unknown - insufficient evidence" and add what is missing to the "unknowns" array.
4. Do NOT invent or infer addresses, amounts, protocols, token names, or operations not explicitly present in the evidence.
5. Do NOT speculate about intent, profitability, or future actions.
6. Respond with ONLY valid JSON matching the schema below. No markdown, no extra text.

OUTPUT SCHEMA:
{
  "summary": "One-sentence description of what happened",
  "steps": [{"text": "description of one step", "evidenceIds": ["ev:log:0", "ev:label:to"]}],
  "unknowns": ["list aspects where evidence is insufficient"],
  "safetyNotes": ["important caveats about this interpretation"]
}`;
  }

  private buildUserMessage(evidenceItems: EvidenceItem[], protocolHints: ProtocolHint[]): string {
    const evidence = evidenceItems
      .map((e) => `[${e.id}] type=${e.type} ${JSON.stringify(e.fields)}`)
      .join('\n');

    const hints =
      protocolHints.length > 0
        ? protocolHints
            .map(
              (h) =>
                `${h.address} → ${h.protocol} "${h.label}" (confidence: ${h.confidence})`,
            )
            .join('\n')
        : 'None';

    return `Evidence bundle:\n${evidence}\n\nProtocol hints:\n${hints}`;
  }

  private parseExplanation(text: string): Explanation | null {
    try {
      const parsed = parseJsonFromLlmResponse(text) as any;
      if (
        !parsed.summary ||
        !Array.isArray(parsed.steps) ||
        !Array.isArray(parsed.unknowns) ||
        !Array.isArray(parsed.safetyNotes)
      ) {
        return null;
      }
      return parsed as Explanation;
    } catch {
      this.logger.warn('Failed to parse explanation JSON');
      return null;
    }
  }

  private validateCitations(explanation: Explanation, validIds: Set<string>): boolean {
    for (const step of explanation.steps) {
      if (!step.evidenceIds || !Array.isArray(step.evidenceIds)) return false;
      for (const id of step.evidenceIds) {
        if (!validIds.has(id)) {
          this.logger.warn(`Invalid evidence citation: ${id}`);
          return false;
        }
      }
    }
    return true;
  }

  private validateNoPhantomAddresses(
    explanation: Explanation,
    evidenceItems: EvidenceItem[],
    protocolHints: ProtocolHint[],
  ): boolean {
    // Collect all known hex values from evidence
    const knownHex = new Set<string>();
    for (const item of evidenceItems) {
      for (const value of Object.values(item.fields)) {
        const matches = value.match(HEX_ADDRESS_PATTERN);
        if (matches) {
          for (const m of matches) {
            knownHex.add(m.toLowerCase());
            // Also extract 20-byte address from 32-byte ABI words
            if (m.length === 66) {
              const addr = '0x' + m.slice(26);
              knownHex.add(addr.toLowerCase());
            }
          }
        }
      }
    }

    // Add protocol hint addresses
    for (const hint of protocolHints) {
      knownHex.add(hint.address.toLowerCase());
    }

    // Check all addresses in explanation text
    const allText = [
      explanation.summary,
      ...explanation.steps.map((s) => s.text),
      ...explanation.unknowns,
      ...explanation.safetyNotes,
    ].join(' ');

    const foundAddresses = allText.match(HEX_ADDRESS_PATTERN);
    if (foundAddresses) {
      for (const addr of foundAddresses) {
        const normalized = addr.toLowerCase();
        if (!knownHex.has(normalized)) {
          // Check if it's a 32-byte ABI word containing an address
          if (normalized.length === 66) {
            const extractedAddr = '0x' + normalized.slice(26);
            if (!knownHex.has(extractedAddr)) {
              this.logger.warn(`Phantom address detected: ${addr}`);
              return false;
            }
          } else {
            this.logger.warn(`Phantom address detected: ${addr}`);
            return false;
          }
        }
      }
    }

    return true;
  }
}
