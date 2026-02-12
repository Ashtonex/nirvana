"use client";

import { Button } from "@/components/ui";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { usePathname } from 'next/navigation';

type Message = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
};

export function AiChat() {
    const pathname = usePathname();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input
        };

        setMessages(prev => [...prev, userMessage]);
        setInput("");
        setIsLoading(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })),
                    data: { path: pathname }
                })
            });

            if (!response.ok) throw new Error('Failed to get response');

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let assistantMessage = '';

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value);
                    assistantMessage += chunk;

                    setMessages(prev => {
                        const newMessages = [...prev];
                        const lastMessage = newMessages[newMessages.length - 1];
                        if (lastMessage?.role === 'assistant') {
                            lastMessage.content = assistantMessage;
                        } else {
                            newMessages.push({
                                id: (Date.now() + 1).toString(),
                                role: 'assistant',
                                content: assistantMessage
                            });
                        }
                        return newMessages;
                    });
                }
            }
        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: 'Sorry, I encountered an error. Please try again.'
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed bottom-6 md:bottom-6 bottom-20 right-6 z-50 flex flex-col items-end">
            {isOpen && (
                <Card className="w-[350px] md:w-[400px] h-[500px] shadow-2xl border-violet-500/50 bg-slate-950/95 backdrop-blur-xl mb-4 flex flex-col transition-all animate-in slide-in-from-bottom-10 fade-in duration-300">
                    <CardHeader className="bg-violet-600/10 border-b border-violet-500/20 py-3">
                        <CardTitle className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 text-violet-300">
                                <Sparkles className="h-4 w-4 text-violet-400" />
                                Nirvana AI
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="h-6 w-6 text-slate-400 hover:text-white">
                                <X className="h-4 w-4" />
                            </Button>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-violet-800 scrollbar-track-transparent">
                        {messages.length === 0 && (
                            <div className="text-center text-slate-500 text-xs mt-10">
                                <Sparkles className="h-8 w-8 mx-auto mb-2 text-violet-500/30" />
                                <p>Ask me anything about your inventory, staff, or performance.</p>
                            </div>
                        )}

                        {messages.map((m) => (
                            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${m.role === 'user'
                                    ? 'bg-violet-600 text-white rounded-tr-none'
                                    : 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700'
                                    }`}>
                                    {m.content}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-slate-800 text-slate-400 rounded-2xl rounded-tl-none px-4 py-2 text-xs animate-pulse">
                                    Thinking...
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </CardContent>
                    <div className="p-3 border-t border-slate-800 bg-slate-900/50">
                        <form onSubmit={handleSubmit} className="flex items-center gap-2">
                            <input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Ask Nirvana..."
                                className="flex-1 bg-slate-950 border border-slate-800 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500 transition-all placeholder:text-slate-600"
                            />
                            <Button type="submit" size="icon" disabled={isLoading || !input} className="rounded-full bg-violet-600 hover:bg-violet-700 h-8 w-8 shrink-0">
                                <Send className="h-4 w-4" />
                            </Button>
                        </form>
                    </div>
                </Card>
            )}

            <Button
                onClick={() => setIsOpen(!isOpen)}
                className={`h-14 w-14 rounded-full shadow-[0_0_30px_rgba(139,92,246,0.5)] transition-all duration-300 hover:scale-110 ${isOpen ? 'bg-slate-800 rotate-90 scale-0 opacity-0 absolute' : 'bg-gradient-to-r from-violet-600 to-indigo-600 opacity-100 scale-100'}`}
            >
                <MessageCircle className="h-8 w-8 text-white" />
            </Button>
        </div>
    );
}
