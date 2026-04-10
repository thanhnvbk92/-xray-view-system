import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Cpu, User, Lock, ArrowRight, Loader2, AlertCircle } from 'lucide-react';

function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await login(username, password);
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
                <div className="logo-area" style={{ justifyContent: 'center', marginBottom: '2rem' }}>
                    <Cpu color="#3b82f6" size={48} />
                    <h1 style={{ fontSize: '1.75rem' }}>X-RAY VISION</h1>
                </div>

                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Đăng nhập Hệ thống</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Vui lòng nhập tài khoản nhân viên để tiếp tục</p>
                </div>

                {error && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--status-ng)', color: 'var(--status-ng)', padding: '0.75rem', borderRadius: '10px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>TÀI KHOẢN</label>
                        <div style={{ position: 'relative' }}>
                            <User size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
                            <input
                                type="text"
                                placeholder="Username"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                style={{ width: '100%', padding: '12px 12px 12px 40px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '12px', color: 'white' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>MẬT KHẨU</label>
                        <div style={{ position: 'relative' }}>
                            <Lock size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
                            <input
                                type="password"
                                placeholder="••••••••"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                style={{ width: '100%', padding: '12px 12px 12px 40px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '12px', color: 'white' }}
                            />
                        </div>
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={loading} style={{ height: '48px', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '1rem' }}>
                        {loading ? <Loader2 className="animate-spin" /> : <>Vào hệ thống <ArrowRight size={18} /></>}
                    </button>
                </form>

                <div style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Chưa có tài khoản? <Link to="/register" style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Đăng ký ngay</Link>
                </div>
            </div>
        </div>
    );
}

export default Login;
