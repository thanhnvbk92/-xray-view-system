import React, { useState, useEffect } from 'react';
import { Search, Calendar, Monitor, Hash, CheckCircle2, XCircle, Eye, Filter, ArrowRight, Move, ZoomIn, ZoomOut, Maximize, Check, X } from 'lucide-react';
import { useAuth, api } from '../context/AuthContext';

const API_URL = `http://${window.location.hostname}:8000`;

function Trace() {
    const { user } = useAuth();
    const isViewer = user?.role === 'VIEWER';
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
    const [selectedImage, setSelectedImage] = useState(null);
    const [showOriginal, setShowOriginal] = useState(false);
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);
    const [modalScale, setModalScale] = useState(1);
    const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
    const [isModalDragging, setIsModalDragging] = useState(false);
    const [modalDragStart, setModalDragStart] = useState({ x: 0, y: 0 });

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
            const images = res.data;
            // Lọc bỏ ảnh gốc để xem cho gọn ở danh sách chính
            const markedOnly = images.filter(img => !img.image_path.toLowerCase().endsWith('_o.jpg') && !img.image_path.toLowerCase().endsWith('_o.png'));
            setPcbImages(markedOnly);
            // Lưu lại full list vào selectedPcb để sau này tìm ảnh gốc nhanh
            setSelectedPcb({ ...pcb, images });
        } catch (error) {
            console.error("Error fetching images:", error);
        }
    };

    const openImageInspector = (img) => {
        setSelectedImage(img);
        setShowOriginal(false);
        setModalScale(1);
        setModalPosition({ x: 0, y: 0 });
        setIsImageModalOpen(true);
    };

    // Keyboard shortcuts for Modal
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') setIsImageModalOpen(false);
            if (e.key === ' ' && isImageModalOpen) {
                e.preventDefault();
                setShowOriginal(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isImageModalOpen]);

    const handleModalWheel = (e) => {
        if (!isImageModalOpen) return;
        const delta = e.deltaY > 0 ? -0.2 : 0.2;
        const newScale = Math.min(Math.max(modalScale + delta, 0.5), 10);
        setModalScale(newScale);
    };

    const onModalMouseDown = (e) => {
        if (!isImageModalOpen) return;
        setIsModalDragging(true);
        setModalDragStart({ x: e.clientX - modalPosition.x, y: e.clientY - modalPosition.y });
    };

    const onModalMouseMove = (e) => {
        if (isModalDragging && isImageModalOpen) {
            setModalPosition({
                x: e.clientX - modalDragStart.x,
                y: e.clientY - modalDragStart.y
            });
        }
    };

    const onModalMouseUp = () => {
        setIsModalDragging(false);
    };

    const handleConfirm = async (userResult) => {
        if (!selectedImage || !selectedPcb || isViewer) return;

        try {
            const formData = new FormData();
            formData.append('user_result', userResult);
            console.log(`Trace: Confirming image ${selectedImage.id} as ${userResult}`);
            
            // 0. Vô hiệu hóa modal tạm thời để tránh double click (có thể thêm loading state nếu cần)
            
            await api.post(`/api/pcbs/confirm-image/${selectedImage.id}`, formData);

            // 1. Cập nhật ảnh trong modal chi tiết
            const updatedPcbImages = pcbImages.map(img => 
                img.id === selectedImage.id ? { ...img, machine_result: userResult } : img
            );
            setPcbImages(updatedPcbImages);

            // 2. Cập nhật danh sách results bên ngoài
            const updatedResults = results.map(item => {
                if (item.id === selectedPcb.id) {
                    const allNowOk = updatedPcbImages.every(i => i.machine_result === 'OK');
                    return { 
                        ...item, 
                        result: allNowOk ? 'OK' : item.result, 
                        user_confirmed: true,
                        confirmed_by_name: user.full_name
                    };
                }
                return item;
            });
            setResults(updatedResults);
            
            // 3. ĐÓNG POPUP NGAY ĐỂ PHẢN HỒI CHO NGƯỜI DÙNG
            setIsImageModalOpen(false);
            setSelectedImage(null);
            
        } catch (error) {
            console.error("Error confirming image in Trace:", error);
            alert("Có lỗi xảy ra khi xác nhận. Vui lòng thử lại.");
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
                            className="glass-select"
                            style={{ 
                                padding: '10px', 
                                background: 'rgba(255, 255, 255, 0.07)', 
                                backdropFilter: 'blur(10px)',
                                border: '1px solid rgba(255, 255, 255, 0.1)', 
                                borderRadius: '10px', 
                                color: 'white',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="" style={{ background: '#1a1b26' }}>Tất cả máy</option>
                            {machines.map(m => (
                                <option key={m.id} value={m.id} style={{ background: '#1a1b26' }}>{m.name}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>KẾT QUẢ</label>
                        <select
                            value={result}
                            onChange={(e) => setResult(e.target.value)}
                            className="glass-select"
                            style={{ 
                                padding: '10px', 
                                background: 'rgba(255, 255, 255, 0.07)', 
                                backdropFilter: 'blur(10px)',
                                border: '1px solid rgba(255, 255, 255, 0.1)', 
                                borderRadius: '10px', 
                                color: 'white',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="" style={{ background: '#1a1b26' }}>Tất cả</option>
                            <option value="OK" style={{ background: '#1a1b26' }}>OK</option>
                            <option value="NG" style={{ background: '#1a1b26' }}>NG</option>
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
                                            style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', cursor: 'zoom-in' }}
                                            onClick={() => openImageInspector(img)}
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

            {/* Premium Image Inspector Modal */}
            {isImageModalOpen && selectedImage && (
                <div 
                    style={{
                        position: 'fixed', inset: 0, zIndex: 9999,
                        background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(15px)',
                        display: 'flex', flexDirection: 'column'
                    }}
                >
                    {/* Modal Header */}
                    <div style={{ padding: '15px 25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <div className={`badge ${selectedImage.machine_result === 'OK' ? 'badge-ok' : 'badge-ng'}`}>
                                Máy: {selectedImage.machine_result}
                            </div>
                            <span style={{ color: 'white', fontWeight: 'bold' }}>{selectedPcb?.pid} - {selectedImage.image_path.split('/').pop()}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button 
                                className="btn btn-secondary" 
                                style={{ background: showOriginal ? 'var(--primary)' : 'rgba(255,255,255,0.1)', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}
                                onClick={() => setShowOriginal(!showOriginal)}
                            >
                                <Eye size={18} /> {showOriginal ? "HIỆN ẢNH LỖI" : "HIỆN ẢNH GỐC"} (SPACE)
                            </button>
                            <button className="btn btn-secondary" onClick={() => setIsImageModalOpen(false)}>
                                <XCircle size={18} /> ĐÓNG (ESC)
                            </button>
                        </div>
                    </div>

                    {/* Modal Content - The Big Viewer */}
                    <div 
                        style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: isModalDragging ? 'grabbing' : 'grab' }}
                        onWheel={handleModalWheel}
                        onMouseDown={onModalMouseDown}
                        onMouseMove={onModalMouseMove}
                        onMouseUp={onModalMouseUp}
                        onMouseLeave={onModalMouseUp}
                    >
                        <div style={{
                            width: '100%', height: '100%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transform: `scale(${modalScale}) translate(${modalPosition.x / modalScale}px, ${modalPosition.y / modalScale}px)`,
                            transition: isModalDragging ? 'none' : 'transform 0.15s ease-out'
                        }}>
                             <img
                                src={`${API_URL}${(() => {
                                    if (!showOriginal) return selectedImage.image_path;
                                    // Tìm ảnh gốc tương ứng (_o.jpg)
                                    const basePath = selectedImage.image_path.substring(0, selectedImage.image_path.lastIndexOf('.'));
                                    const ext = selectedImage.image_path.substring(selectedImage.image_path.lastIndexOf('.'));
                                    const originalPath = `${basePath}_o${ext}`;
                                    const foundOriginal = selectedPcb?.images?.find(i => i.image_path === originalPath);
                                    return foundOriginal ? foundOriginal.image_path : selectedImage.image_path;
                                })()}`}
                                alt="Inspection"
                                style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain', pointerEvents: 'none', filter: 'drop-shadow(0 0 20px rgba(0,0,0,0.5))' }}
                            />
                        </div>

                        {/* Floating Tooltips & Action Buttons */}
                        <div style={{ position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '20px', alignItems: 'center' }}>
                            <div style={{ background: 'rgba(0,0,0,0.7)', padding: '10px 20px', borderRadius: '30px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: '15px', color: 'white', backdropFilter: 'blur(5px)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Move size={14} /> <span style={{fontSize: '0.75rem'}}>Kéo</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '15px' }}>
                                    <ZoomIn size={14} /> <span style={{fontSize: '0.75rem'}}>{Math.round(modalScale * 100)}%</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '15px' }}>
                                    <Eye size={14} /> <span style={{fontSize: '0.75rem'}}>Space: {showOriginal ? "Gốc" : "Lỗi"}</span>
                                </div>
                            </div>

                            {!isViewer && (
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button 
                                        className="btn btn-primary" 
                                        style={{ background: 'var(--status-ok)', border: 'none', height: '45px', padding: '0 25px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }} 
                                        onClick={() => handleConfirm('OK')}
                                    >
                                        <Check size={18} /> XÁC NHẬN OK
                                    </button>
                                    <button 
                                        className="btn" 
                                        style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444', color: '#ef4444', height: '45px', padding: '0 25px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }} 
                                        onClick={() => handleConfirm('NG')}
                                    >
                                        <X size={18} /> GIỮ NG
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Trace;
