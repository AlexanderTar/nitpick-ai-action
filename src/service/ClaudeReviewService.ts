import { ReviewService } from './ReviewService';
import Anthropic from '@anthropic-ai/sdk';

export class ClaudeReviewService extends ReviewService {
  private client: Anthropic;

  constructor(apiKey: string) {
    super(apiKey);
    this.client = new Anthropic({ apiKey });
  }

  protected async callApi(prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    return (response.content[0] as Anthropic.TextBlock).text;
  }
}
