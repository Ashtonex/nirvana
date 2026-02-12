import Sidebar from "@/components/Sidebar";

export default function MobileMenuPage() {
    return (
        <div className="min-h-screen bg-slate-950 p-6">
            <h1 className="text-3xl font-black text-white mb-6 uppercase italic">Menu</h1>
            <Sidebar />
        </div>
    );
}