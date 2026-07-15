import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return handleProxy(req, await params);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return handleProxy(req, await params);
}

async function handleProxy(req: NextRequest, { path }: { path: string[] }) {
  try {
    let intelligenceUrl = process.env.INTELLIGENCE_URL || "http://localhost:8000";
    
    // Check if the URL has a protocol, if not prepend http:// or https://
    if (!/^https?:\/\//i.test(intelligenceUrl)) {
      // For local development, localhost, or Render private services, use http.
      const isLocalOrPrivate = /localhost|:\d{4,5}$|\.local/i.test(intelligenceUrl) || intelligenceUrl.includes("nirvana-intelligence");
      intelligenceUrl = `${isLocalOrPrivate ? "http" : "https"}://${intelligenceUrl}`;
    }
    
    // Construct the target URL on the Python backend
    const pathname = path.join("/");
    const searchParams = req.nextUrl.searchParams.toString();
    const targetUrl = `${intelligenceUrl}/api/py/${pathname}${searchParams ? `?${searchParams}` : ""}`;
    
    // Setup request headers
    const headers = new Headers();
    
    // Pass the request's content type if it exists
    const contentType = req.headers.get("content-type");
    if (contentType) {
      headers.set("content-type", contentType);
    }
    
    // Inject the secure shared intelligence API key if configured
    const apiKey = process.env.INTELLIGENCE_API_KEY;
    if (apiKey) {
      headers.set("X-API-KEY", apiKey);
    }
    
    // Capture request body for POST requests
    let body = undefined;
    if (req.method === "POST") {
      body = await req.text();
    }
    
    // Forward the request to the Python backend
    const res = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });
    
    const responseData = await res.text();
    
    // Return response with correct headers and status code
    return new NextResponse(responseData, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") || "application/json",
      },
    });
  } catch (error: any) {
    console.error("[Next.js Proxy Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to proxy request to python backend" },
      { status: 500 }
    );
  }
}
