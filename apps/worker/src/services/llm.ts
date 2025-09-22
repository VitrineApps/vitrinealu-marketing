import { env } from '../config.js';

export interface LLM {
  chat(args: { system: string; user: string; model: string }): Promise<string>;
}

export class OpenAIAdapter implements LLM {
  private async getClient() {
    const OpenAI = (await import("openai")).default;
    return new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  
  async chat({ system, user, model }: { system: string; user: string; model: string }): Promise<string> {
    const client = await this.getClient();
    const r = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });
    return r.choices[0]?.message?.content ?? "";
  }
}

export class DummyAdapter implements LLM {
  async chat({ user }: { system: string; user: string; model: string }): Promise<string> {
    return `[TEST CAPTION] ${user.slice(0, 80)}`;
  }
}

export function getLLM(): LLM {
  return (process.env.NODE_ENV === "test" || !env.OPENAI_API_KEY) ? new DummyAdapter() : new OpenAIAdapter();
}