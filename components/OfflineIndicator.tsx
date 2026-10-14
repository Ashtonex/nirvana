'use client';

import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, Cloud, Database, AlertCircle } from 'lucide-react';
import { syncEngine, type SyncStatus } from '@/lib/sync-engine';
import { ensureConnectivityMonitor, getConnectivity, subscribeConnectivity } from '@/lib/connectivity';

export function OfflineIndicator() {
    const [isOnline, setIsOnline] = useState(true);
    const [status, setStatus] = useState<SyncStatus>(syncEngine.getStatus());
    const [showBanner, setShowBanner] = useState(false);

    useEffect(() => {
        ensureConnectivityMonitor();
        setIsOnline(getConnectivity());

        const unsubConnectivity = subscribeConnectivity((online) => {
            setIsOnline(online);
            setShowBanner(!online);

            if (online) {
                syncEngine.refreshPendingCount().then((count) => {
                    if (count > 0) {
                        setShowBanner(true);
                        setTimeout(() => setShowBanner(false), 4000);
                    }
                });
            }
        });

        const unsubSync = syncEngine.subscribe((newStatus) => {
            setStatus(newStatus);
            if (newStatus.failedCount > 0) {
                setShowBanner(true);
            }
        });

        syncEngine.refreshPendingCount();

        return () => {
            unsubConnectivity();
            unsubSync();
        };
    }, []);

    if (isOnline && status.pendingCount === 0 && status.failedCount === 0) {
        return null;
    }

    const handleRetry = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isOnline) {
            syncEngine.syncNow();
        }
    };

    return (
        <>
            {/* Top Offline / Sync Status Banner */}
            {showBanner && (
                <div
                    className={`fixed top-0 left-0 right-0 z-50 px-4 py-2 flex items-center justify-center gap-3 text-xs sm:text-sm font-semibold tracking-wide transition-all shadow-md ${
                        !isOnline
                            ? 'bg-rose-600/95 text-white'
                            : status.failedCount > 0
                            ? 'bg-amber-600/95 text-white'
                            : 'bg-emerald-600/95 text-white'
                    }`}
                >
                    {!isOnline ? (
                        <>
                            <WifiOff className="w-4 h-4 shrink-0" />
                            <span>Working Offline — All transactions &amp; drawer changes are preserved locally.</span>
                            {status.pendingCount > 0 && (
                                <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs font-mono">
                                    {status.pendingCount} queued
                                </span>
                            )}
                        </>
                    ) : status.failedCount > 0 ? (
                        <>
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{status.failedCount} item(s) failed sync.</span>
                            <button
                                onClick={handleRetry}
                                className="bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded text-xs uppercase tracking-wider font-bold transition-all"
                            >
                                Retry Now
                            </button>
                        </>
                    ) : (
                        <>
                            <Cloud className="w-4 h-4 shrink-0" />
                            <span>Back online!</span>
                            {status.isSyncing && <RefreshCw className="w-4 h-4 animate-spin shrink-0" />}
                        </>
                    )}
                </div>
            )}

            {/* Subtle Corner Status Pill */}
            <div className="fixed bottom-4 right-4 z-40">
                <div
                    onClick={isOnline ? handleRetry : undefined}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-xl cursor-pointer select-none backdrop-blur-md transition-all border ${
                        !isOnline
                            ? 'bg-rose-950/80 text-rose-300 border-rose-500/40 hover:bg-rose-900/80'
                            : status.isSyncing
                            ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                            : status.failedCount > 0
                            ? 'bg-orange-950/80 text-orange-300 border-orange-500/40 hover:bg-orange-900/80'
                            : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                    }`}
                >
                    {!isOnline ? (
                        <>
                            <Database className="w-3.5 h-3.5 text-rose-400" />
                            <span>Offline Mode</span>
                            {status.pendingCount > 0 && (
                                <span className="bg-rose-500/30 text-rose-200 px-1.5 py-0.5 rounded-full text-[10px] font-mono">
                                    {status.pendingCount}
                                </span>
                            )}
                        </>
                    ) : status.isSyncing ? (
                        <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                            <span>Syncing...</span>
                            {status.pendingCount > 0 && (
                                <span className="font-mono text-[10px] text-amber-200">
                                    ({status.pendingCount})
                                </span>
                            )}
                        </>
                    ) : status.failedCount > 0 ? (
                        <>
                            <AlertCircle className="w-3.5 h-3.5 text-orange-400" />
                            <span>{status.failedCount} Failed • Tap to Retry</span>
                        </>
                    ) : (
                        <>
                            <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Online</span>
                            {status.pendingCount > 0 && (
                                <span className="bg-emerald-500/30 text-emerald-200 px-1.5 py-0.5 rounded-full text-[10px] font-mono">
                                    {status.pendingCount} pending
                                </span>
                            )}
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

// Minimal inline status indicator
export function ConnectionStatus({ className = '' }: { className?: string }) {
    const [isOnline, setIsOnline] = useState(true);

    useEffect(() => {
        ensureConnectivityMonitor();
        setIsOnline(getConnectivity());
        return subscribeConnectivity(setIsOnline);
    }, []);

    return (
        <div className={`flex items-center gap-1.5 text-xs font-semibold ${className}`}>
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-rose-500 animate-pulse'}`} />
            <span className={isOnline ? 'text-emerald-400' : 'text-rose-400'}>
                {isOnline ? 'Connected' : 'Offline'}
            </span>
        </div>
    );
}
