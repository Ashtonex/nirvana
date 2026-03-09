'use client';

import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import { Save } from 'lucide-react';

interface TaxSettingsFormProps {
    settings: {
        taxRate: number;
        taxThreshold: number;
        taxMode: string;
    };
}

export function TaxSettingsForm({ settings }: TaxSettingsFormProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleSubmit = async (formData: FormData) => {
        setIsLoading(true);
        setMessage(null);

        try {
            const response = await fetch('/api/settings/update-tax', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (result.success) {
                setMessage({ type: 'success', text: 'Fiscal constants updated successfully!' });
            } else {
                setMessage({ type: 'error', text: result.error || 'Failed to update settings' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to update settings' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <form action={handleSubmit} className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Global Tax Rate (%)</label>
                        <Input
                            name="taxRate"
                            type="number"
                            step="0.1"
                            defaultValue={settings.taxRate * 100}
                            className="bg-slate-900 border-slate-800 font-bold"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Tax Threshold ($)</label>
                        <Input
                            name="taxThreshold"
                            type="number"
                            defaultValue={settings.taxThreshold}
                            className="bg-slate-900 border-slate-800 font-bold"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Tax Applicability Mode</label>
                    <select
                        name="taxMode"
                        defaultValue={settings.taxMode}
                        className="w-full bg-slate-900 border border-slate-800 rounded-md p-2 text-sm font-bold text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                    >
                        <option value="all">Apply to All Products</option>
                        <option value="above_threshold">Only Above Threshold (ZIMRA Logic)</option>
                        <option value="none">Disable All Taxes</option>
                    </select>
                    <p className="text-[10px] text-slate-500 italic mt-1 uppercase leading-tight font-bold">
                        Determines how the Oracle calculates fiscal liability during POS checkout.
                    </p>
                </div>

                <Button 
                    type="submit" 
                    disabled={isLoading}
                    className="w-full h-12 bg-sky-600 hover:bg-sky-500 text-[10px] font-black uppercase italic tracking-widest shadow-[0_0_20px_rgba(14,165,233,0.3)]"
                >
                    <Save className="mr-2 h-4 w-4" /> 
                    {isLoading ? 'Saving...' : 'Finalize Fiscal Constants'}
                </Button>
            </form>

            {message && (
                <div className={`mt-4 p-3 rounded border text-sm font-bold ${
                    message.type === 'success' 
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                        : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                }`}>
                    {message.text}
                </div>
            )}
        </>
    );
}
