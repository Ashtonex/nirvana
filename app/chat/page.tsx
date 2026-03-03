"use client";

import { useState, useEffect, useRef } from 'react';
import { supabaseAuth } from '@/components/AuthProvider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui';
import { Input } from '@/components/ui';
import { Button } from '@/components/ui';
import { 
    MessageSquare, 
    Send, 
    Users, 
    Globe, 
    Store, 
    Package, 
    ArrowRightLeft,
    Loader2,
    Hash
} from 'lucide-react';

interface Chat {
    id: string;
    name: string | null;
    chat_type: string;
    is_shop_specific: boolean;
    shop_id: string | null;
}

interface Message {
    id: string;
    chat_id: string;
    sender_id: string;
    sender_name: string;
    message: string;
    message_type: string;
    metadata: Record<string, any>;
    created_at: string;
}

interface Employee {
    id: string;
    name: string;
    surname: string;
    shop_id: string;
    role: string;
}

export default function ChatPage() {
    const [chats, setChats] = useState<Chat[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [currentUser, setCurrentUser] = useState<Employee | null>(null);
    const [showAllChats, setShowAllChats] = useState(false);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchCurrentUser();
        fetchChats();
        fetchEmployees();
    }, []);

    useEffect(() => {
        if (selectedChat) {
            fetchMessages(selectedChat.id);
            const channel = supabaseAuth
                .channel(`chat:${selectedChat.id}`)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
                    if (payload.new && (payload.new as any).chat_id === selectedChat.id) {
                        setMessages(prev => [...prev, payload.new as any]);
                    }
                })
                .subscribe();

            return () => {
                supabaseAuth.removeChannel(channel);
            };
        }
    }, [selectedChat]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const fetchCurrentUser = async () => {
        const { data: { user } } = await supabaseAuth.auth.getUser();
        if (user) {
            const { data } = await supabaseAuth
                .from('employees')
                .select('*')
                .eq('id', user.id)
                .single();
            setCurrentUser(data);
        }
    };

    const fetchChats = async () => {
        const { data } = await supabaseAuth
            .from('chats')
            .select('*')
            .order('created_at', { ascending: true });
        
        if (data) setChats(data);
        setLoading(false);
    };

    const fetchEmployees = async () => {
        const { data } = await supabaseAuth
            .from('employees')
            .select('*')
            .eq('is_active', true);
        
        if (data) setEmployees(data);
    };

    const fetchMessages = async (chatId: string) => {
        const { data } = await supabaseAuth
            .from('chat_messages')
            .select('*')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: true });
        
        if (data) setMessages(data);
    };

    const sendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedChat || !currentUser) return;

        setSending(true);
        
        const messageText = newMessage.trim();
        let messageType = 'text';
        let metadata = {};

        if (messageText.startsWith('@')) {
            const stockRequestMatch = messageText.match(/@(\w+)\s+need\s+(\d+)\s+(.+)/i);
            if (stockRequestMatch) {
                messageType = 'stock_request';
                metadata = {
                    action: 'stock_request',
                    shop: stockRequestMatch[1].toLowerCase(),
                    quantity: parseInt(stockRequestMatch[2]),
                    itemName: stockRequestMatch[3].trim()
                };
            }
        }

        await supabaseAuth.from('chat_messages').insert({
            chat_id: selectedChat.id,
            sender_id: currentUser.id,
            sender_name: `${currentUser.name} ${currentUser.surname}`,
            message: messageText,
            message_type: messageType,
            metadata
        });

        setNewMessage('');
        setSending(false);
    };

    const filteredChats = showAllChats 
        ? chats 
        : chats.filter(c => !c.is_shop_specific || c.shop_id === currentUser?.shop_id);

    const getChatIcon = (chat: Chat) => {
        if (chat.chat_type === 'stock_request') return <Package className="h-4 w-4 text-amber-500" />;
        if (chat.is_shop_specific) return <Store className="h-4 w-4 text-emerald-500" />;
        return <Globe className="h-4 w-4 text-violet-500" />;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 text-violet-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-black tracking-tighter uppercase italic flex items-center gap-3">
                        <MessageSquare className="text-violet-500 h-10 w-10" /> Team Chat
                    </h1>
                    <p className="text-slate-400 font-medium">Communicate with your team and request stock transfers.</p>
                </div>
                <div className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-lg border border-slate-800">
                    <button
                        onClick={() => setShowAllChats(false)}
                        className={`px-4 py-2 rounded-md text-xs font-black uppercase tracking-widest transition-all ${
                            !showAllChats ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <Store className="h-4 w-4 inline mr-2" />
                        My Shop
                    </button>
                    <button
                        onClick={() => setShowAllChats(true)}
                        className={`px-4 py-2 rounded-md text-xs font-black uppercase tracking-widest transition-all ${
                            showAllChats ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <Globe className="h-4 w-4 inline mr-2" />
                        All Chats
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="md:col-span-1 bg-slate-900 border-slate-800">
                    <CardHeader className="border-b border-slate-800">
                        <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                            <Hash className="h-4 w-4" /> Channels
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-2">
                        <div className="space-y-1">
                            {filteredChats.map(chat => (
                                <button
                                    key={chat.id}
                                    onClick={() => setSelectedChat(chat)}
                                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all ${
                                        selectedChat?.id === chat.id
                                            ? 'bg-violet-600/20 text-violet-400 border border-violet-500/30'
                                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    {getChatIcon(chat)}
                                    <span className="text-sm font-medium truncate">
                                        {chat.name || chat.chat_type}
                                    </span>
                                </button>
                            ))}
                        </div>

                        <div className="mt-4 pt-4 border-t border-slate-800">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                Online Workers
                            </p>
                            <div className="space-y-1">
                                {employees.slice(0, 5).map(emp => (
                                    <div key={emp.id} className="flex items-center gap-2 px-2">
                                        <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                                        <span className="text-xs text-slate-400 truncate">
                                            {emp.name} {emp.surname?.[0]}.
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="md:col-span-3 bg-slate-900 border-slate-800 flex flex-col">
                    {selectedChat ? (
                        <>
                            <CardHeader className="border-b border-slate-800 py-4">
                                <CardTitle className="text-lg font-black uppercase flex items-center gap-2">
                                    {getChatIcon(selectedChat)}
                                    {selectedChat.name || selectedChat.chat_type}
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    {selectedChat.chat_type === 'stock_request' && (
                                        <span className="text-amber-500">
                                            Use format: @shop need 5 item name (e.g., @kipasa need 5 iPhone)
                                        </span>
                                    )}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[500px]">
                                {messages.map(msg => (
                                    <div
                                        key={msg.id}
                                        className={`flex ${msg.sender_id === currentUser?.id ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div className={`max-w-[70%] ${
                                            msg.sender_id === currentUser?.id
                                                ? 'bg-violet-600 text-white'
                                                : 'bg-slate-800 text-slate-200'
                                        } rounded-2xl px-4 py-2`}>
                                            <p className="text-[10px] font-black opacity-60 mb-1">
                                                {msg.sender_name}
                                            </p>
                                            <p className="text-sm">{msg.message}</p>
                                            <p className="text-[9px] opacity-50 text-right mt-1">
                                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </CardContent>
                            <div className="p-4 border-t border-slate-800">
                                <form onSubmit={sendMessage} className="flex gap-2">
                                    <Input
                                        value={newMessage}
                                        onChange={(e) => setNewMessage(e.target.value)}
                                        placeholder={selectedChat.chat_type === 'stock_request' ? '@shop need 5 item name...' : 'Type a message...'}
                                        className="bg-slate-950 border-slate-800"
                                    />
                                    <Button type="submit" disabled={sending || !newMessage.trim()}>
                                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    </Button>
                                </form>
                            </div>
                        </>
                    ) : (
                        <CardContent className="flex-1 flex items-center justify-center text-slate-500">
                            <div className="text-center">
                                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-20" />
                                <p className="font-medium">Select a channel to start chatting</p>
                            </div>
                        </CardContent>
                    )}
                </Card>
            </div>
        </div>
    );
}
