import React, { useState, useEffect } from 'react';
import {
  Plus, Trash2, Edit2, Save, X, Server, Layout,
  Settings as SettingsIcon, Shield, Database, Globe,
  Activity, CheckCircle2, AlertCircle
} from 'lucide-react';
import { api } from '../context/AuthContext';

function Settings() {
  const [lines, setLines] = useState([]);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);

  // States cho Form
  const [newLine, setNewLine] = useState({ name: '', description: '' });
  const [newMachine, setNewMachine] = useState({ name: '', ip_address: '', line_id: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      console.log("Settings: Fetching lines and machines...");
      const [lRes, mRes] = await Promise.all([
        api.get('/api/lines'),
        api.get('/api/machines')
      ]);
      setLines(lRes.data);
      setMachines(mRes.data);
      setLoading(false);
    } catch (err) {
      console.error("Fetch error:", err);
      if (err.response?.status !== 401) setLoading(false);
    }
  };

  // --- CRUD Handlers ---
  const handleAddLine = async (e) => {
    e.preventDefault();
    try {
      console.log("Settings: Adding new line...");
      await api.post('/api/lines', newLine);
      setNewLine({ name: '', description: '' });
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.detail || "Lỗi không xác định khi thêm Line";
      alert(msg);
    }
  };

  const handleDeleteLine = async (id) => {
    if (!window.confirm("Bạn có chắc muốn xóa Line này?")) return;
    try {
      console.log(`Settings: Deleting line ${id}`);
      await api.delete(`/api/lines/${id}`);
      fetchData();
    } catch (err) { alert("Không thể xóa Line (vẫn còn máy quét liên kết)"); }
  };

  const handleAddMachine = async (e) => {
    e.preventDefault();
    if (!newMachine.line_id) return alert("Vui lòng chọn Line");
    try {
      console.log("Settings: Adding new machine...");
      await api.post('/api/machines', newMachine);
      setNewMachine({ name: '', ip_address: '', line_id: '' });
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.detail || "Lỗi không xác định khi thêm Máy";
      alert(msg);
    }
  };

  const handleDeleteMachine = async (id) => {
    if (!window.confirm("Bạn có chắc muốn xóa máy này?")) return;
    try {
      console.log(`Settings: Deleting machine ${id}`);
      await api.delete(`/api/machines/${id}`);
      fetchData();
    } catch (err) { alert("Lỗi khi xóa máy"); }
  };

  if (loading) return <div className="loading">Đang tải cấu hình hệ thống...</div>;

  return (
    <div className="fade-in">
      <header style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <div style={{ background: 'var(--accent-blue)', padding: '10px', borderRadius: '12px', display: 'flex' }}>
            <SettingsIcon color="white" size={24} />
          </div>
          <h1>Cấu hình Hệ thống</h1>
        </div>
        <p style={{ color: 'var(--text-secondary)' }}>Quản lý hạ tầng mạng lưới máy quét và dây chuyền sản xuất</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '2rem' }}>

        {/* LEFT COLUMN: LINES & SYSTEM */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* QUẢN LÝ LINES */}
          <div className="data-table-container" style={{ padding: '1.5rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
              <Layout size={20} color="#3b82f6" /> Quản lý Dây chuyền (Line)
            </h3>

            <form onSubmit={handleAddLine} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '1.5rem' }}>
              <input
                className="btn-secondary" // Re-using style classes but applying to input
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', padding: '12px', color: 'white' }}
                type="text" placeholder="Tên Line (ví dụ: Line A)" required
                value={newLine.name} onChange={e => setNewLine({ ...newLine, name: e.target.value })}
              />
              <textarea
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', padding: '12px', color: 'white', borderRadius: '8px', minHeight: '60px', fontFamily: 'inherit' }}
                placeholder="Mô tả dây chuyền..."
                value={newLine.description} onChange={e => setNewLine({ ...newLine, description: e.target.value })}
              />
              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                <Plus size={18} /> Thêm Dây chuyền mới
              </button>
            </form>

            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 1 }}>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--glass-border)' }}>
                    <th style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>TÊN LINE</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(l => (
                    <tr key={l.id} className="table-row-hover" style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontWeight: '600' }}>{l.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>ID: {l.id}</div>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleDeleteLine(l.id)}
                          style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#ef4444', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {lines.length === 0 && <tr><td colSpan="2" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>Chưa có dây chuyền nào</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* SYSTEM INFO CARD */}
          <div className="data-table-container" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.05) 100%)' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem' }}>
              <Shield size={20} color="#3b82f6" /> Thông tin Hệ thống
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Phiên bản Server</span>
                <span style={{ fontWeight: '600' }}>v1.2.0-stable</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Địa chỉ Database</span>
                <span style={{ fontWeight: '600', color: '#10b981' }}>Connected (10.7.12.236)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Dung lượng Storage</span>
                <span style={{ fontWeight: '600' }}>1.2 TB / 10 TB</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: MACHINES */}
        <div className="data-table-container" style={{ padding: '1.5rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
            <Server size={20} color="#3b82f6" /> Quản lý Máy quét (Devices)
          </h3>

          <form onSubmit={handleAddMachine} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '12px', marginBottom: '2rem', alignItems: 'flex-start' }}>
            <div className="input-group">
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Tên Máy</label>
              <input
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', padding: '10px', color: 'white', width: '100%', borderRadius: '8px' }}
                type="text" placeholder="Xray-01" required
                value={newMachine.name} onChange={e => setNewMachine({ ...newMachine, name: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Địa chỉ IP</label>
              <input
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', padding: '10px', color: 'white', width: '100%', borderRadius: '8px' }}
                type="text" placeholder="192.168.1.100" required
                value={newMachine.ip_address} onChange={e => setNewMachine({ ...newMachine, ip_address: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Thuộc Line</label>
              <select
                required value={newMachine.line_id}
                style={{ background: 'rgba(30, 41, 59, 1)', border: '1px solid var(--glass-border)', padding: '10px', color: 'white', width: '100%', borderRadius: '8px' }}
                onChange={e => setNewMachine({ ...newMachine, line_id: parseInt(e.target.value) })}
              >
                <option value="">Chọn Line...</option>
                {lines.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginTop: '22px' }}>
              <Plus size={18} />
            </button>
          </form>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--glass-border)' }}>
                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>THIẾT BỊ</th>
                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>ĐỊA CHỈ IP</th>
                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>TRẠNG THÁI</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>THAO TÁC</th>
              </tr>
            </thead>
            <tbody>
              {machines.map(m => (
                <tr key={m.id} className="table-row-hover" style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                  <td style={{ padding: '16px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '8px', borderRadius: '8px' }}>
                        <Server size={16} color="#3b82f6" />
                      </div>
                      <div>
                        <div style={{ fontWeight: '600' }}>{m.name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>ID: #{m.id}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem' }}>{m.ip_address}</code>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                      {m.status === 'ONLINE' ? (
                        <>
                          <CheckCircle2 size={14} color="#10b981" />
                          <span style={{ color: '#10b981' }}>Hoạt động</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle size={14} color="var(--text-secondary)" />
                          <span style={{ color: 'var(--text-secondary)' }}>Ngoại tuyến</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    <button
                      onClick={() => handleDeleteMachine(m.id)}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', transition: 'color 0.2s' }}
                      onMouseOver={e => e.currentTarget.style.color = '#ef4444'}
                      onMouseOut={e => e.currentTarget.style.color = '#94a3b8'}
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
              {machines.length === 0 && <tr><td colSpan="4" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Chưa có máy quét nào được đăng ký</td></tr>}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}

export default Settings;
