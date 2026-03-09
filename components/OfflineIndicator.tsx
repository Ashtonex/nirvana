'use client';

import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, Cloud, Database } from 'lucide-react';
import { getPendingSyncCount } from '@/lib/local-db';

export function OfflineIndicator() {
    const [isOnline, setIsOnline] = useState(true);
    const [pendingCount, setPendingCount] = useState(0);
    const [showBanner, setShowBanner] = useState(false);

    useEffect(() => {
        // Initial state
        setIsOnline(navigator.onLine);
        
        const updateStatus = async () => {
            const online = navigator.onLine;
            setIsOnline(online);
            setShowBanner(!online);
            
            if (online) {
                const count = await getPendingSyncCount();
                setPendingCount(count);
            }
        };
        
        const handleOnline = () => {
            setIsOnline(true);
            setShowBanner(false);
            // Show sync status briefly
            getPendingSyncCount().then(count => {
                setPendingCount(count);
                if (count > 0) {
                    setShowBanner(true);
                    setTimeout(() => setShowBanner(false), 3000);
                }
            });
        };
        
        const handleOffline = () => {
            setIsOnline(false);
            setShowBanner(true);
        };
        
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        
        // Check initial pending count
        getPendingSyncCount().then(setPendingCount);
        
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    if (isOnline && pendingCount === 0) {
        return null;
    }

    return (
        <>
            {/* Offline Banner */}
            {showBanner && (
                <div className={`fixed top-0 left-0 right-0 z-50 px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium ${
                    isOnline 
                        ? 'bg-amber-500/90 text-amber-950' 
                        : 'bg-red-500/90 text-white'
                }`}>
                    {isOnline ? (
                        <>
                            <Cloud className="w-4 h-4" />
                            <span>Back online! {pendingCount > 0 && `${pendingCount} changes syncing...`}</span>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        </>
                    ) : (
                        <>
                            <WifiOff className="w-4 h-4" />
                            <span>You're offline. Changes will sync when reconnected.</span>
                            {pendingCount > 0 && (
                                <span className="bg-white/20 px-2 py-0.5 rounded text-xs">
                                    {pendingCount} pending
                                </span>
                            )}
                        </>
                    )}
                </div>
            )}
            
            {/* Status Pill in Corner */}
            <div className="fixed bottom-4 right-4 z-40">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium shadow-lg ${
                    isOnline 
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}>
                    {isOnline ? (
                        <>
                            <Cloud className="w-3 h-3" />
                            <span>Online</span>
                            {pendingCount > 0 && (
                                <span className="bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
                                    {pendingCount}
                                </span>
                            )}
                        </>
                    ) : (
                        <>
                            <Database className="w-3 h-3" />
                            <span>Offline Mode</span>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

// Minimal indicator for embedding in existing UI
export function ConnectionStatus({ className = '' }: { className?: string }) {
    const [isOnline, setIsOnline] = useState(true);
    
    useEffect(() => {
        setIsOnline(navigator.onLine);
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);
    
    return (
        <div className={`flex items-center gap-1.5 text-xs ${className}`}>
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className={isOnline ? 'text-green-400' : 'text-red-400'}>
                {isOnline ? 'Connected' : 'Offline'}
            </span>
        </div>
    );
}

