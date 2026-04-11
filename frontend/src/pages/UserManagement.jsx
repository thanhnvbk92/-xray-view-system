import React, { useState, useEffect } from 'react';
import { UserCheck, UserX, Shield, BadgeCheck, Clock, Users, ShieldAlert } from 'lucide-react';
import { useAuth, api } from '../context/AuthContext';

function UserManagement() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const { user: currentUser } = useAuth();

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            console.log("UserManagement: Fetching users...");
            const res = await api.get('/api/auth/users');
            setUsers(res.data);
        } catch (error) {
            console.error("Error fetching users:", error);
        } finally {
            setLoading(false);
        }
    };

    const AVAILABLE_PERMISSIONS = [
        { id: 'CAN_VIEW_DASHBOARD', name: 'Xem Dashboard' },
        { id: 'CAN_VIEW_REPORTS', name: 'Xem Báo cáo/Truy vết' },
        { id: 'CAN_CONFIRM_RESULTS', name: 'Xác nhận kết quả OK/NG' },
        { id: 'CAN_MANAGE_SYSTEM', name: 'Cấu hình Hệ thống' },
        { id: 'CAN_MANAGE_USERS', name: 'Quản lý Nhân sự' },
    ];

    const [selectedRoles, setSelectedRoles] = useState({});
    const [userPerms, setUserPerms] = useState({}); // { userId: ['PERM1', 'PERM2'] }

    const handleRoleChange = (userId, role) => {
        setSelectedRoles({ ...selectedRoles, [userId]: role });
        
        // Auto-assign default permissions based on role
        let defaultPerms = [];
        if (role === 'ADMIN') {
            defaultPerms = AVAILABLE_PERMISSIONS.map(p => p.id);
        } else if (role === 'OPERATOR') {
            defaultPerms = ['CAN_VIEW_DASHBOARD', 'CAN_VIEW_REPORTS', 'CAN_CONFIRM_RESULTS'];
        } else {
            defaultPerms = ['CAN_VIEW_DASHBOARD', 'CAN_VIEW_REPORTS'];
        }
        setUserPerms({ ...userPerms, [userId]: defaultPerms });
    };

    const togglePermission = (userId, permId) => {
        const current = userPerms[userId] || [];
        if (current.includes(permId)) {
            setUserPerms({ ...userPerms, [userId]: current.filter(p => p !== permId) });
        } else {
            setUserPerms({ ...userPerms, [userId]: [...current, permId] });
        }
    };

    const handleApprove = async (id) => {
        try {
            const role = selectedRoles[id] || "OPERATOR";
            const perms = userPerms[id] || (role === 'OPERATOR' ? ['CAN_VIEW_DASHBOARD', 'CAN_VIEW_REPORTS', 'CAN_CONFIRM_RESULTS'] : ['CAN_VIEW_DASHBOARD', 'CAN_VIEW_REPORTS']);
            
            console.log(`UserManagement: Approving user ${id} with role ${role} and perms`, perms);
            
            // Chuyển danh sách quyền sang JSON string để API parse
            const permsJson = JSON.stringify(perms);
            await api.post(`/api/auth/users/${id}/approve?role=${role}&permissions=${encodeURIComponent(permsJson)}`);
            fetchUsers();
        } catch (error) {
            alert("Lỗi khi phê duyệt người dùng");
        }
    };

    const handleReject = async (id) => {
        if (!window.confirm("Bạn có chắc chắn muốn xóa người dùng này?")) return;
        try {
            console.log(`UserManagement: Rejecting user ${id}`);
            await api.post(`/api/auth/users/${id}/reject`);
            fetchUsers();
        } catch (error) {
            alert("Lỗi khi từ chối người dùng");
        }
    };

    if (currentUser?.role !== 'ADMIN') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '1rem' }}>
                <ShieldAlert size={64} color="var(--status-ng)" />
                <h2>Truy cập bị từ chối</h2>
                <p style={{ color: 'var(--text-secondary)' }}>Bạn không có quyền quản trị để xem trang này.</p>
            </div>
        );
    }

    return (
        <div className="fade-in">
            <div className="dashboard-header">
                <div>
                    <h1>Quản lý Nhân sự</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Phê duyệt và quản lý quyền truy cập hệ thống</p>
                </div>
            </div>

            <div className="data-table-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>NHÂN VIÊN</th>
                            <th>TÀI KHOẢN / MÃ NV</th>
                            <th>VỊ TRÍ</th>
                            <th>QUYỀN HẠN</th>
                            <th style={{ textAlign: 'center' }}>TRẠNG THÁI</th>
                            <th style={{ textAlign: 'right' }}>THAO TÁC</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((item) => (
                            <tr key={item.id}>
                                <td>
                                    <div style={{ fontWeight: 'bold' }}>{item.full_name}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Tham gia: {new Date(item.created_at).toLocaleDateString()}</div>
                                </td>
                                <td>
                                    <div>{item.username}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>MNV: {item.employee_id}</div>
                                </td>
                                <td>{item.position}</td>
                                <td>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: item.role === 'ADMIN' ? 'var(--primary)' : (item.role === 'VIEWER' ? 'var(--text-secondary)' : 'inherit') }}>
                                        {item.role === 'ADMIN' ? <Shield size={14} /> : (item.role === 'VIEWER' ? <Clock size={14} /> : <Users size={14} />)}
                                        {item.role}
                                    </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                    {item.is_approved ? (
                                        <span className="badge badge-ok">ĐÃ PHÊ DUYỆT</span>
                                    ) : (
                                        <span className="badge" style={{ background: 'rgba(255, 193, 7, 0.1)', color: '#ffc107' }}>CHỜ PHÊ DUYỆT</span>
                                    )}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                    {!item.is_approved ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '12px' }}>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <select
                                                    value={selectedRoles[item.id] || "OPERATOR"}
                                                    onChange={(e) => handleRoleChange(item.id, e.target.value)}
                                                    style={{ padding: '6px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'white', fontSize: '0.8rem' }}
                                                >
                                                    <option value="OPERATOR">OPERATOR</option>
                                                    <option value="VIEWER">VIEWER</option>
                                                    <option value="ADMIN">ADMIN</option>
                                                </select>
                                                <button className="btn btn-primary" style={{ padding: '6px 16px', fontSize: '0.8rem' }} onClick={() => handleApprove(item.id)}>
                                                    Xác nhận & Phê duyệt
                                                </button>
                                                <button className="btn" title="Từ chối" style={{ padding: '6px 12px', background: 'rgba(244, 67, 54, 0.1)', color: '#f44336' }} onClick={() => handleReject(item.id)}>
                                                    <UserX size={16} />
                                                </button>
                                            </div>
                                            
                                            {/* Danh sách quyền hạn tùy chỉnh */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', width: '300px', textAlign: 'left' }}>
                                                {AVAILABLE_PERMISSIONS.map(p => (
                                                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', cursor: 'pointer' }}>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={(userPerms[item.id] || (selectedRoles[item.id] === 'ADMIN' ? AVAILABLE_PERMISSIONS.map(x=>x.id) : (selectedRoles[item.id] === 'OPERATOR' ? ['CAN_VIEW_DASHBOARD', 'CAN_VIEW_REPORTS', 'CAN_CONFIRM_RESULTS'] : ['CAN_VIEW_DASHBOARD', 'CAN_VIEW_REPORTS']))).includes(p.id)}
                                                            onChange={() => togglePermission(item.id, p.id)}
                                                        />
                                                        {p.name}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        item.role !== 'ADMIN' && (
                                            <button className="btn" style={{ color: 'var(--status-ng)', fontSize: '0.8rem' }} onClick={() => handleReject(item.id)}>Xóa nhân sự</button>
                                        )
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default UserManagement;
