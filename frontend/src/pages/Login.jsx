import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Cpu, User, Lock, ArrowRight, Loader2, AlertCircle } from 'lucide-react';

function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [rememberUsername, setRememberUsername] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    // Khởi tạo: đọc username từ localStorage nếu có
    useEffect(() => {
        const savedUsername = localStorage.getItem('xray_saved_username');
        if (savedUsername) {
            setUsername(savedUsername);
            setRememberUsername(true);
        }
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        
        try {
            await login(username, password);
            // Xử lý Ghi nhớ Tên đăng nhập
            if (rememberUsername) {
                localStorage.setItem('xray_saved_username', username);
            } else {
                localStorage.removeItem('xray_saved_username');
            }
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.detail || "Đăng nhập thất bại. Vui lòng kiểm tra lại.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page fade-in">
            <div className="login-card">
                <div className="logo-area" style={{ justifyContent: 'center', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img src="/favicon.svg" alt="X-Ray Vision Logo" style={{ width: 44, height: 44, borderRadius: '10px' }} />
                    <h1 style={{ fontSize: '1.75rem', margin: 0 }}>X-RAY VISION</h1>
                </div>

                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', fontWeight: '700' }}>Đăng nhập Hệ thống</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Vui lòng nhập tài khoản nhân viên để tiếp tục</p>
                </div>

                {error && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--status-ng)', padding: '0.85rem', borderRadius: '12px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                        <AlertCircle size={18} />
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>TÀI KHOẢN</label>
                        <div className="login-input-wrapper">
                            <User size={18} />
                            <input
                                type="text"
                                placeholder="Nhập username..."
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>MẬT KHẨU</label>
                        <div className="login-input-wrapper">
                            <Lock size={18} />
                            <input
                                type="password"
                                placeholder="••••••••"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Checkbox Ghi nhớ Tên đăng nhập */}
                    <label className="checkbox-container">
                        <input
                            type="checkbox"
                            checked={rememberUsername}
                            onChange={(e) => setRememberUsername(e.target.checked)}
                        />
                        Nhớ tên đăng nhập
                    </label>

                    <button type="submit" className="btn btn-primary" disabled={loading} style={{ height: '50px', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '1rem', fontWeight: '600' }}>
                        {loading ? <Loader2 className="animate-spin" /> : <>Đăng nhập ngay <ArrowRight size={18} /></>}
                    </button>
                </form>

                <div style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    Chưa có tài khoản? <Link to="/register" style={{ color: 'var(--primary)', fontWeight: '600', textDecoration: 'none' }}>Đăng ký ngay</Link>
                </div>
            </div>
        </div>
    );
}

export default Login;
