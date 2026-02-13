'use client';

import { useEffect, useState } from 'react';

export function ServiceWorkerRegistration() {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            setIsInstalled(true);
        }

        if ('serviceWorker' in navigator) {
            // Register immediately
            navigator.serviceWorker
                .register('/sw.js')
                .then((registration) => {
                    console.log('SW registered: ', registration);
                    // Force update if a new worker is found
                    registration.onupdatefound = () => {
                        const installingWorker = registration.installing;
                        if (installingWorker) {
                            installingWorker.onstatechange = () => {
                                if (installingWorker.state === 'installed') {
                                    if (navigator.serviceWorker.controller) {
                                        console.log('New content available; please refresh.');
                                    }
                                }
                            };
                        }
                    };
                })
                .catch((registrationError) => {
                    console.error('SW registration failed: ', registrationError);
                });
        }

        // Listen for install prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
            console.log('Install prompt captured');
        });

        window.addEventListener('appinstalled', () => {
            setDeferredPrompt(null);
            setIsInstalled(true);
            console.log('App installed successfully');
        });
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to install prompt: ${outcome}`);
        setDeferredPrompt(null);
    };

    // Only show the debug button in development or via special trigger if needed
    // But for now, let's keep it hidden unless a prompt is available
    if (!deferredPrompt || isInstalled) return null;

    return (
        <div className="fixed bottom-20 left-4 right-4 z-50 p-4 bg-primary rounded-xl shadow-lg border border-white/20 animate-bounce cursor-pointer" onClick={handleInstallClick}>
            <div className="flex items-center justify-between">
                <span className="text-white font-bold text-sm">Install Nirvana App for full experience</span>
                <span className="bg-white text-primary px-3 py-1 rounded-lg text-xs font-black">INSTALL</span>
            </div>
        </div>
    );
}
