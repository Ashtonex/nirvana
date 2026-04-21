import { cookies } from 'next/headers';

/**
 * Check if request is from owner (uses owner cookie)
 */
export async function isOwnerRequest(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const ownerCookie = cookieStore.get('owner_session');
    const ownerEmail = cookieStore.get('owner_email');
    
    return !!(ownerCookie?.value && ownerEmail?.value === 'flectere@dev.com');
  } catch {
    return false;
  }
}

/**
 * Enforce owner-only access for API routes
 */
export async function enforceOwnerOnly() {
  const isOwner = await isOwnerRequest();
  if (!isOwner) {
    return new Response(
      JSON.stringify({ success: false, message: 'Unauthorized: Owner access required' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return null;
}
