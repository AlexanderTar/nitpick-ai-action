import { ReviewService } from './ReviewService';
import OpenAI from 'openai';

export class OpenAIReviewService extends ReviewService {
  private client: OpenAI;

  constructor(apiKey: string) {
    super(apiKey);
    this.client = new OpenAI({ apiKey });
  }

  protected async callApi(prompt: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a code review assistant.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 4000,
    });

    return response.choices[0].message.content || '';
  }
}
