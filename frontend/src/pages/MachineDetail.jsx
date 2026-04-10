import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, X, Eye, Clock, Hash, Monitor, ShieldAlert } from 'lucide-react';
import { useAuth, api } from '../context/AuthContext';

const API_URL = `http://${window.location.hostname}:8000`;

function MachineDetail() {
    const { user } = useAuth();
    const isViewer = user?.role === 'VIEWER';
    const { id } = useParams();
    const [pcbs, setPcbs] = useState([]);
    const [selectedPcb, setSelectedPcb] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedImage, setSelectedImage] = useState(null);
    const [showOriginal, setShowOriginal] = useState(false);

    const fetchPcbs = async () => {
        setLoading(true);
        try {
            console.log(`MachineDetail: Fetching PCBs for machine ${id}`);
            const res = await api.get(`/api/pcbs/unconfirmed/${id}`);
            setPcbs(res.data);
            setLoading(false);
            if (res.data.length > 0 && !selectedPcb) {
                handlePcbSelect(res.data[0]);
            }
        } catch (error) {
            console.error("Error fetching unconfirmed PCBs:", error);
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
        fetchPcbs();
    }, [id]);

    const handleConfirm = async (result) => {
        if (!selectedPcb || !selectedImage) return;

        try {
            const formData = new FormData();
            formData.append('user_result', result);
            console.log(`MachineDetail: Confirming image ${selectedImage.id} as ${result}`);
            await api.post(`/api/images/confirm/${selectedImage.id}`, formData);

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
                const nextPcbList = res.data;
                setPcbs(nextPcbList);

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

    if (loading) return <div className="loading">Đang tải danh sách PCB...</div>;

    return (
        <div className="fade-in" style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '1rem' }}>
                <Link to="/dashboard" className="back-btn" style={{ margin: 0 }}>
                    <ArrowLeft size={18} />
                </Link>
                <h1 style={{ fontSize: '1.5rem' }}>Máy #{id} - Kiểm duyệt NG</h1>
                <div className="badge badge-ng">{pcbs.length} PCB chờ</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '250px 300px 1fr', gap: '1.5rem', flex: 1, minHeight: 0 }}>
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
                                borderLeft: selectedPcb?.id === pcb.id ? '3px solid var(--primary)' : '3px solid transparent'
                            }}
                        >
                            <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: pcb.final_result === 'OK' ? '#10b981' : '#ef4444' }}>{pcb.pid}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{new Date(pcb.client_time).toLocaleTimeString()}</div>
                        </div>
                    ))}
                </div>

                {/* 2. Danh sách UNIT (Ảnh) của PCB đã chọn */}
                <div className="data-table-container" style={{ overflowY: 'auto' }}>
                    <div style={{ padding: '10px', borderBottom: '1px solid var(--glass-border)', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>DANH SÁCH TỆP TIN</div>
                    {selectedPcb?.images?.filter(img => !img.image_path.toLowerCase().endsWith('_o.jpg') && !img.image_path.toLowerCase().endsWith('_o.png')).map((img) => {
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
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', borderRadius: '20px', padding: '1.5rem', border: '1px solid var(--glass-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <div>
                                    <h3 style={{ fontSize: '1rem', wordBreak: 'break-all' }}>
                                        {(() => {
                                            const fp = selectedImage.image_path.split('/').pop();
                                            if (selectedPcb.pid && fp.includes(selectedPcb.pid)) {
                                                const idx = fp.indexOf(selectedPcb.pid);
                                                return fp.substring(idx + selectedPcb.pid.length + 1);
                                            }
                                            return fp;
                                        })()}
                                    </h3>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>PCB: {selectedPcb.pid}</p>
                                </div>
                                <div className={`badge ${selectedImage.machine_result === 'OK' ? 'badge-ok' : 'badge-ng'}`}>
                                    Máy phát hiện: {selectedImage.machine_result}
                                </div>
                            </div>

                            <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', position: 'relative' }}>
                                {isViewer && (
                                    <div style={{ position: 'absolute', inset: 0, zIndex: 10, cursor: 'not-allowed' }} title="Bạn không có quyền thực hiện thao tác này (VIEWER only)" />
                                )}
                                <button
                                    className="btn btn-primary"
                                    style={{ flex: 1, height: '50px', backgroundColor: 'var(--status-ok)', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: isViewer ? 0.5 : 1 }}
                                    onClick={() => handleConfirm('OK')}
                                    disabled={isViewer}
                                >
                                    <Check size={20} /> XÁC NHẬN OK
                                </button>
                                <button
                                    className="btn"
                                    style={{ flex: 1, height: '50px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--status-ng)', border: '1px solid var(--status-ng)', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: isViewer ? 0.5 : 1 }}
                                    onClick={() => handleConfirm('NG')}
                                    disabled={isViewer}
                                >
                                    <X size={20} /> GIỮ KẾT QUẢ NG
                                </button>
                            </div>

                            <div style={{ flex: 1, background: '#000', borderRadius: '15px', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10 }}>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ background: showOriginal ? 'var(--primary)' : 'rgba(255,255,255,0.1)', color: 'white', display: 'flex', alignItems: 'center', gap: '8px', border: 'none' }}
                                        onClick={() => setShowOriginal(!showOriginal)}
                                    >
                                        <Eye size={16} /> {showOriginal ? "Show Marked Image" : "Show Original Image"}
                                    </button>
                                </div>
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
                                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                />
                                {showOriginal && (
                                    <div style={{ position: 'absolute', bottom: '10px', left: '10px', background: 'rgba(245, 158, 11, 0.8)', color: 'black', padding: '4px 12px', borderRadius: '5px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                        VIEWING ORIGINAL IMAGE (UNMARKED)
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
        </div>
    );
}

export default MachineDetail;
