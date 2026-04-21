'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { AlertCircle, Loader } from 'lucide-react';

const TheHandMaster = () => {
  const router = useRouter();
  const { user, employee, loading: authLoading } = useAuth();
  const [isOwner, setIsOwner] = useState(false);
  
  // Check if owner on mount
  useEffect(() => {
    if (!authLoading) {
      const ownerRole = employee?.role === 'owner' || user?.email === 'flectere@dev.com';
      setIsOwner(ownerRole);
      if (!ownerRole) {
        router.push('/');
      }
    }
  }, [authLoading, employee, user, router]);
  
  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <div className="text-center">
          <Loader className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
          <p className="text-slate-400">Authenticating...</p>
        </div>
      </div>
    );
  }
  
  // Show error if not owner
  if (!isOwner) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-2" />
          <p className="text-red-400 font-semibold">Access Denied</p>
          <p className="text-slate-400 text-sm mt-1">This page is for owners only</p>
        </div>
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState('dashboard');
  const [systemData, setSystemData] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  // Settings state
  const [settings, setSettings] = useState({
    taxRate: 0.155,
    taxThreshold: 0,
    deadStockDays: 60,
    currencySymbol: '$',
    zombieDays: 60
  });

  // Opening balance state
  const [openingBalances, setOpeningBalances] = useState({
    kipasa: 0,
    dubdub: 0,
    tradecenter: 0
  });

  // Stock management state
  const [stockFilters, setStockFilters] = useState({
    shop: 'all',
    category: 'all',
    status: 'all' // all, low, dead
  });

  const [stockData, setStockData] = useState([]);

  // Add log helper
  const addLog = useCallback((level, message, code = null) => {
    const log = {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
      code
    };
    setLogs(prev => [log, ...prev].slice(0, 100));
  }, []);

  // Load system state on mount
  useEffect(() => {
    loadSystemData();
    loadSettings();
    loadOpeningBalances();
  }, []);

  const loadSystemData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/hand/system-data');
      const data = await response.json();
      if (data.success) {
        setSystemData(data.data);
        addLog('success', 'System data loaded');
      } else {
        addLog('error', data.message);
      }
    } catch (err) {
      addLog('error', 'Failed to load system data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/hand/settings');
      const data = await response.json();
      if (data.success) {
        setSettings(data.settings);
        addLog('info', 'Settings loaded');
      }
    } catch (err) {
      addLog('error', 'Failed to load settings: ' + err.message);
    }
  };

  const loadOpeningBalances = async () => {
    try {
      const response = await fetch('/api/hand/opening-balances');
      const data = await response.json();
      if (data.success) {
        setOpeningBalances(data.balances);
        addLog('info', 'Opening balances loaded');
      }
    } catch (err) {
      addLog('error', 'Failed to load balances: ' + err.message);
    }
  };

  const loadStockData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams(stockFilters);
      const response = await fetch(`/api/hand/stock-data?${params}`);
      const data = await response.json();
      if (data.success) {
        setStockData(data.items);
        addLog('success', `Loaded ${data.items.length} stock items`);
      } else {
        addLog('error', data.message);
      }
    } catch (err) {
      addLog('error', 'Failed to load stock: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (key, value) => {
    try {
      const response = await fetch('/api/hand/update-setting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      });
      const data = await response.json();
      if (data.success) {
        setSettings(prev => ({ ...prev, [key]: value }));
        addLog('success', `${key} updated to ${value}`);
      } else {
        addLog('error', data.message);
      }
    } catch (err) {
      addLog('error', 'Failed to update setting: ' + err.message);
    }
  };

  const updateOpeningBalance = async (shop, amount) => {
    try {
      const response = await fetch('/api/hand/update-opening-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop, amount })
      });
      const data = await response.json();
      if (data.success) {
        setOpeningBalances(prev => ({ ...prev, [shop]: amount }));
        addLog('success', `${shop} opening balance set to $${amount.toFixed(2)}`);
      } else {
        addLog('error', data.message);
      }
    } catch (err) {
      addLog('error', 'Failed to update balance: ' + err.message);
    }
  };

  const updateStockLevel = async (itemId, newQty, shop) => {
    try {
      const response = await fetch('/api/hand/update-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, quantity: newQty, shop })
      });
      const data = await response.json();
      if (data.success) {
        setStockData(prev => prev.map(item => 
          item.id === itemId ? { ...item, quantity: newQty } : item
        ));
        addLog('success', `Stock updated: ${itemId} → ${newQty} units`);
      } else {
        addLog('error', data.message);
      }
    } catch (err) {
      addLog('error', 'Failed to update stock: ' + err.message);
    }
  };

  const runOperationsAnalysis = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/hand/operations-analysis');
      const data = await response.json();
      if (data.success) {
        addLog('success', `Operations: ${data.analysis.pendingTransfers} pending transfers, ${data.analysis.balanceIssues} balance issues`);
        return data.analysis;
      } else {
        addLog('error', data.message);
      }
    } catch (err) {
      addLog('error', 'Failed to analyze operations: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const runFinancialBrain = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/hand/financial-brain');
      const data = await response.json();
      if (data.success) {
        addLog('success', `Brain analysis: ${data.brain.insight}`);
        return data.brain;
      } else {
        addLog('error', data.message);
      }
    } catch (err) {
      addLog('error', 'Failed to run brain: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-black text-white">
      {/* Header */}
      <div className="bg-black border-b-4 border-purple-500 p-6">
        <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 mb-2">
          ⚔️ THE HAND - MASTER CONTROL
        </h1>
        <p className="text-gray-300">Complete System Management Center | All Functions Available</p>
      </div>

      {/* Main Layout */}
      <div className="flex h-screen bg-gray-900">
        {/* Sidebar Navigation */}
        <div className="w-64 bg-gray-950 border-r-2 border-purple-500 overflow-y-auto">
          <nav className="p-4 space-y-2">
            {[
              { id: 'dashboard', label: '📊 Dashboard', icon: '📊' },
              { id: 'settings', label: '⚙️ Settings', icon: '⚙️' },
              { id: 'balances', label: '💰 Balances', icon: '💰' },
              { id: 'stock', label: '📦 Inventory', icon: '📦' },
              { id: 'operations', label: '🏭 Operations', icon: '🏭' },
              { id: 'brain', label: '🧠 Money Brain', icon: '🧠' },
              { id: 'transactions', label: '💳 Transactions', icon: '💳' },
              { id: 'debug', label: '🔧 System Debug', icon: '🔧' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full text-left p-3 rounded transition ${
                  activeTab === tab.id
                    ? 'bg-purple-600 border-l-4 border-pink-500 font-bold'
                    : 'hover:bg-gray-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-8">
            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && (
              <DashboardTab systemData={systemData} addLog={addLog} loadSystemData={loadSystemData} />
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <SettingsTab settings={settings} updateSetting={updateSetting} addLog={addLog} />
            )}

            {/* Balances Tab */}
            {activeTab === 'balances' && (
              <BalancesTab balances={openingBalances} updateBalance={updateOpeningBalance} addLog={addLog} />
            )}

            {/* Stock Tab */}
            {activeTab === 'stock' && (
              <StockTab 
                stockData={stockData}
                filters={stockFilters}
                setFilters={setStockFilters}
                loadStockData={loadStockData}
                updateStockLevel={updateStockLevel}
                loading={loading}
                addLog={addLog}
              />
            )}

            {/* Operations Tab */}
            {activeTab === 'operations' && (
              <OperationsTab runAnalysis={runOperationsAnalysis} addLog={addLog} />
            )}

            {/* Brain Tab */}
            {activeTab === 'brain' && (
              <BrainTab runBrain={runFinancialBrain} addLog={addLog} />
            )}

            {/* Transactions Tab */}
            {activeTab === 'transactions' && (
              <TransactionsTab addLog={addLog} />
            )}

            {/* Debug Tab */}
            {activeTab === 'debug' && (
              <DebugTab logs={logs} addLog={addLog} />
            )}
          </div>
        </div>

        {/* Right Sidebar - System Logs */}
        <div className="w-80 bg-gray-950 border-l-2 border-purple-500 p-6 overflow-y-auto max-h-screen">
          <h3 className="text-xl font-bold text-purple-400 mb-4">📜 System Logs</h3>
          <div className="space-y-2">
            {logs.length === 0 ? (
              <p className="text-gray-500 text-sm">No logs yet...</p>
            ) : (
              logs.map(log => (
                <div
                  key={log.id}
                  className={`text-xs p-2 rounded border-l-4 ${
                    log.level === 'error'
                      ? 'bg-red-900 border-red-500 text-red-200'
                      : log.level === 'warning'
                      ? 'bg-yellow-900 border-yellow-500 text-yellow-200'
                      : log.level === 'success'
                      ? 'bg-green-900 border-green-500 text-green-200'
                      : 'bg-blue-900 border-blue-500 text-blue-200'
                  }`}
                >
                  <p className="font-mono text-xs">[{log.timestamp}]</p>
                  <p className="font-bold">{log.level.toUpperCase()}</p>
                  <p>{log.message}</p>
                  {log.code && <p className="opacity-70">Code: {log.code}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Tab Components
const DashboardTab = ({ systemData, addLog, loadSystemData }) => (
  <div className="space-y-6">
    <h2 className="text-3xl font-bold text-purple-400">System Dashboard</h2>
    {systemData ? (
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Sales" value={systemData.totalSales} color="green" />
        <StatCard label="Total Expenses" value={systemData.totalExpenses} color="red" />
        <StatCard label="Net Balance" value={systemData.netBalance} color="blue" />
        <StatCard label="Active Items" value={systemData.activeItems} color="yellow" />
      </div>
    ) : (
      <p className="text-gray-400">Loading...</p>
    )}
    <button
      onClick={loadSystemData}
      className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded font-bold transition"
    >
      🔄 Refresh Dashboard
    </button>
  </div>
);

const SettingsTab = ({ settings, updateSetting, addLog }) => (
  <div className="space-y-6">
    <h2 className="text-3xl font-bold text-purple-400">System Settings</h2>
    <div className="grid grid-cols-2 gap-6">
      <SettingInput
        label="Tax Rate"
        value={settings.taxRate}
        type="number"
        step="0.001"
        onChange={(v) => updateSetting('taxRate', parseFloat(v))}
        description="Default: 0.155 (15.5%)"
      />
      <SettingInput
        label="Dead Stock Days"
        value={settings.deadStockDays}
        type="number"
        onChange={(v) => updateSetting('deadStockDays', parseInt(v))}
        description="Items inactive for X days are considered dead stock"
      />
      <SettingInput
        label="Tax Threshold"
        value={settings.taxThreshold}
        type="number"
        onChange={(v) => updateSetting('taxThreshold', parseFloat(v))}
        description="Minimum sale amount to apply tax"
      />
      <SettingInput
        label="Currency Symbol"
        value={settings.currencySymbol}
        type="text"
        onChange={(v) => updateSetting('currencySymbol', v)}
        description="Display symbol for currency"
      />
    </div>
  </div>
);

const BalancesTab = ({ balances, updateBalance, addLog }) => (
  <div className="space-y-6">
    <h2 className="text-3xl font-bold text-purple-400">Opening Balances</h2>
    <p className="text-gray-400">Set opening cash balance for each shop</p>
    <div className="grid grid-cols-3 gap-6">
      {Object.entries(balances).map(([shop, amount]) => (
        <BalanceCard
          key={shop}
          shopId={shop}
          shopName={shop.charAt(0).toUpperCase() + shop.slice(1)}
          balance={amount}
          onUpdate={(v) => updateBalance(shop, parseFloat(v))}
        />
      ))}
    </div>
  </div>
);

const StockTab = ({ stockData, filters, setFilters, loadStockData, updateStockLevel, loading, addLog }) => (
  <div className="space-y-6">
    <h2 className="text-3xl font-bold text-purple-400">Inventory Management</h2>
    <div className="flex gap-4 mb-4">
      <select
        value={filters.shop}
        onChange={(e) => setFilters({ ...filters, shop: e.target.value })}
        className="bg-gray-800 text-white p-2 rounded border border-gray-600"
      >
        <option value="all">All Shops</option>
        <option value="kipasa">Kipasa</option>
        <option value="dubdub">Dub Dub</option>
        <option value="tradecenter">Trade Center</option>
      </select>
      <button
        onClick={loadStockData}
        disabled={loading}
        className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 px-6 py-2 rounded font-bold"
      >
        {loading ? '⏳ Loading...' : '📦 Load Stock'}
      </button>
    </div>
    <StockTable
      items={stockData}
      onUpdateQty={updateStockLevel}
    />
  </div>
);

const OperationsTab = ({ runAnalysis, addLog }) => {
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    const result = await runAnalysis();
    setAnalysis(result);
    setAnalyzing(false);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-purple-400">Operations Monitoring</h2>
      <button
        onClick={handleAnalyze}
        disabled={analyzing}
        className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-8 py-3 rounded font-bold text-lg"
      >
        {analyzing ? '⏳ Analyzing...' : '🔍 Run Analysis'}
      </button>
      {analysis && (
        <div className="bg-gray-800 border-2 border-green-500 p-6 rounded">
          <h3 className="text-2xl font-bold text-green-400 mb-4">Analysis Results</h3>
          <div className="space-y-3">
            <p>Pending Transfers: {analysis.pendingTransfers}</p>
            <p>Balance Issues: {analysis.balanceIssues}</p>
            <p>Operations Ledger Entries: {analysis.operationsCount}</p>
            <p>Last Updated: {new Date().toLocaleString()}</p>
          </div>
        </div>
      )}
    </div>
  );
};

const BrainTab = ({ runBrain, addLog }) => {
  const [brain, setBrain] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  const handleBrain = async () => {
    setAnalyzing(true);
    const result = await runBrain();
    setBrain(result);
    setAnalyzing(false);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-purple-400">Financial Brain Analysis</h2>
      <button
        onClick={handleBrain}
        disabled={analyzing}
        className="bg-pink-600 hover:bg-pink-700 disabled:bg-gray-600 px-8 py-3 rounded font-bold text-lg"
      >
        {analyzing ? '⏳ Thinking...' : '🧠 Run Brain Analysis'}
      </button>
      {brain && (
        <div className="bg-gray-800 border-2 border-pink-500 p-6 rounded space-y-4">
          <h3 className="text-2xl font-bold text-pink-400">Brain Insights</h3>
          <p className="text-lg">{brain.insight}</p>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <StatCard label="Revenue Trend" value={brain.revenueTrend} color="green" />
            <StatCard label="Expense Trend" value={brain.expenseTrend} color="red" />
            <StatCard label="Profit Margin" value={`${brain.profitMargin}%`} color="blue" />
            <StatCard label="Top Shop" value={brain.topShop} color="yellow" />
          </div>
        </div>
      )}
    </div>
  );
};

const TransactionsTab = ({ addLog }) => (
  <div className="space-y-6">
    <h2 className="text-3xl font-bold text-purple-400">Transaction Ledger</h2>
    <p className="text-gray-400">View all system transactions</p>
    <div className="bg-gray-800 border-2 border-blue-500 p-6 rounded">
      <p className="text-gray-400">Transaction data loads here...</p>
    </div>
  </div>
);

const DebugTab = ({ logs, addLog }) => {
  const [backups, setBackups] = useState([]);
  const [backupLoading, setBackupLoading] = useState(false);

  const performBackup = async () => {
    try {
      setBackupLoading(true);
      addLog('info', 'Creating backup...');
      const response = await fetch('/api/hand/auto-backup', { method: 'POST' });
      const result = await response.json();
      if (result.success) addLog('success', result.message);
      else addLog('error', result.message);
      loadBackups();
    } catch (error) {
      addLog('error', error.message);
    } finally {
      setBackupLoading(false);
    }
  };

  const loadBackups = async () => {
    try {
      const response = await fetch('/api/hand/auto-backup');
      const result = await response.json();
      if (result.success) setBackups(result.backups || []);
    } catch (e) {}
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-purple-400">🔧 System Debug & Backups</h2>
      <div className="bg-gray-800 border-2 border-green-500 p-4 rounded">
        <h3 className="text-lg font-bold text-green-400 mb-3">💾 Backups</h3>
        <div className="flex gap-2 mb-4">
          <button onClick={performBackup} disabled={backupLoading} className="bg-green-600 px-4 py-2 rounded text-sm">
            {backupLoading ? 'Creating...' : '📦 Backup'} 
          </button>
          <button onClick={loadBackups} className="bg-blue-600 px-4 py-2 rounded text-sm">🔄 Refresh</button>
        </div>
        <p className="text-xs text-gray-400 mb-2">✓ Hourly auto-backups | 30-day retention</p>
        <div className="max-h-40 overflow-y-auto bg-gray-700 p-2 rounded text-xs text-gray-300">
          {backups.slice(0, 5).map((b, i) => <div key={i}>📄 {b}</div>) || 'No backups'}
        </div>
      </div>
      <div className="bg-gray-800 border-2 border-orange-500 p-4 rounded max-h-96 overflow-y-auto">
        <pre className="text-xs text-gray-300">{JSON.stringify(logs.slice(0, 10), null, 2)}</pre>
      </div>
    </div>
  );
};

// Helper Components
const StatCard = ({ label, value, color }) => (
  <div className={`bg-gray-800 border-2 border-${color}-500 p-4 rounded`}>
    <p className="text-gray-400 text-sm">{label}</p>
    <p className={`text-2xl font-bold text-${color}-400`}>{value}</p>
  </div>
);

const SettingInput = ({ label, value, type, step, onChange, description }) => (
  <div className="bg-gray-800 border-2 border-purple-500 p-4 rounded">
    <label className="block text-sm text-gray-300 mb-2">{label}</label>
    <input
      type={type}
      value={value}
      step={step}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600 mb-2"
    />
    <p className="text-xs text-gray-400">{description}</p>
  </div>
);

const BalanceCard = ({ shopId, shopName, balance, onUpdate }) => (
  <div className="bg-gray-800 border-2 border-purple-500 p-4 rounded">
    <h3 className="text-lg font-bold text-purple-400 mb-2">{shopName}</h3>
    <input
      type="number"
      value={balance}
      onChange={(e) => onUpdate(e.target.value)}
      className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
      step="0.01"
    />
    <p className="text-sm text-gray-400 mt-2">Current: ${balance.toFixed(2)}</p>
  </div>
);

const StockTable = ({ items, onUpdateQty }) => (
  <div className="overflow-x-auto">
    <table className="w-full bg-gray-800 border-2 border-purple-500 rounded">
      <thead className="bg-gray-900 border-b-2 border-purple-500">
        <tr>
          <th className="p-3 text-left">Item</th>
          <th className="p-3 text-left">Category</th>
          <th className="p-3 text-right">Quantity</th>
          <th className="p-3 text-right">Action</th>
        </tr>
      </thead>
      <tbody>
        {items.map(item => (
          <tr key={item.id} className="border-b border-gray-700 hover:bg-gray-700">
            <td className="p-3">{item.name}</td>
            <td className="p-3">{item.category}</td>
            <td className="p-3 text-right">{item.quantity}</td>
            <td className="p-3 text-right">
              <button
                onClick={() => onUpdateQty(item.id, prompt(`New quantity for ${item.name}:`, item.quantity), item.shop)}
                className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm"
              >
                Edit
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default TheHandMaster;
