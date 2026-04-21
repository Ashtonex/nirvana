import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

let schedulerInitialized = false;

export function middleware(request: NextRequest) {
  // Initialize backup scheduler on first request (only once per process)
  if (!schedulerInitialized && process.env.NODE_ENV === 'production') {
    schedulerInitialized = true;
    
    // Dynamically import and start the scheduler
    Promise.resolve().then(async () => {
      try {
        const { startBackupScheduler } = await import('@/lib/backup-scheduler');
        startBackupScheduler();
      } catch (error) {
        console.error('Failed to initialize backup scheduler:', error);
      }
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
