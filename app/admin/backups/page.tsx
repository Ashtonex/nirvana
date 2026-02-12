"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Button } from "@/components/ui";
import { ShieldCheck, Download, RefreshCcw, AlertTriangle, HardDrive } from "lucide-react";
import { format } from 'date-fns';

interface BackupFile {
    name: string;
    size: number;
    date: string;
}

export default function DataVault() {
    const [backups, setBackups] = useState<BackupFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [restoring, setRestoring] = useState(false);

    useEffect(() => {
        fetchBackups();
    }, []);

    const fetchBackups = async () => {
        try {
            const res = await fetch('/api/backups');
            const data = await res.json();
            if (Array.isArray(data)) {
                setBackups(data);
            }
        } catch (e) {
            console.error("Failed to fetch backups", e);
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async (file: string) => {
        if (!confirm(`WARNING: This will overwrite your current database with '${file}'. All data since this backup will be lost. Are you sure?`)) {
            return;
        }

        setRestoring(true);
        try {
            const res = await fetch('/api/backups/restore', {
                method: 'POST',
                body: JSON.stringify({ file }),
                headers: { 'Content-Type': 'application/json' }
            });

            if (res.ok) {
                alert("System restored successfully. The page will now reload.");
                window.location.reload();
            } else {
                alert("Restore failed. Check console.");
            }
        } catch (e) {
            console.error("Restore failed", e);
            alert("Restore failed.");
        } finally {
            setRestoring(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-500 bg-clip-text text-transparent">Data Vault</h1>
                <p className="text-slate-400 mt-2">Manage your data sovereignty. Download backups or travel back in time.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <Card className="bg-slate-900/50 border-emerald-500/20">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-slate-200">Total Snapshots</CardTitle>
                        <ShieldCheck className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{backups.length}</div>
                        <p className="text-xs text-slate-500">Auto-generated backups</p>
                    </CardContent>
                </Card>
                <Card className="bg-slate-900/50 border-cyan-500/20">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-slate-200">Latest Backup</CardTitle>
                        <HardDrive className="h-4 w-4 text-cyan-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {backups[0] ? format(new Date(backups[0].date), 'h:mm a') : '--'}
                        </div>
                        <p className="text-xs text-slate-500">
                            {backups[0] ? format(new Date(backups[0].date), 'MMM d, yyyy') : 'No backups found'}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-800 bg-slate-950/50">
                <CardHeader>
                    <CardTitle>Backup History</CardTitle>
                    <CardDescription>
                        Safekeeping your empire's data. Download for off-site storage.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {loading && <div className="text-center p-4 text-slate-500">Scanning vault...</div>}

                        {!loading && backups.length === 0 && (
                            <div className="text-center p-10 border border-dashed border-slate-800 rounded-lg">
                                <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
                                <p className="text-slate-400">No backups found.</p>
                                <p className="text-xs text-slate-600 mt-1">Backups are generated automatically when data changes.</p>
                            </div>
                        )}

                        {backups.map((backup) => (
                            <div key={backup.name} className="flex items-center justify-between p-4 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                        <HardDrive className="h-5 w-5 text-emerald-500" />
                                    </div>
                                    <div>
                                        <div className="font-medium text-slate-200">{backup.name}</div>
                                        <div className="text-xs text-slate-500">
                                            {format(new Date(backup.date), 'PPpp')} • {(backup.size / 1024).toFixed(2)} KB
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <a
                                        href={`/api/backups/download?file=${backup.name}`}
                                        download
                                        className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-95 border border-slate-700 bg-transparent hover:bg-slate-800 text-slate-100 h-9 rounded-md px-3"
                                    >
                                        <Download className="h-4 w-4 mr-2" />
                                        Download
                                    </a>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => handleRestore(backup.name)}
                                        disabled={restoring}
                                    >
                                        <RefreshCcw className={`h-4 w-4 mr-2 ${restoring ? 'animate-spin' : ''}`} />
                                        Restore
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
