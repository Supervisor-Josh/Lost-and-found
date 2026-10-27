import React, { useState, useEffect } from 'react';
import { Search, PlusCircle, ShieldAlert, CheckCircle, Package, User, MapPin, Calendar } from 'lucide-react';

const API_BASE = "http://localhost:8000";

export default function App() {
  const [activeTab, setActiveTab] = useState('browse');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // User state (Simplified for quick testing)
  const [user, setUser] = useState(null);
  const [regData, setRegData] = useState({ name: '', email: '', phone: '', password: '' });

  // New Item state
  const [itemData, setItemData] = useState({
    title: '',
    description: '',
    status: 'lost',
    category: 'Electronics',
    location: '',
    date_reported: new Date().toISOString().split('T')[0],
    image_url: ''
  });

  // Fetch items
  const fetchItems = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/items/`);
      const data = await res.json();
      setItems(data);
    } catch (err) {
      setError('Failed to connect to backend server. Is FastAPI running?');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  // Handle User Registration
  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/users/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regData)
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data);
        alert('User registered and logged in successfully!');
        setActiveTab('browse');
      } else {
        alert(data.detail || 'Registration failed');
      }
    } catch (err) {
      alert('Error connecting to server');
    }
  };

  // Handle Item Submission
  const handleReportItem = async (e) => {
    e.preventDefault();
    if (!user) {
      alert('Please register or set your user profile first!');
      setActiveTab('register');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/items/?user_id=${user.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemData)
      });
      const data = await res.json();
      if (res.ok) {
        alert('Item reported successfully!');
        setItemData({
          title: '', description: '', status: 'lost', category: 'Electronics', location: '', date_reported: new Date().toISOString().split('T')[0], image_url: ''
        });
        fetchItems();
        setActiveTab('browse');
      } else {
        alert(data.detail || 'Failed to report item');
      }
    } catch (err) {
      alert('Error connecting to server');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Navigation Bar */}
      <nav className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <Package className="h-8 w-8 text-indigo-400" />
          <span className="text-xl font-bold tracking-wider">Lost & Found Portal</span>
        </div>
        <div className="flex space-x-4">
          <button 
            onClick={() => setActiveTab('browse')}
            className={`px-4 py-2 rounded-lg font-medium transition ${activeTab === 'browse' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
            Browse Items
          </button>
          <button 
            onClick={() => setActiveTab('report')}
            className={`px-4 py-2 rounded-lg font-medium transition ${activeTab === 'report' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
            Report Item
          </button>
          <button 
            onClick={() => setActiveTab('register')}
            className={`px-4 py-2 rounded-lg font-medium transition flex items-center space-x-2 ${activeTab === 'register' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
            <User className="h-4 w-4" />
            <span>{user ? user.name : 'Account'}</span>
          </button>
        </div>
      </nav>

      {/* Main Content Container */}
      <main className="max-w-6xl mx-auto p-6">
        {error && <div className="bg-red-500/20 border border-red-500 text-red-300 p-4 rounded-lg mb-6">{error}</div>}

        {/* TAB 1: BROWSE ITEMS */}
        {activeTab === 'browse' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold">Active Reports</h2>
              <button onClick={fetchItems} className="text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2 rounded-lg">Refresh</button>
            </div>

            {loading ? (
              <p className="text-center text-slate-400 py-10">Loading items...</p>
            ) : items.length === 0 ? (
              <div className="text-center py-16 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <Package className="h-12 w-12 text-slate-500 mx-auto mb-3" />
                <p className="text-slate-400">No lost or found items reported yet.</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {items.map((item) => (
                  <div key={item.id} className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col justify-between shadow-lg">
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${item.status === 'lost' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30'}`}>
                          {item.status}
                        </span>
                        <span className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded">{item.category}</span>
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                      <p className="text-slate-300 text-sm mb-4 line-clamp-3">{item.description}</p>
                      
                      <div className="space-y-1 text-xs text-slate-400 mb-4">
                        <div className="flex items-center space-x-2"><MapPin className="h-3.5 w-3.5 text-indigo-400" /><span>{item.location}</span></div>
                        <div className="flex items-center space-x-2"><Calendar className="h-3.5 w-3.5 text-indigo-400" /><span>{item.date_reported}</span></div>
                      </div>
                    </div>

                    <div className="border-t border-slate-700 pt-3 flex justify-between items-center text-xs text-slate-400">
                      <span>Reported by: <strong className="text-slate-200">{item.owner?.name}</strong></span>
                      <span className="text-indigo-400 font-medium">{item.owner?.phone}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: REPORT ITEM */}
        {activeTab === 'report' && (
          <div className="max-w-2xl mx-auto bg-slate-800 border border-slate-700 rounded-xl p-8 shadow-xl">
            <h2 className="text-2xl font-semibold mb-6 flex items-center space-x-2">
              <PlusCircle className="text-indigo-400" />
              <span>Report Lost or Found Item</span>
            </h2>

            {!user && (
              <div className="bg-amber-500/20 border border-amber-500 text-amber-300 p-4 rounded-lg mb-6 text-sm">
                ⚠️ You must create an account / set your profile before reporting an item. Click the <strong>Account</strong> tab above.
              </div>
            )}

            <form onSubmit={handleReportItem} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Item Title</label>
                <input type="text" required value={itemData.title} onChange={(e) => setItemData({...itemData, title: e.target.value})} placeholder="e.g. Black Dell Laptop Charger" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select value={itemData.status} onChange={(e) => setItemData({...itemData, status: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500">
                    <option value="lost">Lost</option>
                    <option value="found">Found</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <input type="text" required value={itemData.category} onChange={(e) => setItemData({...itemData, category: e.target.value})} placeholder="e.g. Electronics, Keys" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Location</label>
                  <input type="text" required value={itemData.location} onChange={(e) => setItemData({...itemData, location: e.target.value})} placeholder="e.g. Library Block A" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Date Reported</label>
                  <input type="date" required value={itemData.date_reported} onChange={(e) => setItemData({...itemData, date_reported: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Detailed Description</label>
                <textarea rows="4" required value={itemData.description} onChange={(e) => setItemData({...itemData, description: e.target.value})} placeholder="Provide identifying marks, serial numbers, colors..." className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"></textarea>
              </div>

              <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 rounded-lg transition">Submit Report</button>
            </form>
          </div>
        )}

        {/* TAB 3: USER REGISTRATION */}
        {activeTab === 'register' && (
          <div className="max-w-md mx-auto bg-slate-800 border border-slate-700 rounded-xl p-8 shadow-xl">
            <h2 className="text-2xl font-semibold mb-6 flex items-center space-x-2">
              <User className="text-indigo-400" />
              <span>User Account</span>
            </h2>

            {user ? (
              <div className="space-y-4 text-center">
                <div className="bg-green-500/20 border border-green-500 text-green-300 p-4 rounded-lg">
                  You are logged in as <strong>{user.name}</strong> ({user.email})
                </div>
                <button onClick={() => setUser(null)} className="w-full bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 py-2 rounded-lg transition">Log Out</button>
              </div>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Full Name</label>
                  <input type="text" required value={regData.name} onChange={(e) => setRegData({...regData, name: e.target.value})} placeholder="John Doe" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email Address</label>
                  <input type="email" required value={regData.email} onChange={(e) => setRegData({...regData, email: e.target.value})} placeholder="john@example.com" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Phone Number</label>
                  <input type="text" required value={regData.phone} onChange={(e) => setRegData({...regData, phone: e.target.value})} placeholder="0712345678" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Password</label>
                  <input type="password" required value={regData.password} onChange={(e) => setRegData({...regData, password: e.target.value})} placeholder="••••••••" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 rounded-lg transition">Register & Continue</button>
              </form>
            )}
          </div>
        )}
      </main>
    </div>
  );
}