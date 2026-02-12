"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui";
import { Trophy, Medal, Zap } from "lucide-react";

interface LeaderboardProps {
    staff: {
        id: string;
        name: string;
        revenue: number;
        points: number;
        conversionRate: number;
    }[];
}

export function Leaderboard({ staff }: LeaderboardProps) {
    const top3 = staff.slice(0, 3);
    const rest = staff.slice(3);

    return (
        <Card className="col-span-3">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Trophy className="text-yellow-400" />
                    Champions League
                </CardTitle>
                <CardDescription>Top performing agents this month</CardDescription>
            </CardHeader>
            <CardContent>
                {/* PODIUM */}
                <div className="flex items-end justify-center gap-4 mb-8 pt-4">
                    {/* SILVER */}
                    {top3[1] && (
                        <div className="flex flex-col items-center">
                            <div className="text-xs font-bold text-slate-400 mb-2">{top3[1].name}</div>
                            <div className="w-16 h-24 bg-slate-700 rounded-t-lg flex items-center justify-center relative border-t-4 border-slate-400">
                                <Medal className="text-slate-400 w-8 h-8" />
                            </div>
                            <div className="text-xs font-bold mt-2 text-slate-400">
                                {top3[1].points} pts
                            </div>
                        </div>
                    )}

                    {/* GOLD */}
                    {top3[0] && (
                        <div className="flex flex-col items-center z-10">
                            <Zap className="text-yellow-400 w-6 h-6 mb-2 animate-bounce" />
                            <div className="text-sm font-bold text-yellow-500 mb-2">{top3[0].name}</div>
                            <div className="w-20 h-32 bg-slate-800 rounded-t-lg flex items-center justify-center relative border-t-4 border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.2)]">
                                <Trophy className="text-yellow-400 w-10 h-10" />
                            </div>
                            <div className="text-sm font-bold mt-2 text-yellow-500">
                                {top3[0].points} pts
                            </div>
                        </div>
                    )}

                    {/* BRONZE */}
                    {top3[2] && (
                        <div className="flex flex-col items-center">
                            <div className="text-xs font-bold text-amber-700 mb-2">{top3[2].name}</div>
                            <div className="w-16 h-20 bg-slate-700 rounded-t-lg flex items-center justify-center relative border-t-4 border-amber-700">
                                <Medal className="text-amber-700 w-8 h-8" />
                            </div>
                            <div className="text-xs font-bold mt-2 text-amber-700">
                                {top3[2].points} pts
                            </div>
                        </div>
                    )}
                </div>

                {/* LIST */}
                <div className="space-y-3 mt-4">
                    {rest.map((emp, i) => (
                        <div key={emp.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-900/50">
                            <div className="flex items-center gap-3">
                                <span className="text-slate-500 font-mono w-4">{i + 4}</span>
                                <span className="font-medium">{emp.name}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-slate-400">
                                <span>${emp.revenue.toLocaleString()}</span>
                                <span className="text-primary font-bold">{emp.points} pts</span>
                            </div>
                        </div>
                    ))}
                    {staff.length === 0 && (
                        <div className="text-center text-slate-500 py-4">
                            No active staff data found.
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
