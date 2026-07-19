import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, X, Eye, Clock, Hash, Monitor, ShieldAlert, Filter, ZoomIn, ZoomOut, Maximize, Move } from 'lucide-react';
import { useAuth, api } from '../context/AuthContext';

const API_URL = import.meta.env.DEV 
    ? `http://${window.location.hostname}:8000` 
    : `http://${window.location.hostname}:${window.location.port}`;

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
    const [onlyShowNg, setOnlyShowNg] = useState(true);
    const [totalUnconfirmed, setTotalUnconfirmed] = useState(0);
    const [isImageLoading, setIsImageLoading] = useState(false);

    // Kích hoạt trạng thái loading khi thay đổi ảnh hiển thị
    useEffect(() => {
        if (selectedImage) {
            setIsImageLoading(true);
        }
    }, [selectedImage?.id, showOriginal]);


    // Modal states
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalScale, setModalScale] = useState(1);
    const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
    const [isModalDragging, setIsModalDragging] = useState(false);
    const [modalDragStart, setModalDragStart] = useState({ x: 0, y: 0 });

    // Hàm tính toán độ ưu tiên của PCB dựa trên nguyên nhân lỗi
    const getPcbPriority = (pcb) => {
        if (!pcb.images || pcb.images.length === 0) return 3;
        
        const causes = pcb.images.map(img => img.cause || "");
        if (causes.some(c => c === "Short")) return 1;
        if (causes.some(c => c === "Area_NG")) return 2;
        return 3;
    };

    // Hàm lấy danh sách ảnh hiển thị cho PCB (đồng bộ giữa UI và phím tắt)
    const getDisplayImages = (pcb) => {
        if (!pcb || !pcb.images) return [];
        
        // Bước 1: Lọc ảnh marked/không origin chưa confirm theo bộ lọc onlyShowNg
        let filtered = pcb.images.filter(img => {
            if (img.image_type === 'origin') return false;
            if (img.user_result !== 'PENDING') return false;
            if (onlyShowNg) return img.machine_result === 'NG';
            return true;
        });
        
        // Khi đang chỉ duyệt NG, không chuyển sang ảnh OK/PENDING.
        // Nếu không còn NG nào, handleConfirm phải nhận biết PCB đã duyệt xong
        // và tự chuyển sang PCB NG tiếp theo.
        if (filtered.length === 0 && !onlyShowNg) {
            filtered = pcb.images.filter(img => {
                if (img.image_type === 'origin') return false;
                if (img.user_result !== 'PENDING') return false;
                return true;
            });
        }
        
        // Chỉ chế độ xem tất cả mới fallback sang ảnh đã duyệt.
        // Ở chế độ chỉ duyệt NG, danh sách rỗng là tín hiệu để chuyển PCB.
        if (filtered.length === 0 && !onlyShowNg) {
            filtered = pcb.images.filter(img => img.image_type !== 'origin');
        }
        
        return filtered;
    };

    // Sắp xếp danh sách PCB
    const sortedPcbs = [...pcbs].sort((a, b) => {
        const priorityA = getPcbPriority(a);
        const priorityB = getPcbPriority(b);
        
        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }
        
        // Cùng ưu tiên thì thằng nào mới hơn lên trước
        return new Date(b.client_time) - new Date(a.client_time);
    });

    const getPcbRowStyle = (pcb, isSelected) => {
        const priority = getPcbPriority(pcb);
        let baseStyle = {
            padding: '12px 15px', borderBottom: '1px solid var(--glass-border)', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', gap: '4px'
        };

        if (isSelected) {
            baseStyle.background = 'rgba(59, 130, 246, 0.15)';
            baseStyle.borderLeft = '3px solid var(--primary)';
        } else {
            if (priority === 1) {
                baseStyle.background = 'rgba(239, 68, 68, 0.1)';
                baseStyle.borderLeft = '3px solid #ef4444';
            } else if (priority === 2) {
                baseStyle.background = 'rgba(245, 158, 11, 0.05)';
                baseStyle.borderLeft = '3px solid #f59e0b';
            } else {
                baseStyle.borderLeft = '3px solid transparent';
            }
        }
        return baseStyle;
    };

    // Tự động tải ngầm thông minh (Dynamic Sliding Window Preloading) với AbortController và Debounce
    useEffect(() => {
        if (!selectedPcb || sortedPcbs.length === 0) return;

        // Tạo AbortController để hủy bỏ các request preload cũ khi người dùng chuyển PCB nhanh
        const controller = new AbortController();

        // Sử dụng Debounce 300ms nhằm trì hoãn việc preload khi người dùng đang bấm phím lướt qua nhanh
        const debounceTimer = setTimeout(() => {
            // Tìm chỉ mục của PCB hiện tại
            const currentIndex = sortedPcbs.findIndex(p => p.id === selectedPcb.id);
            if (currentIndex === -1) return;

            // Xác định danh sách các PCB nằm trong cửa sổ trượt (hiện tại + 2 cái tiếp theo)
            const pcbsToPreload = [];
            pcbsToPreload.push(selectedPcb); // Luôn ưu tiên tải trước các shot khác của PCB hiện tại

            if (currentIndex + 1 < sortedPcbs.length) {
                pcbsToPreload.push(sortedPcbs[currentIndex + 1]);
            }
            if (currentIndex + 2 < sortedPcbs.length) {
                pcbsToPreload.push(sortedPcbs[currentIndex + 2]);
            }

            console.log(`MachineDetail: Dynamic preloading for PCB indices:`, pcbsToPreload.map(p => p.pid));

            pcbsToPreload.forEach((pcb) => {
                if (pcb.images && pcb.images.length > 0) {
                    pcb.images.forEach(img => {
                        // 1. Tải trước ảnh lỗi (NG)
                        if (img.machine_result === 'NG') {
                            const imageUrl = `${API_URL}${img.image_path}`;
                            fetch(imageUrl, { signal: controller.signal }).catch(err => {
                                if (err.name !== 'AbortError') {
                                    console.warn(`Preload error for ${imageUrl}:`, err);
                                }
                            });
                        }

                        // 2. Tải trước cả ảnh gốc (Original) tương ứng của shot này để khi ấn SPACE đổi ảnh gốc/lỗi không bị trễ
                        const foundOriginal = pcb.images.find(i => 
                            i.shot_num === img.shot_num && i.image_type === 'origin'
                        );
                        if (foundOriginal) {
                            const originalUrl = `${API_URL}${foundOriginal.image_path}`;
                            fetch(originalUrl, { signal: controller.signal }).catch(err => {
                                if (err.name !== 'AbortError') {
                                    console.warn(`Preload error for ${originalUrl}:`, err);
                                }
                            });
                        }
                    });
                }
            });
        }, 300); // 300ms debounce

        // Cleanup: Hủy timer và abort mọi kết nối mạng tải trước đang chạy dở
        return () => {
            clearTimeout(debounceTimer);
            controller.abort();
        };
    }, [selectedPcb?.id, pcbs]);

    const fetchData = async () => {
        setLoading(true);
        try {
            console.log(`MachineDetail: Fetching data for machine ${id}`);
            const [resPcbs, resMachine] = await Promise.all([
                api.get(`/api/pcbs/unconfirmed/${id}`),
                api.get(`/api/machines/${id}`)
            ]);
            
            const fetchedPcbs = resPcbs.data.pcbs;
            setPcbs(fetchedPcbs);
            setTotalUnconfirmed(resPcbs.data.total);
            setMachineInfo(resMachine.data);
            
            setLoading(false);

            if (fetchedPcbs.length > 0 && !selectedPcb) {
                handlePcbSelect(fetchedPcbs[0]);
            }
        } catch (error) {
            console.error("Error fetching machine results:", error);
            if (error.response?.status !== 401) setLoading(false);
        }
    };

    const handlePcbSelect = async (pcb) => {
        try {
            // TỐI ƯU: Nếu pcb đã có sẵn images (từ API unconfirmed), dùng luôn không cần fetch lại
            let imagesToUse = pcb.images;

            if (!imagesToUse || imagesToUse.length === 0) {
                console.log(`MachineDetail: Images missing, fetching for PCB ${pcb.id}`);
                const res = await api.get(`/api/pcbs/${pcb.id}/images`);
                imagesToUse = res.data;
            } else {
                console.log(`MachineDetail: Using existing images for PCB ${pcb.id}`);
            }
            
            // Chuẩn hóa dữ liệu cho các bản ghi cũ hoặc sai image_type/shot_num
            const normalizedImages = imagesToUse.map(img => {
                let s_num = img.shot_num;
                // Sửa lỗi DB tự động gán mặc định 'origin': kiểm tra thực tế tên file
                const pathLower = img.image_path.toLowerCase();
                const isOriginFile = pathLower.includes('_o.') || pathLower.includes('_o.jpg') || pathLower.includes('_o.png');
                const i_type = isOriginFile ? 'origin' : 'marked';
                
                if (!s_num) {
                    const match = img.image_path.match(/(\d+)(?:_o)?\.[^.]+$/);
                    s_num = match ? parseInt(match[1]) : 1;
                }
                
                return { ...img, shot_num: s_num, image_type: i_type };
            });

            const updatedPcb = { ...pcb, images: normalizedImages };
            setSelectedPcb(updatedPcb);

            // Lấy danh sách ảnh hiển thị (đồng bộ giữa UI và logic duyệt)
            const browsable = getDisplayImages(updatedPcb);

            // Tìm ảnh chưa duyệt (PENDING) đầu tiên trong danh sách browsable
            const nextPending = browsable.find(img => img.user_result === 'PENDING');
            
            // Nếu có ảnh chưa duyệt thì chọn, nếu không thì lấy ảnh đầu tiên trong browsable (nếu có), nếu không có ảnh browsable nào thì set null
            setSelectedImage(nextPending || browsable[0] || null);
        } catch (error) {
            console.error("Error fetching images for PCB:", error);
        }
    };

    useEffect(() => {
        fetchData();
    }, [id]);

    // Đồng bộ ảnh được chọn khi bật/tắt bộ lọc onlyShowNg
    useEffect(() => {
        if (selectedPcb && selectedImage) {
            const browsable = getDisplayImages(selectedPcb);
            const isCurrentImageBrowsable = browsable.some(img => img.id === selectedImage.id);
            
            if (!isCurrentImageBrowsable) {
                const nextPending = browsable.find(img => img.user_result === 'PENDING');
                setSelectedImage(nextPending || browsable[0] || null);
            }
        }
    }, [onlyShowNg, selectedPcb?.id]);

    const handleConfirm = (result) => {
        if (!selectedPcb || !selectedImage) return;

        // Lưu bản sao tham chiếu của các đối tượng đang xác nhận
        const confirmedImage = selectedImage;
        const confirmedPcb = selectedPcb;

        // 1. Cập nhật state local ngay lập tức (Optimistic UI)
        const updatedImages = confirmedPcb.images.map(img => {
            // Cập nhật kết quả cho ảnh hiện tại và mọi ảnh có cùng shot_num (cả gốc và marked)
            if (img.id === confirmedImage.id || img.shot_num === confirmedImage.shot_num) {
                return { ...img, user_result: result };
            }
            return img;
        });

        const updatedPcb = { ...confirmedPcb, images: updatedImages };
        setSelectedPcb(updatedPcb);

        // 2. Tìm ảnh tiếp theo cần duyệt trong danh sách browsable
        const browsable = getDisplayImages(updatedPcb);
        
        // Tìm ảnh chưa duyệt (PENDING) tiếp theo trong danh sách browsable
        const nextPending = browsable.find(img => img.user_result === 'PENDING');

        if (nextPending) {
            setSelectedImage(nextPending);
            setShowOriginal(false);
            // Cập nhật mảng pcbs để đồng bộ
            setPcbs(prevPcbs => prevPcbs.map(p => p.id === confirmedPcb.id ? updatedPcb : p));
        } else {
            // Đã duyệt hết tất cả các ảnh cần duyệt của PCB này -> Chuyển nhanh sang PCB tiếp theo trong danh sách sortedPcbs
            console.log("MachineDetail: PCB finished, transitioning locally first...");
            
            // Tìm PCB tiếp theo trong sortedPcbs
            const currentIndex = sortedPcbs.findIndex(p => p.id === confirmedPcb.id);
            let nextPcb = null;
            if (currentIndex !== -1 && currentIndex + 1 < sortedPcbs.length) {
                nextPcb = sortedPcbs[currentIndex + 1];
            } else {
                // Nếu là phần tử cuối hoặc không tìm thấy, lấy phần tử đầu tiên khác confirmedPcb
                const remaining = sortedPcbs.filter(p => p.id !== confirmedPcb.id);
                if (remaining.length > 0) {
                    nextPcb = remaining[0];
                }
            }

            // Loại bỏ PCB đã duyệt hoàn toàn khỏi danh sách
            setPcbs(prevPcbs => prevPcbs.filter(p => p.id !== confirmedPcb.id));
            setTotalUnconfirmed(prev => Math.max(0, prev - 1));

            if (nextPcb) {
                handlePcbSelect(nextPcb);
            } else {
                setSelectedPcb(null);
                setSelectedImage(null);
            }
        }

        // 3. Gửi API call confirm
        const formData = new FormData();
        formData.append('user_result', result);
        console.log(`MachineDetail: Confirming image ${confirmedImage.id} as ${result}`);
        
        api.post(`/api/pcbs/confirm-image/${confirmedImage.id}`, formData)
            .then(() => {
                console.log("Confirm success.");
                // Chỉ gọi API làm mới danh sách PCB khi toàn bộ ảnh của PCB hiện tại đã duyệt xong
                if (!nextPending) {
                    console.log("PCB completely reviewed. Fetching fresh unconfirmed list...");
                    api.get(`/api/pcbs/unconfirmed/${id}`).then(res => {
                        // Phòng thủ 2 lớp: Lọc bỏ PCB vừa confirm ra khỏi danh sách mới nhận từ server
                        const freshPcbList = res.data.pcbs.filter(p => p.id !== confirmedPcb.id);
                        setPcbs(freshPcbList);
                        setTotalUnconfirmed(res.data.total);
                    }).catch(err => {
                        console.error("Error refreshing PCB list in background:", err);
                    });
                }
            })
            .catch(error => {
                console.error("Error confirming unit/PCB in background:", error);
            });
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
            
            // Nếu ảnh đang tải, chặn tất cả phím tắt điều hướng/xác nhận khác để tránh race condition
            if (isImageLoading) {
                if ([' ', '1', '2', '3', 'ArrowRight', 'ArrowLeft', 'd', 'D', 'a', 'A'].includes(e.key)) {
                    e.preventDefault();
                    return;
                }
            }

            // Phím tắt Toggle Gốc/Lỗi
            if (e.key === ' ' && (isModalOpen || selectedImage)) {
                e.preventDefault();
                setShowOriginal(prev => !prev);
            }

            // Phím tắt xác nhận (1: OK, 2: NG)
            if (selectedImage && !isViewer) {
                if (e.key === '1') { e.preventDefault(); handleConfirm('OK'); }
                if (e.key === '2') { e.preventDefault(); handleConfirm('NG'); }
                if (e.key === '3') { e.preventDefault(); handleNextNgImage(); } // Bỏ qua shot này
            }

            // Điều hướng Shot (Mũi tên)
            if (e.key === 'ArrowRight') handleNextNgImage();
            if (e.key === 'ArrowLeft') handlePrevNgImage();

            // Điều hướng PCB (A/D)
            if (e.key === 'd' || e.key === 'D') handleNextPcb();
            if (e.key === 'a' || e.key === 'A') handlePrevPcb();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isModalOpen, selectedImage, selectedPcb, pcbs, isViewer, isImageLoading, onlyShowNg]);



    const handleNextNgImage = () => {
        if (!selectedPcb || !selectedImage) return;
        
        const browsable = getDisplayImages(selectedPcb);
        const currentIndex = browsable.findIndex(img => img.id === selectedImage.id);
        
        if (currentIndex !== -1 && currentIndex < browsable.length - 1) {
            setSelectedImage(browsable[currentIndex + 1]);
            setShowOriginal(false);
        } else if (browsable.length > 0) {
            setSelectedImage(browsable[0]);
            setShowOriginal(false);
        } else {
            handleNextPcb();
        }
    };

    const handlePrevNgImage = () => {
        if (!selectedPcb || !selectedImage) return;
        
        const browsable = getDisplayImages(selectedPcb);
        const currentIndex = browsable.findIndex(img => img.id === selectedImage.id);
        
        if (currentIndex > 0) {
            setSelectedImage(browsable[currentIndex - 1]);
            setShowOriginal(false);
        } else if (browsable.length > 0) {
            setSelectedImage(browsable[browsable.length - 1]);
            setShowOriginal(false);
        }
    };

    const handleNextPcb = () => {
        const pcbIndex = sortedPcbs.findIndex(p => p.id === selectedPcb?.id);
        if (pcbIndex !== -1 && pcbIndex < sortedPcbs.length - 1) {
            handlePcbSelect(sortedPcbs[pcbIndex + 1]);
        }
    };

    const handlePrevPcb = () => {
        const pcbIndex = sortedPcbs.findIndex(p => p.id === selectedPcb?.id);
        if (pcbIndex > 0) {
            handlePcbSelect(sortedPcbs[pcbIndex - 1]);
        }
    };

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
                    <div style={{ padding: '10px', borderBottom: '1px solid var(--glass-border)', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                        <span>DANH SÁCH PCB</span>
                        <span>{pcbs.findIndex(p => p.id === selectedPcb?.id) + 1} / {pcbs.length}</span>
                    </div>
                    {sortedPcbs.map(pcb => (
                        <div
                            key={pcb.id}
                            onClick={() => { if (!isImageLoading) handlePcbSelect(pcb); }}
                            style={{
                                ...getPcbRowStyle(pcb, selectedPcb?.id === pcb.id),
                                cursor: isImageLoading ? 'not-allowed' : 'pointer',
                                opacity: isImageLoading ? 0.6 : 1
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: pcb.final_result === 'OK' ? '#10b981' : '#ef4444', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                    <span>{pcb.pid} {pcb.array_index > 0 && <span style={{ fontWeight: 'normal', color: 'var(--text-secondary)', fontSize: '0.7rem', marginLeft: '5px' }}>[#{pcb.array_index}]</span>}</span>
                                    {getPcbPriority(pcb) === 1 && <span style={{ fontSize: '0.6rem', color: '#ef4444', border: '1px solid #ef4444', padding: '1px 4px', borderRadius: '3px' }}>SHORT</span>}
                                    {getPcbPriority(pcb) === 2 && <span style={{ fontSize: '0.6rem', color: '#f59e0b', border: '1px solid #f59e0b', padding: '1px 4px', borderRadius: '3px' }}>AREA</span>}
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
                    {getDisplayImages(selectedPcb).map((img, index) => {
                        const fullPath = img.image_path.split('/').pop();
                        // Làm gọn tên file: Bỏ tất cả tiền tố trước và bao gồm cả PID_
                        let fileName = fullPath;
                        if (selectedPcb.pid && fullPath.includes(selectedPcb.pid)) {
                            const pidIndex = fullPath.indexOf(selectedPcb.pid);
                            fileName = fullPath.substring(pidIndex + selectedPcb.pid.length + 1);
                        }

                        const currentResult = img.user_result !== 'PENDING' ? img.user_result : img.machine_result;

                        return (
                            <div
                                key={img.id}
                                onClick={() => {
                                    if (!isImageLoading) {
                                        setSelectedImage(img);
                                        setShowOriginal(false);
                                    }
                                }}
                                style={{
                                    padding: '12px 15px', borderBottom: '1px solid var(--glass-border)',
                                    cursor: isImageLoading ? 'not-allowed' : 'pointer',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    background: selectedImage?.id === img.id ? 'rgba(255, 255, 255, 0.05)' : '',
                                    opacity: isImageLoading ? 0.6 : (img.user_result !== 'PENDING' ? 0.5 : 1)
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: '0.75rem',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        maxWidth: '200px',
                                        color: currentResult === 'OK' ? '#10b981' : '#ef4444',
                                        fontWeight: currentResult === 'NG' ? 'bold' : 'normal'
                                    }}
                                    title={fileName}
                                >
                                    {img.image_type === 'origin' ? 'Original' : `Shot ${img.shot_num || (index + 1)}`}
                                </span>
                                <span className={`badge ${currentResult === 'OK' ? 'badge-ok' : 'badge-ng'}`} style={{ fontSize: '0.6rem' }}>
                                    {currentResult}
                                </span>
                                {img.cause && (
                                    <div style={{ fontSize: '0.6rem', color: '#f87171', marginTop: '2px', fontStyle: 'italic', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {img.cause}
                                    </div>
                                )}
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
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
                                    <div className={`badge ${selectedImage.machine_result === 'OK' ? 'badge-ok' : 'badge-ng'}`} style={{ padding: '4px 8px', fontSize: '0.65rem' }}>
                                        Máy: {selectedImage.machine_result}
                                    </div>
                                    {selectedImage.cause && (
                                        <div style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 'bold', background: 'rgba(239, 68, 68, 0.1)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                            Nguyên nhân: {selectedImage.cause}
                                        </div>
                                    )}
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
                                    style={{ 
                                        height: '45px', 
                                        minWidth: '150px', 
                                        backgroundColor: 'var(--status-ok)', 
                                        fontSize: '0.9rem', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center', 
                                        gap: '8px', 
                                        opacity: (isViewer || isImageLoading) ? 0.5 : 1, 
                                        fontWeight: 'bold', 
                                        boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)',
                                        cursor: (isViewer || isImageLoading) ? 'not-allowed' : 'pointer'
                                    }}
                                    onClick={() => handleConfirm('OK')}
                                    disabled={isViewer || isImageLoading}
                                    title="Phím tắt: 1"
                                >
                                    {isImageLoading ? (
                                        <>
                                            <Clock className="animate-spin" size={18} /> ĐANG TẢI...
                                        </>
                                    ) : (
                                        <>
                                            <Check size={18} /> (1) XÁC NHẬN OK
                                        </>
                                    )}
                                </button>
                                <button
                                    className="btn"
                                    style={{ 
                                        height: '45px', 
                                        minWidth: '150px', 
                                        backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                                        color: 'var(--status-ng)', 
                                        border: '1px solid var(--status-ng)', 
                                        fontSize: '0.9rem', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center', 
                                        gap: '8px', 
                                        opacity: (isViewer || isImageLoading) ? 0.5 : 1, 
                                        fontWeight: 'bold',
                                        cursor: (isViewer || isImageLoading) ? 'not-allowed' : 'pointer'
                                    }}
                                    onClick={() => handleConfirm('NG')}
                                    disabled={isViewer || isImageLoading}
                                    title="Phím tắt: 2"
                                >
                                    {isImageLoading ? (
                                        <>
                                            <Clock className="animate-spin" size={18} /> ĐANG TẢI...
                                        </>
                                    ) : (
                                        <>
                                            <X size={18} /> (2) GIỮ KẾT QUẢ NG
                                        </>
                                    )}
                                </button>

                                <div style={{ display: 'flex', gap: '10px', marginLeft: '10px', borderLeft: '1px solid var(--glass-border)', paddingLeft: '20px' }}>
                                    <button 
                                        className="btn btn-secondary" 
                                        onClick={() => { if (!isImageLoading) handlePrevPcb(); }} 
                                        disabled={isImageLoading}
                                        style={{ opacity: isImageLoading ? 0.5 : 1, cursor: isImageLoading ? 'not-allowed' : 'pointer' }}
                                        title="PCB Trước (A)"
                                    >
                                        <div style={{ transform: 'rotate(180deg)' }}><ArrowRight size={18} /></div>
                                    </button>
                                    <button 
                                        className="btn btn-secondary" 
                                        onClick={() => { if (!isImageLoading) handleNextPcb(); }} 
                                        disabled={isImageLoading}
                                        style={{ opacity: isImageLoading ? 0.5 : 1, cursor: isImageLoading ? 'not-allowed' : 'pointer' }}
                                        title="PCB Sau (D)"
                                    >
                                        <ArrowRight size={18} />
                                    </button>
                                </div>
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
                                {isImageLoading && (
                                    <div style={{
                                        position: 'absolute',
                                        inset: 0,
                                        background: 'rgba(0, 0, 0, 0.65)',
                                        backdropFilter: 'blur(4px)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '12px',
                                        zIndex: 5,
                                        color: 'white'
                                    }}>
                                        <div style={{
                                            width: '40px',
                                            height: '40px',
                                            border: '3px solid rgba(255, 255, 255, 0.1)',
                                            borderTopColor: 'var(--primary)',
                                            borderRadius: '50%',
                                            animation: 'spin 1s linear infinite'
                                        }} />
                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '500' }}>
                                            Đang tải ảnh chất lượng cao...
                                        </span>
                                    </div>
                                )}
                                <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10 }}>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ 
                                            background: showOriginal ? 'var(--primary)' : 'rgba(255,255,255,0.1)', 
                                            color: 'white', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '8px', 
                                            border: 'none', 
                                            padding: '6px 12px', 
                                            fontSize: '0.75rem',
                                            opacity: isImageLoading ? 0.5 : 1,
                                            cursor: isImageLoading ? 'not-allowed' : 'pointer'
                                        }}
                                        onClick={() => { if (!isImageLoading) setShowOriginal(!showOriginal); }}
                                        disabled={isImageLoading}
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
                                            // Tìm ảnh gốc dựa trên shot_num
                                            const foundOriginal = selectedPcb.images.find(i => 
                                                i.shot_num === selectedImage.shot_num && i.image_type === 'origin'
                                            );
                                            return foundOriginal ? foundOriginal.image_path : selectedImage.image_path;
                                        })()}`}
                                        alt="Preview"
                                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', pointerEvents: 'none' }}
                                        onDragStart={(e) => e.preventDefault()}
                                        onLoad={() => setIsImageLoading(false)}
                                        onError={() => setIsImageLoading(false)}
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
                                style={{ 
                                    background: showOriginal ? 'var(--primary)' : 'rgba(255,255,255,0.1)', 
                                    color: 'white', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '8px',
                                    opacity: isImageLoading ? 0.5 : 1,
                                    cursor: isImageLoading ? 'not-allowed' : 'pointer'
                                }}
                                onClick={() => { if (!isImageLoading) setShowOriginal(!showOriginal); }}
                                disabled={isImageLoading}
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
                        {isImageLoading && (
                            <div style={{
                                position: 'absolute',
                                inset: 0,
                                background: 'rgba(0, 0, 0, 0.65)',
                                backdropFilter: 'blur(4px)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '12px',
                                zIndex: 5,
                                color: 'white'
                            }}>
                                <div style={{
                                    width: '40px',
                                    height: '40px',
                                    border: '3px solid rgba(255, 255, 255, 0.1)',
                                    borderTopColor: 'var(--primary)',
                                    borderRadius: '50%',
                                    animation: 'spin 1s linear infinite'
                                }} />
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '500' }}>
                                    Đang tải ảnh chất lượng cao...
                                </span>
                            </div>
                        )}
                        <div style={{
                            width: '100%', height: '100%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transform: `scale(${modalScale}) translate(${modalPosition.x / modalScale}px, ${modalPosition.y / modalScale}px)`,
                            transition: isModalDragging ? 'none' : 'transform 0.15s ease-out'
                        }}>
                             <img
                                src={`${API_URL}${(() => {
                                    if (!showOriginal) return selectedImage.image_path;
                                    const foundOriginal = selectedPcb.images.find(i => 
                                        i.shot_num === selectedImage.shot_num && i.image_type === 'origin'
                                    );
                                    return foundOriginal ? foundOriginal.image_path : selectedImage.image_path;
                                })()}`}
                                alt="Inspection"
                                style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain', pointerEvents: 'none', filter: 'drop-shadow(0 0 20px rgba(0,0,0,0.5))' }}
                                onLoad={() => setIsImageLoading(false)}
                                onError={() => setIsImageLoading(false)}
                            />
                        </div>

                        {/* Floating Tooltips in Modal */}
                        <div style={{ position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '15px', alignItems: 'center', zIndex: 10 }}>
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
                                <button 
                                    className="btn btn-primary" 
                                    style={{ 
                                        background: 'var(--status-ok)', 
                                        border: 'none', 
                                        height: '45px', 
                                        padding: '0 25px',
                                        opacity: isImageLoading ? 0.5 : 1,
                                        cursor: isImageLoading ? 'not-allowed' : 'pointer'
                                    }} 
                                    onClick={() => { if (!isImageLoading) { handleConfirm('OK'); setIsModalOpen(false); } }}
                                    disabled={isImageLoading}
                                >
                                    <Check size={20} /> XÁC NHẬN OK
                                </button>
                                <button 
                                    className="btn" 
                                    style={{ 
                                        background: 'rgba(239,68,68,0.2)', 
                                        border: '1px solid #ef4444', 
                                        color: '#ef4444', 
                                        height: '45px', 
                                        padding: '0 25px',
                                        opacity: isImageLoading ? 0.5 : 1,
                                        cursor: isImageLoading ? 'not-allowed' : 'pointer'
                                    }} 
                                    onClick={() => { if (!isImageLoading) { handleConfirm('NG'); setIsModalOpen(false); } }}
                                    disabled={isImageLoading}
                                >
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
