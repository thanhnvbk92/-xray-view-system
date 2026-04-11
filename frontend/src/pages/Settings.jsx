import React, { useState, useEffect } from 'react';
import {
  Plus, Trash2, Edit2, Save, X, Server, Layout,
  Settings as SettingsIcon, Shield, Database, Globe,
  Activity, CheckCircle2, AlertCircle, Cpu, RotateCcw
} from 'lucide-react';
import { api, useAuth } from '../context/AuthContext';

function Settings() {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('lines');
  
  const [lines, setLines] = useState([]);
  const [machines, setMachines] = useState([]);
  const [machineTypes, setMachineTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  // States cho Form Thêm mới
  const [newLine, setNewLine] = useState({ name: '', description: '' });
  const [newMachine, setNewMachine] = useState({ name: '', ip_address: '', line_id: '', machine_type_id: '' });
  const [newType, setNewType] = useState({ name: '', part_no: '', log_extension: '.log' });

  // States cho Chỉnh sửa
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [lRes, mRes, tRes] = await Promise.all([
        api.get('/api/lines'),
        api.get('/api/machines'),
        api.get('/api/machine-types')
      ]);
      setLines(lRes.data);
      setMachines(mRes.data);
      setMachineTypes(tRes.data);
      setLoading(false);
    } catch (err) {
      console.error("Fetch error:", err);
      if (err.response?.status !== 401) setLoading(false);
    }
  };

  // --- CRUD Handlers (Line) ---
  const handleAddLine = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/lines', newLine);
      setNewLine({ name: '', description: '' });
      fetchData();
    } catch (err) { alert(err.response?.data?.detail || "Lỗi khi thêm Line"); }
  };

  const handleUpdateLine = async (id) => {
    try {
      await api.put(`/api/lines/${id}`, editData);
      setEditingId(null);
      fetchData();
    } catch (err) { alert("Lỗi khi cập nhật Line"); }
  };

  const handleDeleteLine = async (id) => {
    if (!window.confirm("Bạn có chắc muốn xóa Line này?")) return;
    try {
      await api.delete(`/api/lines/${id}`);
      fetchData();
    } catch (err) { alert("Không thể xóa Line (vẫn còn máy quét liên kết)"); }
  };

  // --- CRUD Handlers (Machine Type) ---
  const handleAddType = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/machine-types', newType);
      setNewType({ name: '', part_no: '', log_extension: '.log' });
      fetchData();
    } catch (err) { alert(err.response?.data?.detail || "Lỗi khi thêm Loại máy"); }
  };

  const handleUpdateType = async (id) => {
    try {
      await api.put(`/api/machine-types/${id}`, editData);
      setEditingId(null);
      fetchData();
    } catch (err) { alert("Lỗi khi cập nhật Loại máy"); }
  };

  const handleDeleteType = async (id) => {
    if (!window.confirm("Bạn có chắc muốn xóa loại máy này?")) return;
    try {
      await api.delete(`/api/machine-types/${id}`);
      fetchData();
    } catch (err) { alert("Lỗi khi xóa loại máy"); }
  };

  // --- CRUD Handlers (Machine) ---
  const handleAddMachine = async (e) => {
    e.preventDefault();
    if (!newMachine.line_id) return alert("Vui lòng chọn Line");
    try {
      await api.post('/api/machines', newMachine);
      setNewMachine({ name: '', ip_address: '', line_id: '', machine_type_id: '' });
      fetchData();
    } catch (err) { alert(err.response?.data?.detail || "Lỗi khi thêm Máy"); }
  };

  const handleUpdateMachine = async (id) => {
    try {
      await api.put(`/api/machines/${id}`, editData);
      setEditingId(null);
      fetchData();
    } catch (err) { alert("Lỗi khi cập nhật Máy"); }
  };

  const handleDeleteMachine = async (id) => {
    if (!window.confirm("Bạn có chắc muốn xóa máy này?")) return;
    try {
      await api.delete(`/api/machines/${id}`);
      fetchData();
    } catch (err) { alert("Lỗi khi xóa máy"); }
  };

  // --- UI Helpers ---
  const startEdit = (item, type) => {
    setEditingId(item.id);
    if (type === 'line') setEditData({ name: item.name, description: item.description });
    else if (type === 'type') setEditData({ name: item.name, part_no: item.part_no, log_extension: item.log_extension });
    else if (type === 'machine') setEditData({ name: item.name, ip_address: item.ip_address, line_id: item.line_id, machine_type_id: item.machine_type_id });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  // Kiểm tra quyền hạn
  const hasConfigPerm = currentUser?.role === 'ADMIN' || currentUser?.permissions?.includes('CAN_MANAGE_SYSTEM');

  if (!hasConfigPerm) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '1rem' }}>
        <AlertCircle size={64} color="var(--status-ng)" />
        <h2>Truy cập bị từ chối</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Bạn không có quyền quản lý hệ thống.</p>
      </div>
    );
  }

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
        <p style={{ color: 'var(--text-secondary)' }}>Quản lý hạ tầng mạng lưới máy quét, loại thiết bị và dây chuyền</p>
      </header>

      {/* TABS NAVIGATION (Submenu) */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '2rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '1px' }}>
        <button 
          onClick={() => { setActiveTab('lines'); cancelEdit(); }}
          className={`btn ${activeTab === 'lines' ? 'btn-primary' : ''}`}
          style={{ borderRadius: '8px 8px 0 0', padding: '12px 24px', border: 'none', background: activeTab === 'lines' ? 'var(--accent-blue)' : 'transparent', color: 'white' }}
        >
          <Layout size={18} style={{ marginRight: '8px' }} /> Dây chuyền (Lines)
        </button>
        <button 
          onClick={() => { setActiveTab('types'); cancelEdit(); }}
          className={`btn ${activeTab === 'types' ? 'btn-primary' : ''}`}
          style={{ borderRadius: '8px 8px 0 0', padding: '12px 24px', border: 'none', background: activeTab === 'types' ? 'var(--accent-blue)' : 'transparent', color: 'white' }}
        >
          <Cpu size={18} style={{ marginRight: '8px' }} /> Loại máy (Machine Types)
        </button>
        <button 
          onClick={() => { setActiveTab('machines'); cancelEdit(); }}
          className={`btn ${activeTab === 'machines' ? 'btn-primary' : ''}`}
          style={{ borderRadius: '8px 8px 0 0', padding: '12px 24px', border: 'none', background: activeTab === 'machines' ? 'var(--accent-blue)' : 'transparent', color: 'white' }}
        >
          <Server size={18} style={{ marginRight: '8px' }} /> Máy quét (Devices)
        </button>
      </div>

      <div className="tab-content" style={{ animation: 'fade-in 0.3s ease-out' }}>
        
        {/* TAB: LINES */}
        {activeTab === 'lines' && (
          <div className="grid-1-2" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
            <div className="data-table-container" style={{ padding: '1.5rem' }}>
              <h3 style={{ marginBottom: '1.5rem' }}>Thêm Dây chuyền</h3>
              <form onSubmit={handleAddLine} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input
                  className="btn-secondary"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', padding: '12px', color: 'white', borderRadius: '8px' }}
                  type="text" placeholder="Tên Line (ví dụ: Line A)" required
                  value={newLine.name} onChange={e => setNewLine({ ...newLine, name: e.target.value })}
                />
                <textarea
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', padding: '12px', color: 'white', borderRadius: '8px', minHeight: '80px' }}
                  placeholder="Mô tả..."
                  value={newLine.description} onChange={e => setNewLine({ ...newLine, description: e.target.value })}
                />
                <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center' }}>
                  <Plus size={18} /> Lưu Dây chuyền
                </button>
              </form>
            </div>
            <div className="data-table-container" style={{ padding: '1.5rem' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>TÊN LINE</th>
                    <th>MÔ TẢ</th>
                    <th style={{ textAlign: 'right' }}>THAO TÁC</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(l => (
                    <tr key={l.id}>
                      <td>
                        {editingId === l.id ? (
                          <input 
                            className="btn-secondary" style={{ padding: '6px', fontSize: '0.9rem', width: '100%' }}
                            value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })}
                          />
                        ) : (
                          <div style={{ fontWeight: '600' }}>{l.name}</div>
                        )}
                      </td>
                      <td>
                        {editingId === l.id ? (
                          <input 
                            className="btn-secondary" style={{ padding: '6px', fontSize: '0.9rem', width: '100%' }}
                            value={editData.description} onChange={e => setEditData({ ...editData, description: e.target.value })}
                          />
                        ) : (
                          l.description || '-'
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {editingId === l.id ? (
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => handleUpdateLine(l.id)} className="btn" style={{ color: 'var(--status-ok)', padding: '8px' }} title="Lưu"><Save size={16} /></button>
                            <button onClick={cancelEdit} className="btn" style={{ color: 'var(--text-secondary)', padding: '8px' }} title="Hủy"><X size={16} /></button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => startEdit(l, 'line')} className="btn" style={{ color: '#31cbf8', padding: '8px' }} title="Sửa"><Edit2 size={16} /></button>
                            <button onClick={() => handleDeleteLine(l.id)} className="btn" style={{ color: 'var(--status-ng)', padding: '8px' }} title="Xóa"><Trash2 size={16} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: MACHINE TYPES */}
        {activeTab === 'types' && (
          <div className="grid-1-2" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
            <div className="data-table-container" style={{ padding: '1.5rem' }}>
              <h3 style={{ marginBottom: '1.5rem' }}>Định nghĩa Loại máy</h3>
              <form onSubmit={handleAddType} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input
                  className="btn-secondary"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', padding: '12px', color: 'white', borderRadius: '8px' }}
                  type="text" placeholder="Tên loại (ví dụ: Fuji X3)" required
                  value={newType.name} onChange={e => setNewType({ ...newType, name: e.target.value })}
                />
                <input
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', padding: '12px', color: 'white', borderRadius: '8px' }}
                  type="text" placeholder="Mã linh kiện (Part No)"
                  value={newType.part_no} onChange={e => setNewType({ ...newType, part_no: e.target.value })}
                />
                <input
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', padding: '12px', color: 'white', borderRadius: '8px' }}
                  type="text" placeholder="Đuôi file Log (e.g. .log, .csv)" required
                  value={newType.log_extension} onChange={e => setNewType({ ...newType, log_extension: e.target.value })}
                />
                <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center' }}>
                  <Plus size={18} /> Lưu Loại máy
                </button>
              </form>
            </div>
            <div className="data-table-container" style={{ padding: '1.5rem' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>LOẠI MÁY</th>
                    <th>MÃ PART NO</th>
                    <th>ĐỊNH DẠNG LOG</th>
                    <th style={{ textAlign: 'right' }}>THAO TÁC</th>
                  </tr>
                </thead>
                <tbody>
                  {machineTypes.map(t => (
                    <tr key={t.id}>
                      <td>
                        {editingId === t.id ? (
                          <input 
                            className="btn-secondary" style={{ padding: '6px', fontSize: '0.9rem', width: '100%' }}
                            value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })}
                          />
                        ) : (
                          <div style={{ fontWeight: '600' }}>{t.name}</div>
                        )}
                      </td>
                      <td>
                        {editingId === t.id ? (
                          <input 
                            className="btn-secondary" style={{ padding: '6px', fontSize: '0.9rem', width: '100%' }}
                            value={editData.part_no} onChange={e => setEditData({ ...editData, part_no: e.target.value })}
                          />
                        ) : (
                          <code>{t.part_no || '-'}</code>
                        )}
                      </td>
                      <td>
                        {editingId === t.id ? (
                          <input 
                            className="btn-secondary" style={{ padding: '6px', fontSize: '0.9rem', width: '100%' }}
                            value={editData.log_extension} onChange={e => setEditData({ ...editData, log_extension: e.target.value })}
                          />
                        ) : (
                          <code>{t.log_extension}</code>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {editingId === t.id ? (
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => handleUpdateType(t.id)} className="btn" style={{ color: 'var(--status-ok)', padding: '8px' }} title="Lưu"><Save size={16} /></button>
                            <button onClick={cancelEdit} className="btn" style={{ color: 'var(--text-secondary)', padding: '8px' }} title="Hủy"><X size={16} /></button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => startEdit(t, 'type')} className="btn" style={{ color: '#31cbf8', padding: '8px' }} title="Sửa"><Edit2 size={16} /></button>
                            <button onClick={() => handleDeleteType(t.id)} className="btn" style={{ color: 'var(--status-ng)', padding: '8px' }} title="Xóa"><Trash2 size={16} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: MACHINES */}
        {activeTab === 'machines' && (
          <div className="data-table-container" style={{ padding: '1.5rem' }}>
            <h3 style={{ marginBottom: '1.5rem' }}>Đăng ký Máy quét (Devices)</h3>
            <form onSubmit={handleAddMachine} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) auto', gap: '15px', marginBottom: '2rem' }}>
              <input
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', padding: '10px', color: 'white', borderRadius: '8px' }}
                type="text" placeholder="Tên Máy (e.g. XRAY-01)" required
                value={newMachine.name} onChange={e => setNewMachine({ ...newMachine, name: e.target.value })}
              />
              <input
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', padding: '10px', color: 'white', borderRadius: '8px' }}
                type="text" placeholder="IP Address"
                value={newMachine.ip_address} onChange={e => setNewMachine({ ...newMachine, ip_address: e.target.value })}
              />
              <select
                required value={newMachine.line_id}
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--glass-border)', padding: '10px', color: 'white', borderRadius: '8px', cursor: 'pointer' }}
                onChange={e => setNewMachine({ ...newMachine, line_id: parseInt(e.target.value) })}
              >
                <option value="" style={{ background: '#1e293b', color: 'white' }}>Chọn Line...</option>
                {lines.map(l => <option key={l.id} value={l.id} style={{ background: '#1e293b', color: 'white' }}>{l.name}</option>)}
              </select>
              <select
                value={newMachine.machine_type_id}
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--glass-border)', padding: '10px', color: 'white', borderRadius: '8px', cursor: 'pointer' }}
                onChange={e => setNewMachine({ ...newMachine, machine_type_id: e.target.value ? parseInt(e.target.value) : '' })}
              >
                <option value="" style={{ background: '#1e293b', color: 'white' }}>Chọn Loại máy...</option>
                {machineTypes.map(t => <option key={t.id} value={t.id} style={{ background: '#1e293b', color: 'white' }}>{t.name}</option>)}
              </select>
              <button type="submit" className="btn btn-primary"><Plus size={18} /> Thêm</button>
            </form>

            <table className="data-table">
              <thead>
                <tr>
                  <th>THIẾT BỊ</th>
                  <th>IP / LOẠI MÁY</th>
                  <th>LINE</th>
                  <th>TRẠNG THÁI</th>
                  <th style={{ textAlign: 'right' }}>THAO TÁC</th>
                </tr>
              </thead>
              <tbody>
                {machines.map(m => (
                  <tr key={m.id}>
                    <td>
                        {editingId === m.id ? (
                          <input 
                            className="btn-secondary" style={{ padding: '6px', fontSize: '0.9rem', width: '100%' }}
                            value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })}
                          />
                        ) : (
                          <>
                            <div style={{ fontWeight: '600' }}>{m.name}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>ID: #{m.id}</div>
                          </>
                        )}
                    </td>
                    <td>
                        {editingId === m.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <input 
                              className="btn-secondary" style={{ padding: '6px', fontSize: '0.8rem', width: '100%' }}
                              value={editData.ip_address} onChange={e => setEditData({ ...editData, ip_address: e.target.value })}
                            />
                            <select
                              style={{ background: '#1e293b', border: '1px solid var(--glass-border)', padding: '6px', color: 'white', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' }}
                              value={editData.machine_type_id} onChange={e => setEditData({ ...editData, machine_type_id: parseInt(e.target.value) })}
                            >
                              <option value="" style={{ background: '#1e293b', color: 'white' }}>Chọn Loại máy...</option>
                              {machineTypes.map(t => <option key={t.id} value={t.id} style={{ background: '#1e293b', color: 'white' }}>{t.name}</option>)}
                            </select>
                          </div>
                        ) : (
                          <>
                            <div><code>{m.ip_address}</code></div>
                            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>{m.machine_type?.name || 'Chưa gán loại'}</div>
                          </>
                        )}
                    </td>
                    <td>
                        {editingId === m.id ? (
                          <select
                            style={{ background: '#1e293b', border: '1px solid var(--glass-border)', padding: '6px', color: 'white', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' }}
                            value={editData.line_id} onChange={e => setEditData({ ...editData, line_id: parseInt(e.target.value) })}
                          >
                            {lines.map(l => <option key={l.id} value={l.id} style={{ background: '#1e293b', color: 'white' }}>{l.name}</option>)}
                          </select>
                        ) : (
                          lines.find(l => l.id === m.line_id)?.name || m.line_id
                        )}
                    </td>
                    <td>
                      <span className={`badge ${m.status === 'ONLINE' ? 'badge-ok' : ''}`}>
                        {m.status === 'ONLINE' ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                        {editingId === m.id ? (
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => handleUpdateMachine(m.id)} className="btn" style={{ color: 'var(--status-ok)', padding: '8px' }} title="Lưu"><Save size={16} /></button>
                            <button onClick={cancelEdit} className="btn" style={{ color: 'var(--text-secondary)', padding: '8px' }} title="Hủy"><X size={16} /></button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => startEdit(m, 'machine')} className="btn" style={{ color: '#31cbf8', padding: '8px' }} title="Sửa"><Edit2 size={16} /></button>
                            <button onClick={() => handleDeleteMachine(m.id)} className="btn" style={{ color: 'var(--status-ng)', padding: '8px' }} title="Xóa"><Trash2 size={16} /></button>
                          </div>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Settings;
