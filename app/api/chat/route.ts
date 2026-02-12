import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { generateSystemContext } from '@/lib/ai-context';

export const maxDuration = 30;

export async function POST(req: Request) {
    const { messages, data } = await req.json();
    // We expect the path to be passed in the 'data' field from the client
    const path = data?.path || "/";

    const systemContext = await generateSystemContext(path);

    const result = streamText({
        model: openai('gpt-4o'),
        system: systemContext,
        messages,
    });

    return result.toTextStreamResponse();
}
