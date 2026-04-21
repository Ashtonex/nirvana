'use client';

import { useState, useEffect } from 'react';
import { supabaseAdmin } from '@/lib/supabase';

interface ErrorLog {
  id: string;
  timestamp: string;
  level: 'error' | 'warning' | 'info' | 'success';
  message: string;
  code?: string;
}

interface Shop {
  id: string;
  name: string;
}

export default function TheHand() {
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [shops, setShops] = useState<Shop[]>([
    { id: 'kipasa', name: 'Kipasa' },
    { id: 'dubdub', name: 'Dub Dub' },
    { id: 'tradecenter', name: 'Trade Center' }
  ]);

  // Form states
  const [salesToAdd, setSalesToAdd] = useState({
    shopId: 'kipasa',
    clientName: '',
    itemName: '',
    quantity: 1,
    unitPrice: 0,
    date: new Date().toISOString().split('T')[0],
    employeeId: 'SYSTEM'
  });

  const [expensesToAdd, setExpensesToAdd] = useState({
    shopId: 'kipasa',
    category: 'misc',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    description: '',
    autoRoute: true
  });

  const [backupStatus, setBackupStatus] = useState('idle');
  const [dataStats, setDataStats] = useState<any>(null);

  // Add error log
  const addLog = (level: 'error' | 'warning' | 'info' | 'success', message: string, code?: string) => {
    const log: ErrorLog = {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
      code
    };
    setErrorLogs(prev => [log, ...prev].slice(0, 50)); // Keep last 50
  };

  // Check system health on mount
  useEffect(() => {
    checkSystemHealth();
    fetchDataStats();
  }, []);

  const checkSystemHealth = async () => {
    try {
      // Check Supabase connection
      const { data, error } = await supabaseAdmin.from('employees').select('count').limit(1);
      if (error) {
        addLog('error', 'Supabase connection failed', error.code);
      } else {
        addLog('success', 'Supabase connection OK');
      }

      // Check local JSON
      try {
        const response = await fetch('/api/hand/health');
        const result = await response.json();
        if (result.localJson) {
          addLog('success', 'Local JSON backup ready');
        } else {
          addLog('warning', 'Local JSON not configured');
        }
      } catch (e) {
        addLog('warning', 'Local JSON check failed');
      }
    } catch (err: any) {
      addLog('error', 'System health check failed: ' + err.message);
    }
  };

  const fetchDataStats = async () => {
    try {
      const response = await fetch('/api/hand/stats');
      const stats = await response.json();
      setDataStats(stats);
      addLog('info', `Loaded data stats: ${stats.salesCount} sales, ${stats.expensesCount} expenses`);
    } catch (err: any) {
      addLog('error', 'Failed to fetch stats: ' + err.message);
    }
  };

  // Record past sale
  const handleAddSale = async () => {
    if (!salesToAdd.clientName || !salesToAdd.itemName || salesToAdd.unitPrice <= 0) {
      addLog('error', 'Please fill all sale fields');
      return;
    }

    try {
      const timestamp = new Date(salesToAdd.date + 'T12:00:00Z').toISOString();
      const taxRate = 0.155;
      const subtotal = salesToAdd.quantity * salesToAdd.unitPrice;
      const tax = subtotal * taxRate;
      const totalWithTax = subtotal + tax;

      const response = await fetch('/api/hand/add-sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: salesToAdd.shopId,
          clientName: salesToAdd.clientName,
          itemName: salesToAdd.itemName,
          quantity: salesToAdd.quantity,
          unitPrice: salesToAdd.unitPrice,
          totalBeforeTax: subtotal,
          tax,
          totalWithTax,
          date: timestamp,
          employeeId: salesToAdd.employeeId,
          overwrite: true
        })
      });

      const result = await response.json();
      if (result.success) {
        addLog('success', `Sale added: ${salesToAdd.clientName} - $${totalWithTax.toFixed(2)}`);
        setSalesToAdd({
          shopId: 'kipasa',
          clientName: '',
          itemName: '',
          quantity: 1,
          unitPrice: 0,
          date: new Date().toISOString().split('T')[0],
          employeeId: 'SYSTEM'
        });
        fetchDataStats();
      } else {
        addLog('error', result.message || 'Failed to add sale');
      }
    } catch (err: any) {
      addLog('error', 'Error adding sale: ' + err.message);
    }
  };

  // Record past expense
  const handleAddExpense = async () => {
    if (expensesToAdd.amount <= 0) {
      addLog('error', 'Please enter a valid amount');
      return;
    }

    try {
      const timestamp = new Date(expensesToAdd.date + 'T12:00:00Z').toISOString();

      const response = await fetch('/api/hand/add-expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: expensesToAdd.shopId,
          category: expensesToAdd.category,
          amount: expensesToAdd.amount,
          date: timestamp,
          description: expensesToAdd.description,
          autoRoute: expensesToAdd.autoRoute,
          overwrite: true
        })
      });

      const result = await response.json();
      if (result.success) {
        addLog('success', `Expense added: ${expensesToAdd.category} - $${expensesToAdd.amount.toFixed(2)}`);
        setExpensesToAdd({
          shopId: 'kipasa',
          category: 'misc',
          amount: 0,
          date: new Date().toISOString().split('T')[0],
          description: '',
          autoRoute: true
        });
        fetchDataStats();
      } else {
        addLog('error', result.message || 'Failed to add expense');
      }
    } catch (err: any) {
      addLog('error', 'Error adding expense: ' + err.message);
    }
  };

  // Backup to both systems
  const handleBackup = async () => {
    setBackupStatus('backing-up');
    try {
      const response = await fetch('/api/hand/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();
      if (result.success) {
        addLog('success', `Backup created: Supabase + Local JSON (${result.timestamp})`);
        setBackupStatus('idle');
      } else {
        addLog('error', result.message || 'Backup failed');
        setBackupStatus('idle');
      }
    } catch (err: any) {
      addLog('error', 'Backup error: ' + err.message);
      setBackupStatus('idle');
    }
  };

  // Restore from backup
  const handleRestore = async () => {
    if (!window.confirm('⚠️ This will RESTORE from backup. Continue?')) return;

    try {
      const response = await fetch('/api/hand/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();
      if (result.success) {
        addLog('success', `Restored from backup: ${result.source}`);
        fetchDataStats();
      } else {
        addLog('error', result.message || 'Restore failed');
      }
    } catch (err: any) {
      addLog('error', 'Restore error: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-900 via-gray-900 to-black p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-5xl font-black text-red-500 mb-2">⚔️ THE HAND</h1>
        <p className="text-gray-400">Owner Data Recovery & System Management</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Recovery Panel */}
        <div className="lg:col-span-2 space-y-8">
          {/* System Status */}
          <div className="bg-gray-900 border-2 border-red-500 rounded-lg p-6">
            <h2 className="text-xl font-bold text-red-500 mb-4">⚙️ System Status</h2>
            {dataStats ? (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-gray-800 p-3 rounded">
                  <p className="text-gray-400">Sales Records</p>
                  <p className="text-2xl font-bold text-green-400">{dataStats.salesCount}</p>
                </div>
                <div className="bg-gray-800 p-3 rounded">
                  <p className="text-gray-400">Expenses</p>
                  <p className="text-2xl font-bold text-yellow-400">{dataStats.expensesCount}</p>
                </div>
                <div className="bg-gray-800 p-3 rounded">
                  <p className="text-gray-400">Cash Entries</p>
                  <p className="text-2xl font-bold text-blue-400">{dataStats.cashEntries}</p>
                </div>
                <div className="bg-gray-800 p-3 rounded">
                  <p className="text-gray-400">Operations</p>
                  <p className="text-2xl font-bold text-purple-400">{dataStats.operationsCount}</p>
                </div>
              </div>
            ) : (
              <p className="text-gray-400">Loading...</p>
            )}
          </div>

          {/* Add Past Sales */}
          <div className="bg-gray-900 border-2 border-blue-500 rounded-lg p-6">
            <h2 className="text-xl font-bold text-blue-400 mb-4">💰 Record Past Sales</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={salesToAdd.shopId}
                  onChange={(e) => setSalesToAdd({ ...salesToAdd, shopId: e.target.value })}
                  className="bg-gray-800 text-white p-2 rounded border border-gray-600"
                >
                  {shops.map(shop => (
                    <option key={shop.id} value={shop.id}>{shop.name}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={salesToAdd.date}
                  onChange={(e) => setSalesToAdd({ ...salesToAdd, date: e.target.value })}
                  className="bg-gray-800 text-white p-2 rounded border border-gray-600"
                />
              </div>
              <input
                type="text"
                placeholder="Client Name"
                value={salesToAdd.clientName}
                onChange={(e) => setSalesToAdd({ ...salesToAdd, clientName: e.target.value })}
                className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600"
              />
              <input
                type="text"
                placeholder="Item Name"
                value={salesToAdd.itemName}
                onChange={(e) => setSalesToAdd({ ...salesToAdd, itemName: e.target.value })}
                className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600"
              />
              <div className="grid grid-cols-3 gap-3">
                <input
                  type="number"
                  placeholder="Quantity"
                  value={salesToAdd.quantity}
                  onChange={(e) => setSalesToAdd({ ...salesToAdd, quantity: parseInt(e.target.value) || 0 })}
                  className="bg-gray-800 text-white p-2 rounded border border-gray-600"
                />
                <input
                  type="number"
                  placeholder="Unit Price"
                  value={salesToAdd.unitPrice}
                  onChange={(e) => setSalesToAdd({ ...salesToAdd, unitPrice: parseFloat(e.target.value) || 0 })}
                  className="bg-gray-800 text-white p-2 rounded border border-gray-600"
                />
                <div className="bg-gray-800 p-2 rounded border border-gray-600 flex items-center justify-center">
                  <span className="text-green-400 font-bold">${((salesToAdd.quantity * salesToAdd.unitPrice) * 1.155).toFixed(2)}</span>
                </div>
              </div>
              <button
                onClick={handleAddSale}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded transition"
              >
                ➕ ADD SALE
              </button>
            </div>
          </div>

          {/* Add Past Expenses */}
          <div className="bg-gray-900 border-2 border-yellow-500 rounded-lg p-6">
            <h2 className="text-xl font-bold text-yellow-400 mb-4">📊 Record Past Expenses</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={expensesToAdd.shopId}
                  onChange={(e) => setExpensesToAdd({ ...expensesToAdd, shopId: e.target.value })}
                  className="bg-gray-800 text-white p-2 rounded border border-gray-600"
                >
                  {shops.map(shop => (
                    <option key={shop.id} value={shop.id}>{shop.name}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={expensesToAdd.date}
                  onChange={(e) => setExpensesToAdd({ ...expensesToAdd, date: e.target.value })}
                  className="bg-gray-800 text-white p-2 rounded border border-gray-600"
                />
              </div>
              <select
                value={expensesToAdd.category}
                onChange={(e) => setExpensesToAdd({ ...expensesToAdd, category: e.target.value })}
                className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600"
              >
                <option value="rent">Rent (→ Operations)</option>
                <option value="salaries">Salaries (→ Operations)</option>
                <option value="utilities">Utilities</option>
                <option value="perfume">Perfume (→ Invest)</option>
                <option value="groceries">Groceries</option>
                <option value="supplies">Supplies</option>
                <option value="tithe">Tithe</option>
                <option value="misc">Miscellaneous</option>
              </select>
              <input
                type="number"
                placeholder="Amount"
                value={expensesToAdd.amount}
                onChange={(e) => setExpensesToAdd({ ...expensesToAdd, amount: parseFloat(e.target.value) || 0 })}
                className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600"
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={expensesToAdd.description}
                onChange={(e) => setExpensesToAdd({ ...expensesToAdd, description: e.target.value })}
                className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600"
              />
              <label className="flex items-center text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={expensesToAdd.autoRoute}
                  onChange={(e) => setExpensesToAdd({ ...expensesToAdd, autoRoute: e.target.checked })}
                  className="mr-2"
                />
                Auto-post to Operations/Invest
              </label>
              <button
                onClick={handleAddExpense}
                className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 rounded transition"
              >
                ➕ ADD EXPENSE
              </button>
            </div>
          </div>

          {/* Backup & Restore */}
          <div className="bg-gray-900 border-2 border-green-500 rounded-lg p-6">
            <h2 className="text-xl font-bold text-green-400 mb-4">💾 Backup & Restore</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleBackup}
                disabled={backupStatus === 'backing-up'}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-bold py-2 rounded transition"
              >
                {backupStatus === 'backing-up' ? '⏳ Backing up...' : '💾 BACKUP NOW'}
              </button>
              <button
                onClick={handleRestore}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded transition"
              >
                🔄 RESTORE
              </button>
            </div>
            <p className="text-gray-400 text-sm mt-3">Backups to both Supabase & Local JSON</p>
          </div>
        </div>

        {/* Error Log & System Output */}
        <div className="bg-gray-900 border-2 border-red-500 rounded-lg p-6 h-fit sticky top-8">
          <h2 className="text-xl font-bold text-red-500 mb-4">🔴 System Log</h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {errorLogs.length === 0 ? (
              <p className="text-gray-500 text-sm">No logs yet...</p>
            ) : (
              errorLogs.map(log => (
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
                  <p className="font-bold">[{log.timestamp}] {log.level.toUpperCase()}</p>
                  <p>{log.message}</p>
                  {log.code && <p className="text-xs opacity-70">Code: {log.code}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
