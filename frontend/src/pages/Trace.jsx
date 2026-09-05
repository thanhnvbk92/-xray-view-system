import React, { useState, useEffect } from 'react';
import { Search, Calendar, Monitor, Hash, CheckCircle2, XCircle, Eye, Filter, ArrowRight, Move, ZoomIn, ZoomOut, Maximize, Check, X, UserCheck } from 'lucide-react';
import { useAuth, api } from '../context/AuthContext';

const API_URL = import.meta.env.DEV 
    ? `http://${window.location.hostname}:8000` 
    : `http://${window.location.hostname}:${window.location.port}`;

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

    // Hàm tính toán độ ưu tiên của PCB dựa trên nguyên nhân lỗi
    const getPcbPriority = (pcb) => {
        // Chỉ ưu tiên các PCB chưa được duyệt (user_confirmed === false)
        if (pcb.user_confirmed) return 4; 
        
        if (!pcb.images || pcb.images.length === 0) return 3;
        
        const causes = pcb.images.map(img => img.cause || "");
        if (causes.some(c => c === "Short")) return 1;
        if (causes.some(c => c === "Area_NG")) return 2;
        return 3;
    };

    // Sắp xếp dữ liệu hiển thị
    const sortedResults = [...results].sort((a, b) => {
        const priorityA = getPcbPriority(a);
        const priorityB = getPcbPriority(b);
        
        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }
        
        // Nếu cùng độ ưu tiên, sắp xếp theo thời gian mới nhất (item.time)
        return new Date(b.time) - new Date(a.time);
    });

    // Bộ lọc trực tiếp trên từng cột của bảng
    const [columnFilters, setColumnFilters] = useState({
        time: '',
        pid: '',
        machine: '',
        result: '',
        confirmed: '',
        confirmedBy: ''
    });
    const [showColumnFilters, setShowColumnFilters] = useState(false);

    // Lọc danh sách kết quả hiển thị theo bộ lọc từng cột
    const filteredResults = sortedResults.filter(item => {
        if (columnFilters.pid && !item.pid.toLowerCase().includes(columnFilters.pid.toLowerCase().trim())) {
            return false;
        }
        if (columnFilters.time) {
            const timeStr = new Date(item.time).toLocaleString().toLowerCase();
            if (!timeStr.includes(columnFilters.time.toLowerCase().trim())) return false;
        }
        if (columnFilters.machine) {
            const machineStr = (item.display_name || '').toLowerCase();
            if (!machineStr.includes(columnFilters.machine.toLowerCase().trim())) return false;
        }
        if (columnFilters.result) {
            if (columnFilters.result === 'USER_OK') {
                if (!(item.user_confirmed && item.result === 'OK' && item.machine_result === 'NG')) return false;
            } else if (item.result !== columnFilters.result) {
                return false;
            }
        }
        if (columnFilters.confirmed) {
            if (columnFilters.confirmed === 'HUMAN' && !item.user_confirmed) return false;
            if (columnFilters.confirmed === 'AUTO' && item.user_confirmed) return false;
        }
        if (columnFilters.confirmedBy) {
            const name = (item.confirmed_by_name || '').toLowerCase();
            if (!name.includes(columnFilters.confirmedBy.toLowerCase().trim())) return false;
        }
        return true;
    });

    const filterInputStyle = {
        width: '100%',
        padding: '4px 8px',
        fontSize: '0.75rem',
        background: 'rgba(255, 255, 255, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '4px',
        color: '#fff',
        outline: 'none'
    };

    const filterSelectStyle = {
        width: '100%',
        padding: '4px 6px',
        fontSize: '0.75rem',
        background: '#1a1b26',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '4px',
        color: '#fff',
        outline: 'none'
    };

    const getRowStyle = (pcb) => {
        const priority = getPcbPriority(pcb);
        if (priority === 1) return { background: 'rgba(239, 68, 68, 0.12)', borderLeft: '4px solid #ef4444' }; // Short - Đỏ nhạt
        if (priority === 2) return { background: 'rgba(245, 158, 11, 0.08)', borderLeft: '4px solid #f59e0b' }; // Area_NG - Vàng nhạt
        return {};
    };

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
            // Chuẩn hóa dữ liệu cho các bản ghi cũ chưa có shot_num/image_type
            const normalizedImages = res.data.map(img => {
                let s_num = img.shot_num;
                let i_type = img.image_type;
                
                if (!s_num) {
                    const match = img.image_path.match(/(\d+)(?:_o)?\.[^.]+$/);
                    s_num = match ? parseInt(match[1]) : 1;
                }
                
                if (!i_type) {
                    i_type = img.image_path.toLowerCase().includes('_o.') ? 'origin' : 'marked';
                }
                
                return { ...img, shot_num: s_num, image_type: i_type };
            });

            // Lọc bỏ ảnh gốc để xem cho gọn ở danh sách chính, sắp xếp theo shot_num
            const markedOnly = normalizedImages
                .filter(img => img.image_type !== 'origin')
                .sort((a, b) => a.shot_num - b.shot_num);
            
            setPcbImages(markedOnly);
            // Lưu lại full list đã chuẩn hóa vào selectedPcb
            setSelectedPcb({ ...pcb, images: normalizedImages });
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
            if (e.key === 'Escape') {
                if (isImageModalOpen) setIsImageModalOpen(false);
                else if (showModal) setShowModal(false);
            }
            
            if (!isImageModalOpen) return;

            // Chuyển ảnh Gốc/Lỗi
            if (e.key === ' ') {
                e.preventDefault();
                setShowOriginal(prev => !prev);
            }

            // Điều hướng giữa các Shot (Mũi tên)
            if (e.key === 'ArrowRight') handleNextImage();
            if (e.key === 'ArrowLeft') handlePrevImage();

            // Điều hướng giữa các PCB (A/D)
            if (e.key === 'd' || e.key === 'D') handleNextPcb();
            if (e.key === 'a' || e.key === 'A') handlePrevPcb();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isImageModalOpen, showModal, pcbImages, selectedImage, results, selectedPcb]);

    const handleNextImage = () => {
        const currentIndex = pcbImages.findIndex(img => img.id === selectedImage?.id);
        if (currentIndex < pcbImages.length - 1) {
            setSelectedImage(pcbImages[currentIndex + 1]);
            setShowOriginal(false);
        } else {
            handleNextPcb(); // Nếu hết ảnh shot này thì sang PCB tiếp theo
        }
    };

    const handlePrevImage = () => {
        const currentIndex = pcbImages.findIndex(img => img.id === selectedImage?.id);
        if (currentIndex > 0) {
            setSelectedImage(pcbImages[currentIndex - 1]);
            setShowOriginal(false);
        } else {
            handlePrevPcb();
        }
    };

    const handleNextPcb = () => {
        const pcbIndex = results.findIndex(p => p.id === selectedPcb?.id);
        if (pcbIndex < results.length - 1) {
            const nextPcb = results[pcbIndex + 1];
            viewDetails(nextPcb);
            // Sau khi fetch images xong (trong viewDetails), chúng ta cần auto chọn ảnh đầu tiên.
            // Vì viewDetails là async, ta sẽ xử lý auto-select bằng cách theo dõi sự thay đổi của pcbImages
        }
    };

    const handlePrevPcb = () => {
        const pcbIndex = results.findIndex(p => p.id === selectedPcb?.id);
        if (pcbIndex > 0) {
            const prevPcb = results[pcbIndex - 1];
            viewDetails(prevPcb);
        }
    };

    // Tự động chọn ảnh đầu tiên khi chuyển PCB qua phím tắt
    useEffect(() => {
        if (isImageModalOpen && pcbImages.length > 0) {
            // Nếu ảnh hiện tại không thuộc pcb mới thì mới auto-select ảnh đầu
            const belongsToCurrent = pcbImages.some(img => img.id === selectedImage?.id);
            if (!belongsToCurrent) {
                setSelectedImage(pcbImages[0]);
                setShowOriginal(false);
                setModalScale(1);
                setModalPosition({ x: 0, y: 0 });
            }
        }
    }, [pcbImages]);

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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--glass-border)', background: 'rgba(255, 255, 255, 0.02)' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Hiển thị <b>{filteredResults.length}</b> / <b>{results.length}</b> kết quả
                        {(columnFilters.time || columnFilters.pid || columnFilters.machine || columnFilters.result || columnFilters.confirmed || columnFilters.confirmedBy) && (
                            <span style={{ marginLeft: '10px', color: '#f59e0b', fontSize: '0.75rem' }}>(Đang bật lọc cột)</span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {(columnFilters.time || columnFilters.pid || columnFilters.machine || columnFilters.result || columnFilters.confirmed || columnFilters.confirmedBy) && (
                            <button
                                type="button"
                                onClick={() => setColumnFilters({ time: '', pid: '', machine: '', result: '', confirmed: '', confirmedBy: '' })}
                                className="btn"
                                style={{ padding: '4px 10px', fontSize: '0.75rem', color: 'var(--status-ng)', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                                <X size={13} /> Xóa lọc cột
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setShowColumnFilters(!showColumnFilters)}
                            className={`btn ${showColumnFilters ? 'btn-primary' : ''}`}
                            style={{ padding: '4px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px', background: showColumnFilters ? '' : 'rgba(255,255,255,0.05)' }}
                        >
                            <Filter size={14} /> {showColumnFilters ? 'Ẩn bộ lọc cột' : 'Hiện bộ lọc cột'}
                        </button>
                    </div>
                </div>

                <table className="data-table">
                    <thead>
                        <tr>
                            <th>THỜI GIAN</th>
                            <th>MÃ PID</th>
                            <th>MÁY / LINE</th>
                            <th style={{ textAlign: 'center' }}>KẾT QUẢ</th>
                            <th style={{ textAlign: 'center' }}>XÁC NHẬN</th>
                            <th style={{ textAlign: 'center' }}>THỜI GIAN DUYỆT</th>
                            <th>NGƯỜI THỰC HIỆN</th>
                            <th style={{ textAlign: 'right' }}>THAO TÁC</th>
                        </tr>
                        {showColumnFilters && (
                            <tr style={{ background: 'rgba(0, 0, 0, 0.25)', borderBottom: '1px solid var(--glass-border)' }}>
                                <th style={{ padding: '6px' }}>
                                    <input
                                        type="text"
                                        placeholder="Lọc thời gian..."
                                        value={columnFilters.time}
                                        onChange={(e) => setColumnFilters({ ...columnFilters, time: e.target.value })}
                                        style={filterInputStyle}
                                    />
                                </th>
                                <th style={{ padding: '6px' }}>
                                    <input
                                        type="text"
                                        placeholder="Lọc PID..."
                                        value={columnFilters.pid}
                                        onChange={(e) => setColumnFilters({ ...columnFilters, pid: e.target.value })}
                                        style={filterInputStyle}
                                    />
                                </th>
                                <th style={{ padding: '6px' }}>
                                    <input
                                        type="text"
                                        placeholder="Lọc Máy/Line..."
                                        value={columnFilters.machine}
                                        onChange={(e) => setColumnFilters({ ...columnFilters, machine: e.target.value })}
                                        style={filterInputStyle}
                                    />
                                </th>
                                <th style={{ padding: '6px' }}>
                                    <select
                                        value={columnFilters.result}
                                        onChange={(e) => setColumnFilters({ ...columnFilters, result: e.target.value })}
                                        style={filterSelectStyle}
                                    >
                                        <option value="">Tất cả</option>
                                        <option value="OK">OK</option>
                                        <option value="NG">NG</option>
                                        <option value="USER_OK">User OK</option>
                                    </select>
                                </th>
                                <th style={{ padding: '6px' }}>
                                    <select
                                        value={columnFilters.confirmed}
                                        onChange={(e) => setColumnFilters({ ...columnFilters, confirmed: e.target.value })}
                                        style={filterSelectStyle}
                                    >
                                        <option value="">Tất cả</option>
                                        <option value="HUMAN">Người duyệt</option>
                                        <option value="AUTO">Máy tự động</option>
                                    </select>
                                </th>
                                <th style={{ padding: '6px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>-</th>
                                <th style={{ padding: '6px' }}>
                                    <input
                                        type="text"
                                        placeholder="Lọc người thực hiện..."
                                        value={columnFilters.confirmedBy}
                                        onChange={(e) => setColumnFilters({ ...columnFilters, confirmedBy: e.target.value })}
                                        style={filterInputStyle}
                                    />
                                </th>
                                <th style={{ padding: '6px', textAlign: 'right' }}></th>
                            </tr>
                        )}
                    </thead>
                    <tbody>
                        {filteredResults.length > 0 ? filteredResults.map((item) => (
                            <tr key={item.id} style={getRowStyle(item)}>
                                <td style={{ fontSize: '0.8rem' }}>{new Date(item.time).toLocaleString()}</td>
                                <td style={{ fontWeight: 'bold' }}>{item.pid}</td>
                                <td>
                                    <div style={{ fontSize: '0.85rem' }}>{item.display_name}</div>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                        {item.user_confirmed && item.result === 'OK' && item.machine_result === 'NG' ? (
                                            <span className="badge badge-ok" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.4)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <UserCheck size={12} /> User OK
                                            </span>
                                        ) : (
                                            <span className={`badge ${item.result === 'OK' ? 'badge-ok' : 'badge-ng'}`}>
                                                {item.result}
                                            </span>
                                        )}
                                        {getPcbPriority(item) === 1 && (
                                            <span style={{ fontSize: '0.6rem', color: '#ef4444', fontWeight: 'bold', textShadow: '0 0 10px rgba(239, 68, 68, 0.3)' }}>CRITICAL SHORT</span>
                                        )}
                                        {getPcbPriority(item) === 2 && (
                                            <span style={{ fontSize: '0.6rem', color: '#f59e0b', fontWeight: 'bold' }}>AREA NG</span>
                                        )}
                                    </div>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                    {item.user_confirmed ? (
                                        <div style={{ color: item.result === 'OK' ? '#f59e0b' : 'var(--status-ok)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', fontSize: '0.7rem' }}>
                                            <UserCheck size={12} /> Người duyệt
                                        </div>
                                    ) : (
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Máy tự động</div>
                                    )}
                                </td>
                                <td style={{ textAlign: 'center', fontSize: '0.8rem' }}>
                                    {item.confirmed_at ? new Date(item.confirmed_at).toLocaleString() : <span style={{ color: 'var(--text-secondary)' }}>-</span>}
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
                                <td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
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
                                        <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Shot {img.shot_num || img.image_path.split('_').pop().split('.')[0]}</span>
                                                <span className={`badge ${img.machine_result === 'OK' ? 'badge-ok' : 'badge-ng'}`} style={{ fontSize: '0.6rem' }}>{img.machine_result}</span>
                                            </div>
                                            {img.cause && (
                                                <div style={{ fontSize: '0.65rem', color: '#f87171', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {img.cause}
                                                </div>
                                            )}
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
                            {selectedImage.cause && (
                                <span style={{ color: '#f87171', fontSize: '0.8rem', fontWeight: 'bold', background: 'rgba(239, 68, 68, 0.1)', padding: '2px 10px', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                    Lý do: {selectedImage.cause}
                                </span>
                            )}
                            {selectedImage.user_result !== 'PENDING' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '10px', borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '15px' }}>
                                    <span className={`badge ${selectedImage.user_result === 'OK' ? 'badge-ok' : 'badge-ng'}`} style={{ fontSize: '0.6rem' }}>
                                        User: {selectedImage.user_result}
                                    </span>
                                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>
                                        Bởi: {selectedImage.confirmed_by_name || 'Hệ thống'} lúc {selectedImage.confirmed_at ? new Date(selectedImage.confirmed_at).toLocaleString() : '-'}
                                    </span>
                                </div>
                            )}
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
                                    // Tìm ảnh gốc dựa trên shot_num và image_type
                                     const foundOriginal = selectedPcb?.images?.find(i => 
                                        i.shot_num === selectedImage.shot_num && i.image_type === 'origin'
                                    );
                                    return (foundOriginal ? foundOriginal.image_path : selectedImage.image_path).replace(/\\/g, '/');
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

                            {/* PCB Navigation Buttons */}
                            <div style={{ display: 'flex', gap: '10px', marginLeft: '20px', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '20px' }}>
                                <button className="btn btn-secondary" onClick={handlePrevPcb} title="PCB Trước (A)">
                                    <div style={{ transform: 'rotate(180deg)' }}><ArrowRight size={18} /></div>
                                </button>
                                <button className="btn btn-secondary" onClick={handleNextPcb} title="PCB Sau (D)">
                                    <ArrowRight size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Filmstrip / Thumbnail Bar */}
                        <div style={{ 
                            position: 'absolute', right: '30px', top: '50%', transform: 'translateY(-50%)',
                            display: 'flex', flexDirection: 'column', gap: '10px', padding: '15px',
                            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', borderRadius: '20px',
                            border: '1px solid rgba(255,255,255,0.1)', maxHeight: '70%', overflowY: 'auto',
                            scrollbarWidth: 'none'
                        }}>
                            {pcbImages.map((img, idx) => (
                                <div 
                                    key={img.id}
                                    onClick={() => { setSelectedImage(img); setShowOriginal(false); }}
                                    style={{ 
                                        width: '60px', height: '45px', borderRadius: '8px', overflow: 'hidden', 
                                        cursor: 'pointer', border: selectedImage.id === img.id ? '2px solid var(--primary)' : '2px solid transparent',
                                        transition: 'all 0.2s', opacity: selectedImage.id === img.id ? 1 : 0.5,
                                        position: 'relative'
                                    }}
                                >
                                    <img src={`${API_URL}${img.image_path}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    <div style={{ position: 'absolute', bottom: 1, right: 3, fontSize: '8px', color: 'white', fontWeight: 'bold' }}>
                                        {img.shot_num}
                                    </div>
                                    {img.machine_result === 'NG' && (
                                        <div style={{ position: 'absolute', top: 0, left: 0, width: '6px', height: '6px', background: '#ef4444', borderRadius: '50%', margin: '4px' }} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Trace;
