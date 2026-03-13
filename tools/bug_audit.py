import os
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]
API_ROOT = REPO_ROOT / "app" / "api"


@dataclass(frozen=True)
class RouteSignals:
    route_file: Path
    endpoint: str
    has_cookie_auth: bool
    has_bearer_auth: bool
    uses_supabase_admin: bool
    uses_service_role_key: bool
    uses_fs: bool
    uses_openai: bool
    has_test_bypass: bool
    has_hardcoded_password: bool
    sets_secure_true_cookie: bool
    has_swallowed_errors: bool


def iter_route_files() -> Iterable[Path]:
    if not API_ROOT.exists():
        return []
    return API_ROOT.rglob("route.ts")


def endpoint_from_route_file(route_file: Path) -> str:
    rel = route_file.relative_to(REPO_ROOT).as_posix()
    # app/api/<...>/route.ts -> /api/<...>
    if not rel.startswith("app/api/") or not rel.endswith("/route.ts"):
        return rel
    return "/api/" + rel[len("app/api/") : -len("/route.ts")]


def scan_route(route_file: Path) -> RouteSignals:
    text = route_file.read_text(encoding="utf-8", errors="replace")

    has_cookie_auth = (
        "cookies()" in text
        or "cookies(" in text
        or "nirvana_staff" in text
        or "nirvana_owner" in text
        or "sb-access-token" in text
        or "sb-refresh-token" in text
    )
    has_bearer_auth = bool(re.search(r'headers\.get\(["\']authorization["\']\)', text)) or "Bearer" in text
    uses_supabase_admin = "supabaseAdmin" in text
    uses_service_role_key = "SUPABASE_SERVICE_ROLE_KEY" in text
    uses_fs = bool(re.search(r"\bfs\b|from\s+['\"]fs", text))
    uses_openai = "openai(" in text or "@ai-sdk/openai" in text or "streamText" in text

    has_test_bypass = bool(re.search(r"searchParams\.get\([\"']test[\"']\)\s*===\s*[\"']true[\"']", text)) or (
        "isTest" in text and "if (!isTest" in text
    )

    has_hardcoded_password = bool(re.search(r"OWNER_PASSWORD\s*=\s*[\"'][^\"']+[\"']", text))
    sets_secure_true_cookie = bool(re.search(r"secure\s*:\s*true", text))

    has_swallowed_errors = bool(re.search(r"catch\s*\{\s*\}", text)) or ".catch(() => undefined)" in text

    return RouteSignals(
        route_file=route_file,
        endpoint=endpoint_from_route_file(route_file),
        has_cookie_auth=has_cookie_auth,
        has_bearer_auth=has_bearer_auth,
        uses_supabase_admin=uses_supabase_admin,
        uses_service_role_key=uses_service_role_key,
        uses_fs=uses_fs,
        uses_openai=uses_openai,
        has_test_bypass=has_test_bypass,
        has_hardcoded_password=has_hardcoded_password,
        sets_secure_true_cookie=sets_secure_true_cookie,
        has_swallowed_errors=has_swallowed_errors,
    )


def severity_for(route: RouteSignals) -> str:
    """
    Heuristic severity for reporting (not a substitute for threat modeling).
    """
    if route.has_hardcoded_password:
        return "PURPLE"
    if route.uses_service_role_key and not (route.has_cookie_auth or route.has_bearer_auth):
        return "PURPLE"
    if (route.uses_fs or route.uses_openai) and not (route.has_cookie_auth or route.has_bearer_auth):
        return "PURPLE"
    if route.uses_supabase_admin and not (route.has_cookie_auth or route.has_bearer_auth):
        return "PURPLE"
    if route.has_test_bypass:
        return "PURPLE"
    if route.sets_secure_true_cookie:
        return "GREEN"
    if route.has_swallowed_errors:
        return "ORANGE"
    return "GREEN"


def main() -> None:
    routes = [scan_route(p) for p in sorted(iter_route_files())]
    today = date.today().isoformat()

    print(f"# API Route Audit (heuristic)\n")
    print(f"Date: {today}")
    print(f"Routes scanned: {len(routes)}\n")
    print("| Sev | Endpoint | Signals | File |")
    print("|---|---|---|---|")
    for r in routes:
        sev = severity_for(r)
        signals = []
        if r.has_cookie_auth:
            signals.append("cookie-auth")
        if r.has_bearer_auth:
            signals.append("bearer-auth")
        if r.uses_service_role_key:
            signals.append("service-role")
        if r.uses_fs:
            signals.append("fs")
        if r.uses_openai:
            signals.append("openai")
        if r.has_test_bypass:
            signals.append("test-bypass")
        if r.has_hardcoded_password:
            signals.append("hardcoded-password")
        if r.sets_secure_true_cookie:
            signals.append("secure:true-cookie")
        if r.has_swallowed_errors:
            signals.append("swallowed-errors")

        sig = ", ".join(signals) if signals else "-"
        file_rel = r.route_file.relative_to(REPO_ROOT).as_posix()
        print(f"| {sev} | `{r.endpoint}` | {sig} | `{file_rel}` |")


if __name__ == "__main__":
    main()

