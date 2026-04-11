import React, { useState, useEffect } from 'react';
import { Search, Calendar, Monitor, Hash, CheckCircle2, XCircle, Eye, Filter, ArrowRight } from 'lucide-react';
import { api } from '../context/AuthContext';

const API_URL = `http://${window.location.hostname}:8000`;

function Trace() {
    const [pid, setPid] = useState('');
    const [machineId, setMachineId] = useState('');
    const [result, setResult] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [results, setResults] = useState([]);
    const [machines, setMachines] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedPcb, setSelectedPcb] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [pcbImages, setPcbImages] = useState([]);

    useEffect(() => {
        // Load danh sách máy để lọc
        const fetchMachines = async () => {
            try {
                console.log("Trace: Fetching machine list...");
                const res = await api.get('/api/dashboard/summary');
                const machineList = res.data.map(m => ({ id: m.id, name: m.display_name }));
                setMachines(machineList);
            } catch (error) {
                console.error("Error fetching machines:", error);
            }
        };
        fetchMachines();
        handleSearch(); // Load mặc định
    }, []);

    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (pid) params.append('pid', pid);
            if (machineId) params.append('machine_id', machineId);
            if (result) params.append('result', result);
            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);

            console.log("Trace: Searching with params:", params.toString());
            const res = await api.get(`/api/pcbs/trace/search?${params.toString()}`);
            setResults(res.data);
        } catch (error) {
            console.error("Search failed:", error);
        } finally {
            setLoading(false);
        }
    };

    const viewDetails = async (pcb) => {
        setSelectedPcb(pcb);
        setShowModal(true);
        try {
            console.log(`Trace: Fetching details for PCB ${pcb.id}`);
            const res = await api.get(`/api/pcbs/${pcb.id}/images`);
            // Lọc bỏ ảnh gốc để xem cho gọn
            const markedOnly = res.data.filter(img => !img.image_path.toLowerCase().endsWith('_o.jpg') && !img.image_path.toLowerCase().endsWith('_o.png'));
            setPcbImages(markedOnly);
        } catch (error) {
            console.error("Error fetching images:", error);
        }
    };

    return (
        <div className="fade-in">
            <div className="dashboard-header">
                <div>
                    <h1>Truy vết Sản phẩm</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Tra cứu lịch sử kiểm tra PCB trên toàn hệ thống</p>
                </div>
            </div>

            {/* Bộ lọc */}
            <div className="data-table-container" style={{ padding: '1.5rem', marginBottom: '2rem', background: 'var(--bg-card)' }}>
                <form onSubmit={handleSearch} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>MÃ PID</label>
                        <div style={{ position: 'relative' }}>
                            <Hash size={14} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
                            <input
                                type="text"
                                placeholder="Nhập PID..."
                                value={pid}
                                onChange={(e) => setPid(e.target.value)}
                                style={{ width: '100%', padding: '10px 10px 10px 35px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '10px', color: 'white' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>MÁY QUYÉT</label>
                        <select
                            value={machineId}
                            onChange={(e) => setMachineId(e.target.value)}
                            style={{ padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '10px', color: 'white' }}
                        >
                            <option value="">Tất cả máy</option>
                            {machines.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>KẾT QUẢ</label>
                        <select
                            value={result}
                            onChange={(e) => setResult(e.target.value)}
                            style={{ padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '10px', color: 'white' }}
                        >
                            <option value="">Tất cả</option>
                            <option value="OK">OK</option>
                            <option value="NG">NG</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>TỪ NGÀY</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            style={{ padding: '9px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '10px', color: 'white' }}
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>ĐẾN NGÀY</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            style={{ padding: '9px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '10px', color: 'white' }}
                        />
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        {loading ? '...' : <><Search size={18} /> Tìm kiếm</>}
                    </button>
                </form>
            </div>

            {/* Bảng kết quả */}
            <div className="data-table-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>THỜI GIAN</th>
                            <th>MÃ PID</th>
                            <th>MÁY / LINE</th>
                            <th style={{ textAlign: 'center' }}>KẾT QUẢ</th>
                            <th style={{ textAlign: 'center' }}>XÁC NHẬN</th>
                            <th>NGƯỜI THỰC HIỆN</th>
                            <th style={{ textAlign: 'right' }}>THAO TÁC</th>
                        </tr>
                    </thead>
                    <tbody>
                        {results.length > 0 ? results.map((item) => (
                            <tr key={item.id}>
                                <td style={{ fontSize: '0.8rem' }}>{new Date(item.time).toLocaleString()}</td>
                                <td style={{ fontWeight: 'bold' }}>{item.pid}</td>
                                <td>
                                    <div style={{ fontSize: '0.85rem' }}>{item.display_name}</div>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                    <span className={`badge ${item.result === 'OK' ? 'badge-ok' : 'badge-ng'}`}>
                                        {item.result}
                                    </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                    {item.user_confirmed ? (
                                        <div style={{ color: 'var(--status-ok)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', fontSize: '0.7rem' }}>
                                            <CheckCircle2 size={12} /> Người duyệt
                                        </div>
                                    ) : (
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Máy tự động</div>
                                    )}
                                </td>
                                <td style={{ fontSize: '0.85rem' }}>
                                    {item.confirmed_by_name || <span style={{ color: 'var(--text-secondary)' }}>-</span>}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                    <button
                                        className="btn"
                                        style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', color: 'var(--primary)' }}
                                        onClick={() => viewDetails(item)}
                                    >
                                        <Eye size={16} />
                                    </button>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                                    Không tìm thấy dữ liệu phù hợp
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal chi tiết */}
            {showModal && selectedPcb && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                    <div className="data-table-container" style={{ width: '100%', maxWidth: '1000px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ fontSize: '1.25rem' }}>Chi tiết PCB: {selectedPcb.pid}</h2>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{selectedPcb.display_name} • {new Date(selectedPcb.time).toLocaleString()}</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="btn" style={{ background: 'rgba(255,255,255,0.1)' }}>Đóng</button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                                {pcbImages.map(img => (
                                    <div key={img.id} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
                                        <img
                                            src={`${API_URL}${img.image_path}`}
                                            alt="Unit"
                                            style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', cursor: 'pointer' }}
                                            onClick={() => window.open(`${API_URL}${img.image_path}`, '_blank')}
                                        />
                                        <div style={{ padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Unit {img.image_path.split('_').pop().split('.')[0]}</span>
                                            <span className={`badge ${img.machine_result === 'OK' ? 'badge-ok' : 'badge-ng'}`} style={{ fontSize: '0.6rem' }}>{img.machine_result}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Trace;
