import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, X, Eye, Clock, Hash, Monitor, ShieldAlert, Filter, ZoomIn, ZoomOut, Maximize, Move } from 'lucide-react';
import { useAuth, api } from '../context/AuthContext';

const API_URL = `http://${window.location.hostname}:8000`;

function MachineDetail() {
    const { user } = useAuth();
    const isViewer = user?.role === 'VIEWER';
    const { id } = useParams();
    const [pcbs, setPcbs] = useState([]);
    const [selectedPcb, setSelectedPcb] = useState(null);
    const [loading, setLoading] = useState(true);
    const [machineInfo, setMachineInfo] = useState(null); // Thêm state lưu thông tin máy
    const [selectedImage, setSelectedImage] = useState(null);
    const [showOriginal, setShowOriginal] = useState(false);
    const [onlyShowNg, setOnlyShowNg] = useState(false);
    const [totalUnconfirmed, setTotalUnconfirmed] = useState(0);

    // Modal states
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalScale, setModalScale] = useState(1);
    const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
    const [isModalDragging, setIsModalDragging] = useState(false);
    const [modalDragStart, setModalDragStart] = useState({ x: 0, y: 0 });

    const fetchData = async () => {
        setLoading(true);
        try {
            console.log(`MachineDetail: Fetching data for machine ${id}`);
            const [resPcbs, resMachine] = await Promise.all([
                api.get(`/api/pcbs/unconfirmed/${id}`),
                api.get(`/api/machines/${id}`)
            ]);
            
            setPcbs(resPcbs.data.pcbs);
            setTotalUnconfirmed(resPcbs.data.total);
            setMachineInfo(resMachine.data);
            
            setLoading(false);
            if (resPcbs.data.pcbs.length > 0 && !selectedPcb) {
                handlePcbSelect(resPcbs.data.pcbs[0]);
            }
        } catch (error) {
            console.error("Error fetching machine results:", error);
            if (error.response?.status !== 401) setLoading(false);
        }
    };

    const handlePcbSelect = async (pcb) => {
        try {
            console.log(`MachineDetail: Fetching images for PCB ${pcb.id}`);
            const res = await api.get(`/api/pcbs/${pcb.id}/images`);
            const images = res.data;
            const updatedPcb = { ...pcb, images };
            setSelectedPcb(updatedPcb);

            const firstNg = images.find(img => img.machine_result === 'NG');
            setSelectedImage(firstNg || images[0]);
        } catch (error) {
            console.error("Error fetching images for PCB:", error);
        }
    };

    useEffect(() => {
        fetchData();
    }, [id]);

    const handleConfirm = async (result) => {
        if (!selectedPcb || !selectedImage) return;

        try {
            const formData = new FormData();
            formData.append('user_result', result);
            console.log(`MachineDetail: Confirming image ${selectedImage.id} as ${result}`);
            await api.post(`/api/pcbs/confirm-image/${selectedImage.id}`, formData);

            // 2. Cập nhật state local ngay để giao diện đổi màu
            const updatedImages = selectedPcb.images.map(img => {
                if (img.id === selectedImage.id) return { ...img, machine_result: result };

                // Logic tìm ảnh gốc tương ứng (JS standard)
                const imgPath = selectedImage.image_path;
                const lastDot = imgPath.lastIndexOf('.');
                const bPath = lastDot !== -1 ? imgPath.substring(0, lastDot) : imgPath;
                const ext = lastDot !== -1 ? imgPath.substring(lastDot) : '';

                if (img.image_path === `${bPath}_o${ext}`) return { ...img, machine_result: result };
                return img;
            });

            const updatedPcb = { ...selectedPcb, images: updatedImages };
            setSelectedPcb(updatedPcb);

            // 3. Tìm ảnh NG tiếp theo (Chỉ tìm trong ảnh marked)
            const markedImages = updatedImages.filter(img => !img.image_path.toLowerCase().endsWith('_o.jpg') && !img.image_path.toLowerCase().endsWith('_o.png'));
            const currentImgIdx = markedImages.findIndex(img => img.id === selectedImage.id);
            const nextNgInCurrent = markedImages.slice(currentImgIdx + 1).find(img => img.machine_result === 'NG');

            if (nextNgInCurrent) {
                setSelectedImage(nextNgInCurrent);
                setShowOriginal(false);
            } else {
                // Đã duyệt hết NG của PCB này -> Load lại danh sách PCB và chuyển sang cái tiếp
                console.log("MachineDetail: PCB finished, reloading list...");
                const res = await api.get(`/api/pcbs/unconfirmed/${id}`);
                const nextPcbList = res.data.pcbs;
                setPcbs(nextPcbList);
                setTotalUnconfirmed(res.data.total);

                if (nextPcbList.length > 0) {
                    const stillCurrent = nextPcbList.find(p => p.id === selectedPcb.id);
                    if (stillCurrent) {
                        handlePcbSelect(stillCurrent);
                    } else {
                        handlePcbSelect(nextPcbList[0]);
                    }
                } else {
                    setSelectedPcb(null);
                    setSelectedImage(null);
                }
            }
        } catch (error) {
            console.error("Error confirming unit/PCB:", error);
        }
    };

    // Reset zoom when image changes
    useEffect(() => {
        setModalScale(1);
        setModalPosition({ x: 0, y: 0 });
    }, [selectedImage?.id]);

    // Handle key events
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') setIsModalOpen(false);
            if (e.key === ' ' && isModalOpen) { // Space to toggle Original/Marked only when modal is open
                e.preventDefault();
                setShowOriginal(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isModalOpen]);

    const handleModalWheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.2 : 0.2;
        const newScale = Math.min(Math.max(modalScale + delta, 0.5), 10);
        
        // Luôn zoom tại trung tâm hoặc cải tiến: zoom tại vị trí chuột
        // Để đơn giản và mượt mà, ta sử dụng zoom tâm kèm kéo thả
        setModalScale(newScale);
    };

    const onModalMouseDown = (e) => {
        setIsModalDragging(true);
        setModalDragStart({ x: e.clientX - modalPosition.x, y: e.clientY - modalPosition.y });
    };

    const onModalMouseMove = (e) => {
        if (isModalDragging) {
            setModalPosition({
                x: e.clientX - modalDragStart.x,
                y: e.clientY - modalDragStart.y
            });
        }
    };

    const onModalMouseUp = () => setIsModalDragging(false);

    if (loading) return <div className="loading">Đang tải danh sách PCB...</div>;

    return (
        <div className="fade-in" style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '1rem' }}>
                <Link to="/dashboard" className="back-btn" style={{ margin: 0 }}>
                    <ArrowLeft size={18} />
                </Link>
                <h1 style={{ fontSize: '1.5rem' }}>
                    {machineInfo ? (
                        `Máy ${machineInfo.name} - ${machineInfo.line_name} (${machineInfo.machine_type_name})`
                    ) : (
                        `Máy #${id} - Kiểm duyệt NG`
                    )}
                </h1>
                <div className="badge badge-ng">{totalUnconfirmed} PCB chờ</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '320px 300px 1fr', gap: '1.5rem', flex: 1, minHeight: 0 }}>
                {/* 1. Danh sách PCB bên trái */}
                <div className="data-table-container" style={{ overflowY: 'auto' }}>
                    <div style={{ padding: '10px', borderBottom: '1px solid var(--glass-border)', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>DANH SÁCH PCB</div>
                    {pcbs.map(pcb => (
                        <div
                            key={pcb.id}
                            onClick={() => handlePcbSelect(pcb)}
                            style={{
                                padding: '12px 15px', borderBottom: '1px solid var(--glass-border)', cursor: 'pointer',
                                background: selectedPcb?.id === pcb.id ? 'rgba(59, 130, 246, 0.1)' : '',
                                borderLeft: selectedPcb?.id === pcb.id ? '3px solid var(--primary)' : '3px solid transparent',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: pcb.final_result === 'OK' ? '#10b981' : '#ef4444' }}>
                                    {pcb.pid} {pcb.array_index > 0 && <span style={{ fontWeight: 'normal', color: 'var(--text-secondary)', fontSize: '0.7rem', marginLeft: '5px' }}>[#{pcb.array_index}]</span>}
                                </div>
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                {new Date(pcb.client_time).toLocaleString('vi-VN', { 
                                    day: '2-digit', month: '2-digit', year: 'numeric',
                                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                                    hour12: false 
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* 2. Danh sách UNIT (Ảnh) của PCB đã chọn */}
                <div className="data-table-container" style={{ overflowY: 'auto' }}>
                    <div style={{ padding: '10px', borderBottom: '1px solid var(--glass-border)', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>DANH SÁCH TỆP TIN</span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '0.7rem', color: onlyShowNg ? 'var(--status-ng)' : 'var(--text-secondary)' }}>
                            <input 
                                type="checkbox" 
                                checked={onlyShowNg} 
                                onChange={(e) => setOnlyShowNg(e.target.checked)}
                                style={{ cursor: 'pointer' }}
                            />
                            <Filter size={12} /> CHỈ HIỆN NG
                        </label>
                    </div>
                    {selectedPcb?.images?.filter(img => {
                        const isOriginal = img.image_path.toLowerCase().endsWith('_o.jpg') || img.image_path.toLowerCase().endsWith('_o.png');
                        if (isOriginal) return false;
                        if (onlyShowNg) return img.machine_result === 'NG';
                        return true;
                    }).map((img) => {
                        const fullPath = img.image_path.split('/').pop();
                        // Làm gọn tên file: Bỏ tất cả tiền tố trước và bao gồm cả PID_
                        let fileName = fullPath;
                        if (selectedPcb.pid && fullPath.includes(selectedPcb.pid)) {
                            const pidIndex = fullPath.indexOf(selectedPcb.pid);
                            fileName = fullPath.substring(pidIndex + selectedPcb.pid.length + 1);
                        }

                        return (
                            <div
                                key={img.id}
                                onClick={() => {
                                    setSelectedImage(img);
                                    setShowOriginal(false);
                                }}
                                style={{
                                    padding: '12px 15px', borderBottom: '1px solid var(--glass-border)', cursor: 'pointer',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    background: selectedImage?.id === img.id ? 'rgba(255, 255, 255, 0.05)' : ''
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: '0.75rem',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        maxWidth: '200px',
                                        color: img.machine_result === 'OK' ? '#10b981' : '#ef4444',
                                        fontWeight: img.machine_result === 'NG' ? 'bold' : 'normal'
                                    }}
                                    title={fileName}
                                >
                                    {fileName}
                                </span>
                                <span className={`badge ${img.machine_result === 'OK' ? 'badge-ok' : 'badge-ng'}`} style={{ fontSize: '0.6rem' }}>
                                    {img.machine_result}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* 3. Hiển thị ảnh lớn và điều khiển */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {selectedImage ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', borderRadius: '20px', padding: '1rem', border: '1px solid var(--glass-border)', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', gap: '1rem' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <h3 style={{ fontSize: '0.9rem', wordBreak: 'break-all', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {(() => {
                                            const fp = selectedImage.image_path.split('/').pop();
                                            if (selectedPcb.pid && fp.includes(selectedPcb.pid)) {
                                                const idx = fp.indexOf(selectedPcb.pid);
                                                return fp.substring(idx + selectedPcb.pid.length + 1);
                                            }
                                            return fp;
                                        })()}
                                    </h3>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', gap: '10px' }}>
                                        <span>PCB: <strong style={{color: 'var(--text-main)'}}>{selectedPcb.pid}</strong></span>
                                        <span>Job: <code style={{ color: 'var(--accent-blue)' }}>{selectedPcb.job_file || 'N/A'}</code></span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <div className={`badge ${selectedImage.machine_result === 'OK' ? 'badge-ok' : 'badge-ng'}`} style={{ padding: '4px 8px', fontSize: '0.65rem' }}>
                                        Máy: {selectedImage.machine_result}
                                    </div>
                                </div>
                            </div>

                            {/* Action Row - Centered and Large */}
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginBottom: '1rem', position: 'relative' }}>
                                {isViewer && (
                                    <div style={{ position: 'absolute', inset: 0, zIndex: 10, cursor: 'not-allowed' }} />
                                )}
                                <button
                                    className="btn btn-primary"
                                    style={{ height: '45px', minWidth: '150px', backgroundColor: 'var(--status-ok)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: isViewer ? 0.5 : 1, fontWeight: 'bold', boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)' }}
                                    onClick={() => handleConfirm('OK')}
                                    disabled={isViewer}
                                >
                                    <Check size={18} /> XÁC NHẬN OK
                                </button>
                                <button
                                    className="btn"
                                    style={{ height: '45px', minWidth: '150px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--status-ng)', border: '1px solid var(--status-ng)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: isViewer ? 0.5 : 1, fontWeight: 'bold' }}
                                    onClick={() => handleConfirm('NG')}
                                    disabled={isViewer}
                                >
                                    <X size={18} /> GIỮ KẾT QUẢ NG
                                </button>
                            </div>
                            <div 
                                style={{ 
                                    flex: 1, 
                                    background: '#000', 
                                    borderRadius: '15px', 
                                    overflow: 'hidden', 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    position: 'relative',
                                    maxHeight: '75vh', // Increased image height by ~20% as requested
                                }}
                            >
                                <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10 }}>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ background: showOriginal ? 'var(--primary)' : 'rgba(255,255,255,0.1)', color: 'white', display: 'flex', alignItems: 'center', gap: '8px', border: 'none', padding: '6px 12px', fontSize: '0.75rem' }}
                                        onClick={() => setShowOriginal(!showOriginal)}
                                    >
                                        <Eye size={14} /> {showOriginal ? "HIỆN ẢNH LỖI" : "HIỆN ẢNH GỐC"}
                                    </button>
                                </div>
                                <div style={{ 
                                    width: '100%', 
                                    height: '100%', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    cursor: 'zoom-in'
                                }}
                                onClick={() => setIsModalOpen(true)}
                                >
                                    <img
                                        src={`${API_URL}${(() => {
                                            if (!showOriginal) return selectedImage.image_path;
                                            // Tìm ảnh gốc tương ứng (_o.jpg)
                                            const basePath = selectedImage.image_path.substring(0, selectedImage.image_path.lastIndexOf('.'));
                                            const ext = selectedImage.image_path.substring(selectedImage.image_path.lastIndexOf('.'));
                                            const originalPath = `${basePath}_o${ext}`;
                                            const foundOriginal = selectedPcb.images.find(i => i.image_path === originalPath);
                                            return foundOriginal ? foundOriginal.image_path : selectedImage.image_path;
                                        })()}`}
                                        alt="Preview"
                                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', pointerEvents: 'none' }}
                                        onDragStart={(e) => e.preventDefault()}
                                    />
                                </div>
                                {showOriginal && (
                                    <div style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(245, 158, 11, 0.8)', color: 'black', padding: '4px 12px', borderRadius: '5px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                        ORIGINAL
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div style={{ flex: 1, border: '2px dashed var(--glass-border)', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                            Hãy chọn một PCB để bắt đầu kiểm duyệt
                        </div>
                    )}
                </div>
            </div>

            {/* Premium Image Inspector Modal */}
            {isModalOpen && selectedImage && (
                <div 
                    style={{
                        position: 'fixed', inset: 0, zIndex: 9999,
                        background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)',
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
                            <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                                <X size={18} /> ĐÓNG (ESC)
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
                                    const basePath = selectedImage.image_path.substring(0, selectedImage.image_path.lastIndexOf('.'));
                                    const ext = selectedImage.image_path.substring(selectedImage.image_path.lastIndexOf('.'));
                                    const originalPath = `${basePath}_o${ext}`;
                                    const foundOriginal = selectedPcb.images.find(i => i.image_path === originalPath);
                                    return foundOriginal ? foundOriginal.image_path : selectedImage.image_path;
                                })()}`}
                                alt="Inspection"
                                style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain', pointerEvents: 'none', filter: 'drop-shadow(0 0 20px rgba(0,0,0,0.5))' }}
                            />
                        </div>

                        {/* Floating Tooltips in Modal */}
                        <div style={{ position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '15px', alignItems: 'center' }}>
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

                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button className="btn btn-primary" style={{ background: 'var(--status-ok)', border: 'none', height: '45px', padding: '0 25px' }} onClick={() => {handleConfirm('OK'); setIsModalOpen(false);}}>
                                    <Check size={20} /> XÁC NHẬN OK
                                </button>
                                <button className="btn" style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444', color: '#ef4444', height: '45px', padding: '0 25px' }} onClick={() => {handleConfirm('NG'); setIsModalOpen(false);}}>
                                    <X size={20} /> GIỮ NG
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default MachineDetail;
