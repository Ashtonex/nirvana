import { NextResponse, type NextRequest } from "next/server";

function unauthorizedBasicAuth() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Nirvana"',
    },
  });
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function checkBasicAuth(req: NextRequest) {
  const user = process.env.NIRVANA_BASIC_AUTH_USER;
  const pass = process.env.NIRVANA_BASIC_AUTH_PASS;
  if (!user || !pass) return { enabled: false, ok: true };

  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Basic\s+(.+)$/i);
  if (!m) return { enabled: true, ok: false };

  try {
    const decoded = atob(m[1]);
    const idx = decoded.indexOf(":");
    if (idx < 0) return { enabled: true, ok: false };
    const u = decoded.slice(0, idx);
    const p = decoded.slice(idx + 1);
    const ok = timingSafeEqual(u, user) && timingSafeEqual(p, pass);
    return { enabled: true, ok };
  } catch {
    return { enabled: true, ok: false };
  }
}

function isPublicAsset(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.json" ||
    pathname.startsWith("/icon-") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/staff-login") ||
    pathname.startsWith("/api/staff/login") ||
    pathname.startsWith("/api/staff/request") ||
    pathname.startsWith("/api/staff/logout") ||
    pathname.startsWith("/api/staff/me") ||
    pathname.startsWith("/api/owner/login") ||
    pathname.startsWith("/api/owner/logout")
  );
}

function isAuthenticated(req: NextRequest) {
  const authToken = req.cookies.get("sb-access-token");
  const refreshToken = req.cookies.get("sb-refresh-token");
  const staffToken = req.cookies.get("nirvana_staff");
  const ownerToken = req.cookies.get("nirvana_owner");
  return !!(authToken?.value || refreshToken?.value || staffToken?.value || ownerToken?.value);
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Check if authenticated for non-public routes
  if (!isPublicAsset(pathname) && !isAuthenticated(req)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};
