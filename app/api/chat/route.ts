import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { generateSystemContext } from '@/lib/ai-context';
import { getStaffSessionEmployeeId, requireOwnerAccess } from '@/lib/api-auth';
import { NextResponse } from 'next/server';

export const maxDuration = 30;

export async function POST(req: Request) {
    const staffEmployeeId = await getStaffSessionEmployeeId();
    const ownerAccess = await requireOwnerAccess(req);
    if (!staffEmployeeId && !ownerAccess.ok) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
