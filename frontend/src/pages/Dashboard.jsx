import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity, CheckCircle2, AlertTriangle, TrendingUp, Monitor,
  Cpu, UserCheck, Clock, ArrowRight
} from 'lucide-react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import { api } from '../context/AuthContext';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const total = data.ok + data.ng;
    const okPercent = total > 0 ? ((data.ok / total) * 100).toFixed(1) : 0;
    const ngPercent = total > 0 ? ((data.ng / total) * 100).toFixed(1) : 0;
    const aiPercent = total > 0 ? ((data.ai_ok / total) * 100).toFixed(1) : 0;
    const userPercent = total > 0 ? ((data.user_ok / total) * 100).toFixed(1) : 0;

    return (
      <div style={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '12px', color: '#fff', fontSize: '0.85rem', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
        <p style={{ marginBottom: '8px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Ngày {label}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <div style={{ color: '#fff' }}>Total: {total}</div>
          <div style={{ color: '#22c55e' }}>OK: {data.ok} ({okPercent}%)</div>
          <div style={{ color: '#ef4444' }}>NG: {data.ng} ({ngPercent}%)</div>
          <div style={{ color: '#8b5cf6', marginTop: '5px' }}>AI OK: {data.ai_ok} ({aiPercent}%)</div>
          <div style={{ color: '#f59e0b' }}>User OK: {data.user_ok} ({userPercent}%)</div>
          <div style={{ color: 'var(--text-secondary)', marginTop: '5px', paddingTop: '5px', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' }}>Tỉ lệ NG thực tế: {data.ng_rate}%</div>
        </div>
      </div>
    );
  }
};

function Dashboard() {
  const [machines, setMachines] = useState([]);
  const [stats, setStats] = useState({ total: 0, ok: 0, ng: 0, ai_ok: 0, user_ok: 0, ng_rate: 0 });
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  const handleMachineClick = (id) => {
    console.log(`Dashboard: Navigating to machine ${id}`);
    navigate(`/machine/${id}`);
  };

  const fetchData = async () => {
    try {
      const [resSummary, resStats, resTrends] = await Promise.all([
        api.get('/api/dashboard/summary'),
        api.get('/api/dashboard/stats'),
        api.get('/api/dashboard/trends')
      ]);
      setMachines(resSummary.data);
      setStats(resStats.data);
      setTrends(resTrends.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // 10s auto refresh
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="loading">Đang tải dữ liệu vận hành...</div>;

  return (
    <div className="fade-in">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>Hệ thống Giám sát X-Ray</h1>
          <p style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={16} /> Cập nhật lúc: {new Date().toLocaleTimeString()}
          </p>
        </div>
        <div className="badge badge-ok" style={{ padding: '8px 15px' }}>Hệ thống Online</div>
      </header>

      {/* 1. Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#3b82f6' }}><Activity size={24} /></div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Tổng PCB hôm nay</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: 'var(--status-ok)' }}><CheckCircle2 size={24} /></div>
          <div className="stat-value">{stats.ok} ({stats.ok_rate}%)</div>
          <div className="stat-label">Kết quả OK</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: 'var(--status-ng)' }}><AlertTriangle size={24} /></div>
          <div className="stat-value" style={{ color: 'var(--status-ng)' }}>{stats.ng} ({stats.ng_rate}%)</div>
          <div className="stat-label">Kết quả NG</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#8b5cf6' }}><Cpu size={24} /></div>
          <div className="stat-value">{stats.ai_ok} ({stats.ai_ok_rate}%)</div>
          <div className="stat-label">AI detected OK</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#f59e0b' }}><UserCheck size={24} /></div>
          <div className="stat-value">{stats.user_ok} ({stats.user_ok_rate}%)</div>
          <div className="stat-label">User confirmed OK</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '2rem' }}>
        {/* Left: Trend Chart */}
        <div className="data-table-container" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2rem' }}>
            <TrendingUp size={20} /> Xu hướng sản lượng & Chất lượng (7 ngày)
          </h3>
          <div style={{ flex: 1, minHeight: '350px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends}>
                <defs>
                  <linearGradient id="colorOk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorNg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                <YAxis yAxisId="left" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} dx={-10} />
                <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" fontSize={12} tickLine={false} axisLine={false} dx={10} unit="%" />
                <Tooltip content={<CustomTooltip />} />
                <Area yAxisId="left" type="monotone" dataKey="ok" stroke="#22c55e" fillOpacity={1} fill="url(#colorOk)" strokeWidth={3} name="Tổng OK" />
                <Area yAxisId="left" type="monotone" dataKey="ng" stroke="#ef4444" fillOpacity={1} fill="url(#colorNg)" strokeWidth={3} name="Tổng NG" />
                <Line yAxisId="right" type="monotone" dataKey="ng_rate" stroke="#ff4dff" strokeWidth={2} name="Tỉ lệ NG (%)" dot={{ r: 4 }} />
                <Line yAxisId="left" type="monotone" dataKey="ai_ok" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" name="AI OK" dot={false} />
                <Line yAxisId="left" type="monotone" dataKey="user_ok" stroke="#f59e0b" strokeWidth={2} strokeDasharray="3 3" name="User OK" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Machine List */}
        <div className="data-table-container" style={{ padding: '1.5rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
            <Monitor size={20} /> Trạng thái các máy quét
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {machines.map(m => (
              <div
                key={m.id}
                className={`machine-card ${m.has_ng ? 'has-ng' : 'is-ok'}`}
                style={{ cursor: 'pointer', margin: 0, padding: '1rem' }}
                onClick={() => handleMachineClick(m.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '10px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Monitor size={20} color={m.has_ng ? 'var(--status-ng)' : 'var(--status-ok)'} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 'bold' }}>{m.name}</div>
                      <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>Line: {m.line_name}</div>
                    </div>
                  </div>
                  <span className={`machine-status-badge ${m.has_ng ? 'status-ng' : 'status-ok'}`}>
                    {m.has_ng ? 'Cần xử lý' : 'OK'}
                  </span>
                </div>

                {m.has_ng && (
                  <div style={{ marginTop: '1rem', background: 'rgba(239, 68, 68, 0.1)', padding: '8px 12px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--status-ng)', fontWeight: '600' }}>{m.unconfirmed_ng_count} PCB chờ duyệt</span>
                    <ArrowRight size={14} color="var(--status-ng)" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
