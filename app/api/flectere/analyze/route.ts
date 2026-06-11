import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { prompt } = await req.json();
  if (!prompt) {
    return NextResponse.json({ insights: [] }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { insights: [] },
      { status: 503, statusText: "OPENAI_API_KEY not configured" }
    );
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a business analyst JSON generator. Return ONLY valid JSON matching the requested schema. No markdown, no explanation.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[Flectere AI] OpenAI error:", res.status, errText);
      return NextResponse.json({ insights: [] }, { status: 502 });
    }

    const json = await res.json();
    const text = json.choices?.[0]?.message?.content || "[]";

    let insights;
    try {
      insights = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      insights = match ? JSON.parse(match[0]) : [];
    }

    return NextResponse.json({ insights: Array.isArray(insights) ? insights : [] });
  } catch (err) {
    console.error("[Flectere AI] Request failed:", err);
    return NextResponse.json({ insights: [] }, { status: 500 });
  }
}
