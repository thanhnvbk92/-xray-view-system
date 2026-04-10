import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Cpu, User, Lock, UserPlus, ArrowRight, Loader2, AlertCircle, Briefcase, BadgeCheck, UserCircle } from 'lucide-react';
import { api } from '../context/AuthContext';

function Register() {
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        confirmPassword: '',
        full_name: '',
        employee_id: '',
        position: ''
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Check password match
        if (formData.password !== formData.confirmPassword) {
            setError("Mật khẩu nhập lại không khớp!");
            return;
        }

        setLoading(true);
        setError('');
        try {
            // Gửi dữ liệu không bao gồm confirmPassword lên backend
            const { confirmPassword, ...registerData } = formData;
            console.log("Register: Sending registration request...");
            await api.post('/api/auth/register', registerData);
            setSuccess(true);
            setTimeout(() => navigate('/login'), 3000);
        } catch (err) {
            console.error("Register error:", err);
            let msg = "Đăng ký thất bại. Vui lòng thử lại.";
            if (err.response?.data?.detail) {
                const detail = err.response.data.detail;
                if (typeof detail === 'string') {
                    msg = detail;
                } else if (Array.isArray(detail)) {
                    // Pydantic validation error format
                    msg = detail.map(d => `${d.loc[d.loc.length - 1]}: ${d.msg}`).join(", ");
                }
            }
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="login-page fade-in">
                <div className="login-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
                    <div style={{ color: 'var(--status-ok)', marginBottom: '1.5rem' }}>
                        <BadgeCheck size={64} style={{ margin: '0 auto' }} />
                    </div>
                    <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Đăng ký thành công!</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                        Tài khoản của bạn đã được gửi tới Admin phê duyệt.
                        Bạn sẽ được chuyển hướng về trang Đăng nhập trong giây lát...
                    </p>
                    <Link to="/login" className="btn btn-primary" style={{ display: 'inline-block' }}>Đăng nhập ngay</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="login-page fade-in">
            <div className="login-card" style={{ maxWidth: '500px' }}>
                <div className="logo-area" style={{ justifyContent: 'center', marginBottom: '1.5rem' }}>
                    <Cpu color="#3b82f6" size={32} />
                    <h1 style={{ fontSize: '1.5rem' }}>X-RAY VISION</h1>
                </div>

                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>Tạo tài khoản nhân viên</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Điền thông tin để đăng ký tham gia hệ thống hậu kiểm X-Ray</p>
                </div>

                {error && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--status-ng)', color: 'var(--status-ng)', padding: '0.75rem', borderRadius: '10px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: 'span 2' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>TÀI KHOẢN (SỬ DỤNG ĐỂ ĐĂNG NHẬP)</label>
                        <div style={{ position: 'relative' }}>
                            <UserCircle size={16} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--text-secondary)' }} />
                            <input name="username" type="text" placeholder="Ví dụ: van_a_operator" required value={formData.username} onChange={handleChange}
                                style={{ width: '100%', padding: '10px 10px 10px 35px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '10px', color: 'white', fontSize: '0.9rem' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: 'span 2' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>MẬT KHẨU</label>
                        <div style={{ position: 'relative' }}>
                            <Lock size={16} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--text-secondary)' }} />
                            <input name="password" type="password" placeholder="Mật khẩu bảo mật" required value={formData.password} onChange={handleChange}
                                style={{ width: '100%', padding: '10px 10px 10px 35px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '10px', color: 'white', fontSize: '0.9rem' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: 'span 2' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>NHẬP LẠI MẬT KHẨU</label>
                        <div style={{ position: 'relative' }}>
                            <Lock size={16} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--text-secondary)' }} />
                            <input name="confirmPassword" type="password" placeholder="Xác nhận lại mật khẩu" required value={formData.confirmPassword} onChange={handleChange}
                                style={{ width: '100%', padding: '10px 10px 10px 35px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '10px', color: 'white', fontSize: '0.9rem' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: 'span 2' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>HỌ VÀ TÊN</label>
                        <div style={{ position: 'relative' }}>
                            <User size={16} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--text-secondary)' }} />
                            <input name="full_name" type="text" placeholder="Nguyễn Văn A" required value={formData.full_name} onChange={handleChange}
                                style={{ width: '100%', padding: '10px 10px 10px 35px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '10px', color: 'white', fontSize: '0.9rem' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>MÃ NHÂN VIÊN</label>
                        <div style={{ position: 'relative' }}>
                            <BadgeCheck size={16} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--text-secondary)' }} />
                            <input name="employee_id" type="text" placeholder="STAFF123" required value={formData.employee_id} onChange={handleChange}
                                style={{ width: '100%', padding: '10px 10px 10px 35px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '10px', color: 'white', fontSize: '0.9rem' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>VỊ TRÍ / CHỨC VỤ</label>
                        <div style={{ position: 'relative' }}>
                            <Briefcase size={16} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--text-secondary)' }} />
                            <input name="position" type="text" placeholder="Operator" required value={formData.position} onChange={handleChange}
                                style={{ width: '100%', padding: '10px 10px 10px 35px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '10px', color: 'white', fontSize: '0.9rem' }}
                            />
                        </div>
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={loading} style={{ gridColumn: 'span 2', height: '42px', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        {loading ? <Loader2 className="animate-spin" /> : <>Gửi yêu cầu đăng ký <UserPlus size={18} /></>}
                    </button>
                </form>

                <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Đã có tài khoản? <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Quay lại Đăng nhập</Link>
                </div>
            </div>
        </div>
    );
}

export default Register;
