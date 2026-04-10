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
            const res = await api.get('/api/admin/users');
            setUsers(res.data);
        } catch (error) {
            console.error("Error fetching users:", error);
        } finally {
            setLoading(false);
        }
    };

    const [selectedRoles, setSelectedRoles] = useState({});

    const handleRoleChange = (userId, role) => {
        setSelectedRoles({ ...selectedRoles, [userId]: role });
    };

    const handleApprove = async (id) => {
        try {
            const role = selectedRoles[id] || "OPERATOR";
            console.log(`UserManagement: Approving user ${id} with role ${role}`);
            await api.post(`/api/admin/users/${id}/approve?role=${role}`);
            fetchUsers();
        } catch (error) {
            alert("Lỗi khi phê duyệt người dùng");
        }
    };

    const handleReject = async (id) => {
        if (!window.confirm("Bạn có chắc chắn muốn xóa người dùng này?")) return;
        try {
            console.log(`UserManagement: Rejecting user ${id}`);
            await api.post(`/api/admin/users/${id}/reject`);
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
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', alignItems: 'center' }}>
                                            <select
                                                value={selectedRoles[item.id] || "OPERATOR"}
                                                onChange={(e) => handleRoleChange(item.id, e.target.value)}
                                                style={{ padding: '6px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'white', fontSize: '0.8rem' }}
                                            >
                                                <option value="OPERATOR">OPERATOR</option>
                                                <option value="VIEWER">VIEWER</option>
                                                <option value="ADMIN">ADMIN</option>
                                            </select>
                                            <button className="btn" title="Phê duyệt" style={{ padding: '6px 12px', background: 'rgba(76, 175, 80, 0.1)', color: '#4caf50' }} onClick={() => handleApprove(item.id)}>
                                                <UserCheck size={16} />
                                            </button>
                                            <button className="btn" title="Từ chối" style={{ padding: '6px 12px', background: 'rgba(244, 67, 54, 0.1)', color: '#f44336' }} onClick={() => handleReject(item.id)}>
                                                <UserX size={16} />
                                            </button>
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
