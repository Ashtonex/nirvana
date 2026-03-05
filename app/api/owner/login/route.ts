import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "crypto";

const OWNER_EMAIL = "flectere@dev.com";
const OWNER_PASSWORD = "Ashytana";

export async function POST(req: Request) {
  const { email, password } = await req.json();

  if (email?.toLowerCase() === OWNER_EMAIL && password === OWNER_PASSWORD) {
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    (await cookies()).set("nirvana_owner", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 14 * 24 * 60 * 60,
    });

    return NextResponse.json({ success: true, email: OWNER_EMAIL });
  }

  return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
}
