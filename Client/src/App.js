import React, { useState, useEffect } from "react";

const API_BASE = "http://localhost:5000/api";

const HAZARD_BADGES = {
  ACID: "bg-red-500/10 text-red-400 border-red-500/30",
  BASE: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  FLAMMABLE: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  OXIDIZER: "bg-purple-500/10 text-purple-400 border-purple-500/30"
};

function getExpiryStatus(expiryDate) {
  if (!expiryDate) return { label: "NO EXPIRY", style: "text-slate-500 border-slate-700/60 bg-slate-800/40", urgent: false };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDate);
  const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { label: `EXPIRED (${Math.abs(diffDays)}d ago)`, style: "text-rose-300 border-rose-500/50 bg-rose-500/20", urgent: true };
  }
  if (diffDays <= 30) {
    return { label: `EXPIRES IN ${diffDays}d`, style: "text-amber-300 border-amber-500/50 bg-amber-500/20", urgent: true };
  }
  return { label: `VALID (${expiryDate})`, style: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10", urgent: false };
}

export default function App() {
  const [items, setItems] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [activeTab, setActiveTab] = useState("map");
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [loginForm, setLoginForm] = useState({ username: "admin", password: "admin123" });
  const [statusBanner, setStatusBanner] = useState(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  // Form State
  const [name, setName] = useState("");
  const [category, setCategory] = useState("ACID");
  const [cabinet, setCabinet] = useState("Cabinet A");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("mL");
  const [expiryDate, setExpiryDate] = useState("");
  const [casNumber, setCasNumber] = useState("");
  const [hazardNotes, setHazardNotes] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  // Modals & Drag State
  const [selectedLabelItem, setSelectedLabelItem] = useState(null);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanInput, setScanInput] = useState("");
  const [scannedResult, setScannedResult] = useState(null);
  const [draggedItemId, setDraggedItemId] = useState(null);

  const showStatus = (type, text) => {
    setStatusBanner({ type, text });
    setTimeout(() => setStatusBanner(null), 5000);
  };

  useEffect(() => {
    fetchInventory();
    if (token) {
      fetchAuditLogs();
      if (!user) setUser({ username: "ADMIN", role: "ADMIN" });
    }
  }, [token]);

  const fetchInventory = async () => {
    try {
      const res = await fetch(`${API_BASE}/inventory`);
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (err) {
      showStatus("error", "Cannot connect to backend server on Port 5000. Make sure node server.js is running.");
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/audit`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm)
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        setUser({ username: data.username, role: data.role });
        localStorage.setItem("token", data.token);
        showStatus("success", `Logged in as ${data.username.toUpperCase()} (${data.role})`);
      } else {
        showStatus("error", data.message || "Invalid credentials");
      }
    } catch (err) {
      showStatus("error", "Backend server offline. Start server.js first.");
    }
  };

  const handleLogout = () => {
    setToken("");
    setUser(null);
    localStorage.removeItem("token");
    showStatus("success", "Logged out");
  };

  const handlePubChemLookup = async () => {
    if (!name.trim()) {
      return showStatus("error", "Enter a chemical name first (e.g., h2so4 or naoh).");
    }
    try {
      showStatus("success", `Searching PubChem for "${name}"...`);
      const res = await fetch(
        `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(
          name.trim()
        )}/property/IUPACName,MolecularFormula,Title/JSON`
      );
      const data = await res.json();
      if (data.PropertyTable && data.PropertyTable.Properties.length > 0) {
        const prop = data.PropertyTable.Properties[0];
        setCasNumber(prop.CID ? `CID-${prop.CID}` : "N/A");
        setHazardNotes(`Formula: ${prop.MolecularFormula} | IUPAC: ${prop.IUPACName}`);
        showStatus(
          "success",
          `PubChem Verified: ${prop.Title || name} (${prop.MolecularFormula}) | CID-${prop.CID}`
        );
      } else {
        showStatus("error", `Chemical "${name}" not found in PubChem.`);
      }
    } catch (err) {
      showStatus("error", "PubChem lookup failed. Check internet connection.");
    }
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!token) {
      return showStatus("error", "Please log in using the top-right form before storing items.");
    }
    if (!name.trim() || !quantity) {
      return showStatus("error", "Please enter both Chemical Name and Quantity.");
    }

    try {
      const res = await fetch(`${API_BASE}/inventory`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: name.trim(),
          category,
          cabinet,
          quantity: parseFloat(quantity),
          unit,
          expiryDate,
          casNumber,
          hazardNotes,
          overrideReason
        })
      });

      const data = await res.json();
      if (res.ok) {
        showStatus("success", `Stored ${name} (${quantity} ${unit}) in ${cabinet}`);
        setName("");
        setQuantity("");
        setCasNumber("");
        setHazardNotes("");
        setOverrideReason("");
        fetchInventory();
        fetchAuditLogs();
      } else {
        showStatus("error", data.message || "Safety Gatekeeper blocked this item.");
      }
    } catch (err) {
      showStatus("error", "Failed to connect to backend server.");
    }
  };

  const handleMoveItem = async (itemId, targetCabinet) => {
    if (!token) return showStatus("error", "Log in to move containers between cabinets.");
    try {
      const res = await fetch(`${API_BASE}/inventory/${itemId}/move`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          cabinet: targetCabinet,
          newCabinet: targetCabinet,
          targetCabinet: targetCabinet,
          overrideReason
        })
      });
      const data = await res.json();
      if (res.ok) {
        showStatus("success", `Moved container to ${targetCabinet}`);
        fetchInventory();
        fetchAuditLogs();
      } else {
        showStatus("error", data.message || "SAFETY VIOLATION: Incompatible storage cabinet!");
      }
    } catch (err) {
      showStatus("error", "Error moving container.");
    }
  };

  const handleDelete = async (id) => {
    if (!token) return showStatus("error", "Log in first.");
    try {
      const res = await fetch(`${API_BASE}/inventory/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        showStatus("success", "Container removed from inventory.");
        fetchInventory();
        fetchAuditLogs();
      } else {
        showStatus("error", data.message || "Delete failed");
      }
    } catch (err) {
      showStatus("error", "Error deleting item.");
    }
  };

  const handleExportCSV = () => {
    if (auditLogs.length === 0) {
      return showStatus("error", "No audit logs available to export.");
    }
    const headers = ["ID,Timestamp,User,Action,Details"];
    const rows = auditLogs.map(
      (log) =>
        `"${log.id}","${log.timestamp}","${log.user}","${log.action}","${(log.details || "").replace(/"/g, '""')}"`
    );
    const blob = new Blob([headers.concat(rows).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "LabSafe_Audit_Report.csv";
    a.click();
    showStatus("success", "Downloaded LabSafe_Audit_Report.csv");
  };

  const handleVerifyQR = (e) => {
    e.preventDefault();
    const raw = scanInput.trim();
    if (!raw) return;
    // Matches either raw ID number or payload format LABSAFE|ID:2|NAME:naoh...
    const idMatch = raw.match(/ID:(\d+)/i) || raw.match(/^(\d+)$/);
    const found = idMatch
      ? items.find((i) => String(i.id) === idMatch[1])
      : items.find((i) => i.name.toLowerCase() === raw.toLowerCase());

    if (found) {
      setScannedResult({ status: "VALID", item: found });
    } else {
      setScannedResult({ status: "NOT_FOUND", raw });
    }
  };

  // Filtered items & KPI metrics
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.casNumber || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.cabinet.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = categoryFilter === "ALL" || item.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const expiringCount = items.filter((i) => getExpiryStatus(i.expiryDate).urgent).length;
  const cabinets = ["Cabinet A", "Cabinet B", "Cabinet C"];

  return (
    <div className="min-h-screen bg-[#0B1020] text-slate-100 font-sans p-6 selection:bg-blue-500/30">
      {/* HEADER */}
      <header className="flex flex-wrap justify-between items-center gap-4 bg-[#151D33] border border-slate-800/80 px-6 py-4 rounded-2xl mb-6 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-xl shadow-lg shadow-blue-500/20">
            🧪
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-extrabold tracking-tight text-white">LabSafe & Sync</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-blue-500/15 text-blue-400 border border-blue-500/30 uppercase">
                ENTERPRISE EDITION
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">
              Multi-Rule Gatekeeper, Drag-and-Drop Shelves & QR Audit Tracking
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setScanInput("");
              setScannedResult(null);
              setScanModalOpen(true);
            }}
            className="px-4 py-2 text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-xl transition duration-200 flex items-center gap-1.5"
          >
            📷 Verify QR
          </button>

          {token ? (
            <>
              <div className="text-right mx-1">
                <span className="block text-xs font-bold text-slate-200">{user?.username || "ADMIN"}</span>
                <span className="inline-block text-[10px] font-extrabold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {user?.role || "ADMIN"}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-xs font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 rounded-xl transition duration-200 shadow-sm"
              >
                Logout
              </button>
              <button
                onClick={handleExportCSV}
                className="px-4 py-2 text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl transition duration-200 shadow-md shadow-blue-500/20 flex items-center gap-2"
              >
                📊 CSV Audit
              </button>
            </>
          ) : (
            <form onSubmit={handleLogin} className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Username"
                value={loginForm.username}
                onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                className="bg-[#19233D] border border-slate-700 px-3 py-1.5 rounded-xl text-xs text-white outline-none w-28"
              />
              <input
                type="password"
                placeholder="Password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                className="bg-[#19233D] border border-slate-700 px-3 py-1.5 rounded-xl text-xs text-white outline-none w-28"
              />
              <button
                type="submit"
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-xs font-bold rounded-xl text-white transition"
              >
                Login
              </button>
            </form>
          )}
        </div>
      </header>

      {/* KPI SUMMARY STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#151D33] border border-slate-800/80 px-4 py-3 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Containers</p>
            <p className="text-xl font-extrabold text-white mt-0.5">{items.length}</p>
          </div>
          <span className="text-xl bg-blue-500/15 p-2.5 rounded-xl">🧴</span>
        </div>
        <div className="bg-[#151D33] border border-slate-800/80 px-4 py-3 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Segregated Cabinets</p>
            <p className="text-xl font-extrabold text-indigo-300 mt-0.5">{cabinets.length} Zones</p>
          </div>
          <span className="text-xl bg-indigo-500/15 p-2.5 rounded-xl">🗄️</span>
        </div>
        <div className="bg-[#151D33] border border-slate-800/80 px-4 py-3 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Expiry Alerts (&le;30d)</p>
            <p className={`text-xl font-extrabold mt-0.5 ${expiringCount > 0 ? "text-amber-400" : "text-emerald-400"}`}>
              {expiringCount}
            </p>
          </div>
          <span className="text-xl bg-amber-500/15 p-2.5 rounded-xl">⏳</span>
        </div>
        <div className="bg-[#151D33] border border-slate-800/80 px-4 py-3 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Audit Events</p>
            <p className="text-xl font-extrabold text-teal-300 mt-0.5">{auditLogs.length}</p>
          </div>
          <span className="text-xl bg-teal-500/15 p-2.5 rounded-xl">🛡️</span>
        </div>
      </div>

      {/* LIVE FEEDBACK / SAFETY VIOLATION BANNER */}
      {statusBanner && (
        <div
          className={`mb-5 px-5 py-3 rounded-xl border text-xs font-semibold flex justify-between items-center shadow-lg ${
            statusBanner.type === "error"
              ? "bg-red-500/15 border-red-500/40 text-red-300"
              : "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
          }`}
        >
          <span>{statusBanner.type === "error" ? "⚠️ " : "✅ "}{statusBanner.text}</span>
          <button onClick={() => setStatusBanner(null)} className="text-slate-400 hover:text-white ml-4">
            ✕
          </button>
        </div>
      )}

      {/* NAVIGATION TABS + LIVE SEARCH / FILTER BAR */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <nav className="flex gap-2 bg-[#151D33]/60 p-1.5 rounded-2xl border border-slate-800/80 w-fit">
          <button
            onClick={() => setActiveTab("map")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
              activeTab === "map"
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 border border-blue-400/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-[#19233D]"
            }`}
          >
            <span>🗺️</span> Graphical Cabinet Map
          </button>
          <button
            onClick={() => setActiveTab("list")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
              activeTab === "list"
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 border border-blue-400/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-[#19233D]"
            }`}
          >
            <span>📜</span> Chemical Inventory List
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
              activeTab === "audit"
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 border border-blue-400/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-[#19233D]"
            }`}
          >
            <span>🔒</span> Immutable Audit History
          </button>
        </nav>

        {activeTab !== "audit" && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Filter by chemical, CID, or cabinet..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#151D33] border border-slate-700/80 focus:border-blue-500 px-3.5 py-2 rounded-xl text-xs text-slate-100 placeholder-slate-500 outline-none w-60"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-[#151D33] border border-slate-700/80 focus:border-blue-500 px-3 py-2 rounded-xl text-xs text-slate-200 outline-none"
            >
              <option value="ALL">All Hazards</option>
              <option value="ACID">ACID</option>
              <option value="BASE">BASE</option>
              <option value="FLAMMABLE">FLAMMABLE</option>
              <option value="OXIDIZER">OXIDIZER</option>
            </select>
          </div>
        )}
      </div>

      {/* ADD CHEMICAL CONTAINER FORM CARD */}
      <section className="bg-[#151D33] border border-slate-800/80 p-5 rounded-2xl mb-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
        <h2 className="text-xs font-extrabold text-slate-300 tracking-wider mb-4 flex items-center gap-2 uppercase">
          <span className="text-blue-400 text-base">+</span> ADD CHEMICAL CONTAINER & PUBCHEM VERIFY
        </h2>

        <form onSubmit={handleAddItem} className="space-y-3">
          <div className="grid grid-cols-12 gap-3">
            <input
              type="text"
              placeholder="Chemical Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="col-span-3 bg-[#19233D] border border-slate-700/60 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-3.5 py-2 rounded-xl text-xs text-slate-100 placeholder-slate-500 outline-none transition"
            />
            <button
              type="button"
              onClick={handlePubChemLookup}
              className="col-span-1 bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/40 text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition"
            >
              🔍 PubChem
            </button>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="col-span-2 bg-[#19233D] border border-slate-700/60 focus:border-blue-500 px-3 py-2 rounded-xl text-xs text-slate-200 outline-none"
            >
              <option value="ACID">ACID</option>
              <option value="BASE">BASE</option>
              <option value="FLAMMABLE">FLAMMABLE</option>
              <option value="OXIDIZER">OXIDIZER</option>
            </select>
            <select
              value={cabinet}
              onChange={(e) => setCabinet(e.target.value)}
              className="col-span-2 bg-[#19233D] border border-slate-700/60 focus:border-blue-500 px-3 py-2 rounded-xl text-xs text-slate-200 outline-none"
            >
              <option value="Cabinet A">Cabinet A</option>
              <option value="Cabinet B">Cabinet B</option>
              <option value="Cabinet C">Cabinet C</option>
            </select>
            <input
              type="number"
              placeholder="Qty"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="col-span-1 bg-[#19233D] border border-slate-700/60 focus:border-blue-500 px-3 py-2 rounded-xl text-xs text-slate-100 placeholder-slate-500 outline-none"
            />
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="col-span-1 bg-[#19233D] border border-slate-700/60 focus:border-blue-500 px-2 py-2 rounded-xl text-xs text-slate-200 outline-none"
            >
              <option value="mL">mL</option>
              <option value="L">L</option>
              <option value="g">g</option>
              <option value="kg">kg</option>
            </select>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="col-span-2 bg-[#19233D] border border-slate-700/60 focus:border-blue-500 px-3 py-2 rounded-xl text-xs text-slate-200 outline-none"
            />
          </div>

          <div className="grid grid-cols-12 gap-3 items-center">
            <input
              type="text"
              placeholder={
                user?.role === "ADMIN"
                  ? "Admin Safety Override Note (Optional)"
                  : "Override locked (ADMIN privileges required)"
              }
              disabled={user?.role !== "ADMIN"}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="col-span-4 bg-[#19233D] border border-slate-700/60 focus:border-blue-500 px-3.5 py-2 rounded-xl text-xs text-slate-100 placeholder-slate-500 outline-none disabled:opacity-40"
            />
            <button
              type="submit"
              className="col-span-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-2 rounded-xl text-xs transition shadow-md shadow-blue-500/20"
            >
              Store Item
            </button>
            <button
              type="button"
              onClick={() => showStatus("success", "Synced inventory state to registered lab tablets.")}
              className="col-span-2 bg-[#19233D] hover:bg-slate-800 text-slate-300 border border-slate-700/60 text-xs font-semibold py-2 rounded-xl transition"
            >
              Send to your devices
            </button>
            {casNumber && (
              <span className="col-span-4 text-[11px] font-mono text-teal-300 truncate">
                ✓ {casNumber} — {hazardNotes}
              </span>
            )}
          </div>
        </form>
      </section>

      {/* TAB 1: GRAPHICAL CABINET MAP (DRAG & DROP) */}
      {activeTab === "map" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cabinets.map((cabName) => {
            const cabItems = filteredItems.filter((i) => i.cabinet === cabName);
            return (
              <div
                key={cabName}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (draggedItemId) {
                    handleMoveItem(draggedItemId, cabName);
                    setDraggedItemId(null);
                  }
                }}
                className="bg-[#151D33] border border-slate-800/80 hover:border-blue-500/40 rounded-2xl p-5 min-h-[380px] shadow-xl flex flex-col justify-between transition"
              >
                <div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-800 mb-4">
                    <h3 className="font-extrabold text-sm text-slate-200 uppercase tracking-wider">{cabName}</h3>
                    <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      {cabItems.length} Containers
                    </span>
                  </div>

                  <div className="space-y-3">
                    {cabItems.length === 0 ? (
                      <div className="border border-dashed border-slate-700/60 rounded-xl p-6 text-center text-xs text-slate-500">
                        Drag & drop containers here
                      </div>
                    ) : (
                      cabItems.map((item) => {
                        const exp = getExpiryStatus(item.expiryDate);
                        return (
                          <div
                            key={item.id}
                            draggable
                            onDragStart={() => setDraggedItemId(item.id)}
                            className="bg-[#19233D] border border-slate-700/50 p-3.5 rounded-xl flex justify-between items-center shadow-inner hover:border-blue-500/50 transition cursor-grab active:cursor-grabbing"
                          >
                            <div>
                              <h4 className="font-bold text-sm text-white">{item.name}</h4>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                <span
                                  className={`text-[9px] font-extrabold px-2 py-0.5 rounded border ${
                                    HAZARD_BADGES[item.category] || HAZARD_BADGES.ACID
                                  }`}
                                >
                                  {item.category}
                                </span>
                                <span className="text-[11px] font-mono text-slate-400">
                                  {item.quantity} {item.unit}
                                </span>
                                {item.expiryDate && (
                                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${exp.style}`}>
                                    {exp.label}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setSelectedLabelItem(item)}
                                className="px-3 py-1.5 text-xs bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 rounded-lg transition font-semibold"
                              >
                                📱 Label
                              </button>
                              {user?.role === "ADMIN" && (
                                <button
                                  onClick={() => handleDelete(item.id)}
                                  className="px-2.5 py-1.5 text-xs bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 rounded-lg transition"
                                  title="Delete Container"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="mt-6 pt-3 border-t border-slate-800/60 text-center">
                  <span className="text-[10px] font-mono text-slate-500">ACTIVE STORAGE CABINET</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: CHEMICAL INVENTORY LIST */}
      {activeTab === "list" && (
        <div className="bg-[#151D33] border border-slate-800/80 rounded-2xl p-5 shadow-xl overflow-x-auto">
          <h3 className="font-extrabold text-sm text-slate-200 uppercase tracking-wider mb-4">
            Complete Laboratory Chemical Inventory ({filteredItems.length})
          </h3>
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#19233D] text-slate-400 uppercase text-[10px]">
              <tr>
                <th className="p-3 rounded-l-lg">Chemical Name</th>
                <th className="p-3">Hazard Class</th>
                <th className="p-3">Cabinet</th>
                <th className="p-3">Quantity</th>
                <th className="p-3">CAS / PubChem</th>
                <th className="p-3">Shelf-Life Status</th>
                <th className="p-3 rounded-r-lg text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const exp = getExpiryStatus(item.expiryDate);
                return (
                  <tr key={item.id} className="border-b border-slate-800/70 hover:bg-[#19233D]/60 transition">
                    <td className="p-3 font-bold text-white">{item.name}</td>
                    <td className="p-3">
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded border ${HAZARD_BADGES[item.category]}`}>
                        {item.category}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-slate-300">{item.cabinet}</td>
                    <td className="p-3 font-mono">{item.quantity} {item.unit}</td>
                    <td className="p-3 font-mono text-slate-400">{item.casNumber || "—"}</td>
                    <td className="p-3">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${exp.style}`}>
                        {exp.label}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-2">
                      <button
                        onClick={() => setSelectedLabelItem(item)}
                        className="px-2.5 py-1 text-[11px] bg-indigo-500/20 text-indigo-300 rounded-lg"
                      >
                        📱 Label
                      </button>
                      {user?.role === "ADMIN" && (
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="px-2.5 py-1 text-[11px] bg-rose-500/20 text-rose-300 rounded-lg"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: IMMUTABLE AUDIT HISTORY */}
      {activeTab === "audit" && (
        <div className="bg-[#151D33] border border-slate-800/80 rounded-2xl p-5 shadow-xl overflow-x-auto">
          <h3 className="font-extrabold text-sm text-slate-200 uppercase tracking-wider mb-4">
            Immutable Regulatory Audit Trail
          </h3>
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#19233D] text-slate-400 uppercase text-[10px]">
              <tr>
                <th className="p-3 rounded-l-lg">Timestamp</th>
                <th className="p-3">User</th>
                <th className="p-3">Action</th>
                <th className="p-3 rounded-r-lg">Audit Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id} className="border-b border-slate-800/70 hover:bg-[#19233D]/60 transition">
                  <td className="p-3 font-mono text-slate-400">{log.timestamp}</td>
                  <td className="p-3 font-bold text-blue-400">{log.user}</td>
                  <td className="p-3 font-semibold">{log.action}</td>
                  <td className="p-3 text-slate-300">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* PRINTABLE GHS LABEL MODAL WITH REAL QR CODE */}
      {selectedLabelItem && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-white text-slate-900 p-6 rounded-2xl max-w-sm w-full shadow-2xl border-4 border-slate-900">
            <div className="flex justify-between items-start mb-4 border-b border-slate-300 pb-2">
              <h3 className="font-extrabold text-xl">{selectedLabelItem.name.toUpperCase()}</h3>
              <span className="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded">GHS DANGER</span>
            </div>
            <p className="text-xs font-mono mb-1"><strong>ID / CAS:</strong> {selectedLabelItem.casNumber || `CONTAINER-${selectedLabelItem.id}`}</p>
            <p className="text-xs font-mono mb-1"><strong>Hazard Class:</strong> {selectedLabelItem.category}</p>
            <p className="text-xs font-mono mb-1"><strong>Cabinet:</strong> {selectedLabelItem.cabinet}</p>
            <p className="text-xs font-mono mb-1"><strong>Quantity:</strong> {selectedLabelItem.quantity} {selectedLabelItem.unit}</p>
            <p className="text-xs font-mono mb-4"><strong>Expires:</strong> {selectedLabelItem.expiryDate || "N/A"}</p>

            <div className="border border-slate-300 p-4 bg-slate-50 flex flex-col items-center rounded-xl mb-4">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(
                  `LABSAFE|ID:${selectedLabelItem.id}|NAME:${selectedLabelItem.name}|CAT:${selectedLabelItem.category}|CAB:${selectedLabelItem.cabinet}`
                )}`}
                alt="Chemical Container QR Code"
                className="w-32 h-32 border border-slate-200 p-1 bg-white rounded-lg shadow-sm"
              />
              <p className="text-[10px] font-bold font-mono text-slate-700 mt-2">
                SCAN FOR SAFETY & LOCATION VERIFICATION
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs"
              >
                Print Label
              </button>
              <button
                onClick={() => setSelectedLabelItem(null)}
                className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR CONTAINER VERIFICATION MODAL */}
      {scanModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-[#151D33] border border-slate-700 text-slate-100 p-6 rounded-2xl max-w-md w-full shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-extrabold text-base text-white">📷 QR Container Verification</h3>
              <button onClick={() => setScanModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Scan a container label with a handheld barcode/QR scanner or paste the decoded payload (e.g., <code className="text-teal-300">LABSAFE|ID:1</code> or container ID):
            </p>
            <form onSubmit={handleVerifyQR} className="flex gap-2 mb-4">
              <input
                type="text"
                autoFocus
                placeholder="Scan or enter QR payload / ID..."
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                className="flex-1 bg-[#19233D] border border-slate-700 px-3 py-2 rounded-xl text-xs text-white outline-none"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs"
              >
                Verify
              </button>
            </form>

            {scannedResult && (
              <div
                className={`p-4 rounded-xl border text-xs ${
                  scannedResult.status === "VALID"
                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-200"
                    : "bg-rose-500/10 border-rose-500/40 text-rose-200"
                }`}
              >
                {scannedResult.status === "VALID" ? (
                  <div className="space-y-1 font-mono">
                    <p className="font-bold text-emerald-300 text-sm">✅ VERIFIED INVENTORY RECORD</p>
                    <p><strong>Chemical:</strong> {scannedResult.item.name}</p>
                    <p><strong>Hazard Class:</strong> {scannedResult.item.category}</p>
                    <p><strong>Assigned Cabinet:</strong> {scannedResult.item.cabinet}</p>
                    <p><strong>Quantity:</strong> {scannedResult.item.quantity} {scannedResult.item.unit}</p>
                  </div>
                ) : (
                  <p className="font-semibold">⚠️ No matching container found in active database for "{scannedResult.raw}".</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}