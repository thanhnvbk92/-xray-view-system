import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity, CheckCircle2, AlertTriangle, TrendingUp, Monitor,
  Cpu, UserCheck, Clock, ArrowRight
} from 'lucide-react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LabelList
} from 'recharts';
import { api } from '../context/AuthContext';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const total = (data.ok || 0) + (data.ng || 0);
    const ai_ok = data.ai_ok || 0;
    const user_ok = data.user_ok || 0;
    
    const okPercent = total > 0 ? (( (data.ok || 0) / total) * 100).toFixed(1) : "0.0";
    const ngPercent = total > 0 ? (( (data.ng || 0) / total) * 100).toFixed(1) : "0.0";
    const aiPercent = total > 0 ? ((ai_ok / total) * 100).toFixed(1) : "0.0";
    const userPercent = total > 0 ? ((user_ok / total) * 100).toFixed(1) : "0.0";

    return (
      <div style={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '12px', color: '#fff', fontSize: '0.85rem', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
        <p style={{ marginBottom: '8px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Ngày {label}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <div style={{ color: '#fff' }}>Total: {total}</div>
          <div style={{ color: '#22c55e' }}>OK: {data.ok || 0} ({okPercent}%)</div>
          <div style={{ color: '#ef4444' }}>NG: {data.ng || 0} ({ngPercent}%)</div>
          <div style={{ color: '#06b6d4', marginTop: '5px' }}>AI OK: {ai_ok} ({aiPercent}%)</div>
          <div style={{ color: '#f59e0b' }}>User OK: {user_ok} ({userPercent}%)</div>
          <div style={{ color: 'var(--text-secondary)', marginTop: '5px', paddingTop: '5px', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' }}>Tỉ lệ NG thực tế: {data.ng_rate || 0}%</div>
        </div>
      </div>
    );
  }
};

function Dashboard() {
  // Khởi tạo state từ cache nếu có (Instant Display)
  const getCache = (key, fallback) => {
    const cached = sessionStorage.getItem(key);
    return cached ? JSON.parse(cached) : fallback;
  };

  const [machines, setMachines] = useState(() => getCache('dash_machines', []));
  const [stats, setStats] = useState(() => getCache('dash_stats', { total: 0, ok: 0, ng: 0, ai_ok: 0, user_ok: 0, ng_rate: 0 }));
  const [trends, setTrends] = useState(() => getCache('dash_trends', []));
  const [loading, setLoading] = useState(!sessionStorage.getItem('dash_stats'));

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
      const trendsWithLabels = (resTrends.data || []).map(t => {
        const total = t.ok + t.ng;
        const okPerc = total > 0 ? ((t.ok / total) * 100).toFixed(1) : "0.0";
        const ngPerc = total > 0 ? ((t.ng / total) * 100).toFixed(1) : "0.0";
        const aiPerc = total > 0 ? ((t.ai_ok / total) * 100).toFixed(1) : "0.0";
        const userPerc = total > 0 ? ((t.user_ok / total) * 100).toFixed(1) : "0.0";
        return {
          ...t,
          okLabel: `${t.ok} (${okPerc}%)`,
          ngLabel: `${t.ng} (${ngPerc}%)`,
          aiLabel: `${t.ai_ok} (${aiPerc}%)`,
          userLabel: `${t.user_ok} (${userPerc}%)`,
          rateLabel: `${t.ng_rate}%`
        };
      });

      setMachines(resSummary.data);
      setStats(resStats.data);
      setTrends(trendsWithLabels);
      
      // Lưu vào cache cho lần sau
      sessionStorage.setItem('dash_machines', JSON.stringify(resSummary.data));
      sessionStorage.setItem('dash_stats', JSON.stringify(resStats.data));
      sessionStorage.setItem('dash_trends', JSON.stringify(trendsWithLabels));
      
      setLoading(false);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    }
  };

  // Logic phân nhóm máy theo Line
  const groupedByLine = machines.reduce((acc, m) => {
    const line = m.line_name || 'Khác';
    if (!acc[line]) acc[line] = [];
    acc[line].push(m);
    return acc;
  }, {});

  // Tính tổng số PCB chờ duyệt trên toàn hệ thống
  const totalUnconfirmed = machines.reduce((sum, m) => sum + (m.unconfirmed_ng_count || 0), 0);

  useEffect(() => {
    // Xóa cache cũ một lần để đảm bảo dữ liệu Map mới được áp dụng
    if (!sessionStorage.getItem('v1.1_fix')) {
      sessionStorage.clear();
      sessionStorage.setItem('v1.1_fix', 'true');
    }
    fetchData();
    const interval = setInterval(fetchData, 10000); // 10s auto refresh
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="loading">Đang tải dữ liệu vận hành...</div>;

  const pendingRate = stats.total > 0 ? ((totalUnconfirmed / stats.total) * 100).toFixed(1) : "0.0";

  return (
    <div className="fade-in">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>Hệ thống Giám sát X-Ray <span style={{fontSize: '0.8rem', opacity: 0.5}}>(v1.1)</span></h1>
          <p style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={16} /> Cập nhật lúc: {new Date().toLocaleTimeString()}
          </p>
        </div>
        <div className="badge badge-ok" style={{ padding: '8px 15px' }}>Hệ thống Online</div>
      </header>

      {/* 1. Stats Grid - Thu gọn để tiết kiệm diện tích */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="stat-card" style={{ borderLeft: '3px solid #f59e0b', padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="stat-icon" style={{ color: '#f59e0b', padding: '6px' }}><AlertTriangle size={18} /></div>
            <div className="stat-label" style={{ fontSize: '0.75rem' }}>Chờ duyệt</div>
          </div>
          <div className="stat-value" style={{ color: '#f59e0b', fontSize: '1.25rem', marginTop: '4px' }}>
            {totalUnconfirmed} <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>({pendingRate}%)</span>
          </div>
        </div>
        <div className="stat-card" style={{ padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="stat-icon" style={{ color: '#3b82f6', padding: '6px' }}><Activity size={18} /></div>
            <div className="stat-label" style={{ fontSize: '0.75rem' }}>Tổng quét</div>
          </div>
          <div className="stat-value" style={{ fontSize: '1.25rem', marginTop: '4px' }}>{stats.total}</div>
        </div>
        <div className="stat-card" style={{ padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="stat-icon" style={{ color: 'var(--status-ok)', padding: '6px' }}><CheckCircle2 size={18} /></div>
            <div className="stat-label" style={{ fontSize: '0.75rem' }}>OK</div>
          </div>
          <div className="stat-value" style={{ fontSize: '1.25rem', marginTop: '4px' }}>{stats.ok} <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>({stats.ok_rate}%)</span></div>
        </div>
        <div className="stat-card" style={{ padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="stat-icon" style={{ color: 'var(--status-ng)', padding: '6px' }}><AlertTriangle size={18} /></div>
            <div className="stat-label" style={{ fontSize: '0.75rem' }}>NG</div>
          </div>
          <div className="stat-value" style={{ color: 'var(--status-ng)', fontSize: '1.25rem', marginTop: '4px' }}>{stats.ng} <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>({stats.ng_rate}%)</span></div>
        </div>
        <div className="stat-card" style={{ padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="stat-icon" style={{ color: '#8b5cf6', padding: '6px' }}><Cpu size={18} /></div>
            <div className="stat-label" style={{ fontSize: '0.75rem' }}>AI Detect</div>
          </div>
          <div className="stat-value" style={{ fontSize: '1.25rem', marginTop: '4px' }}>{stats.ai_ok} <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>({stats.ai_ok_rate}%)</span></div>
        </div>
      </div>

      {/* 2. Main Area: Biểu đồ trên - Máy dưới */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        
        {/* 2.1 Trend Chart (Full Width) */}
        <div className="data-table-container" style={{ padding: '1rem', background: 'rgba(15, 23, 42, 0.4)' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', fontSize: '0.9rem' }}>
            <TrendingUp size={18} /> Xu hướng vận hành hệ thống (7 ngày)
          </h3>
          <div style={{ height: '300px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends} margin={{ top: 20, right: 50, left: 10, bottom: 10 }}>
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
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area yAxisId="left" type="monotone" dataKey="ok" stroke="#22c55e" fillOpacity={1} fill="url(#colorOk)" strokeWidth={3} name="OK">
                  <LabelList dataKey="okLabel" position="top" style={{ fill: '#22c55e', fontSize: '9px', fontWeight: 'bold' }} offset={10} />
                </Area>
                <Area yAxisId="left" type="monotone" dataKey="ng" stroke="#ef4444" fillOpacity={1} fill="url(#colorNg)" strokeWidth={2} name="NG">
                  <LabelList dataKey="ngLabel" position="top" style={{ fill: '#ef4444', fontSize: '10px', fontWeight: 'bold' }} offset={12} />
                </Area>
                <Line yAxisId="left" type="monotone" dataKey="ai_ok" stroke="#06b6d4" strokeWidth={3} name="AI OK" dot={{ r: 4, fill: '#06b6d4' }}>
                  <LabelList dataKey="aiLabel" position="top" style={{ fill: '#06b6d4', fontSize: '9px', fontWeight: 'bold' }} offset={10} />
                </Line>
                <Line yAxisId="left" type="monotone" dataKey="user_ok" stroke="#f59e0b" strokeWidth={2} name="User OK" dot={{ r: 4, fill: '#f59e0b' }}>
                  <LabelList dataKey="userLabel" position="top" style={{ fill: '#f59e0b', fontSize: '9px', fontWeight: 'bold' }} offset={10} />
                </Line>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2.2 Machine Grid: Lưới đa cột siêu gọn */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', 
          gap: '0.75rem',
          paddingTop: '0.5rem'
        }}>
          {Object.entries(groupedByLine).sort(([a], [b]) => a.localeCompare(b)).map(([lineName, lineMachines]) => (
            <div key={lineName} style={{ 
              background: 'rgba(255,255,255,0.015)', 
              borderRadius: '8px', 
              padding: '0.25rem 0.75rem', 
              border: '1px solid var(--glass-border)',
            }}>
              <div style={{ marginBottom: '0.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', fontSize: '0.8rem', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <TrendingUp size={12} /> {lineName}
                </span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Status: OK</span>
              </div>
              
              {/* Chỉ tối đa 2 máy nên để Grid 2 cột cố định */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                {lineMachines.sort((a, b) => a.name.localeCompare(b.name)).map(m => (
                  <div
                    key={m.id}
                    className={`machine-card ${m.has_ng ? 'has-ng' : 'is-ok'}`}
                    style={{ 
                      cursor: 'pointer', 
                      margin: 0, 
                      padding: '4px 8px',
                      opacity: m.status === 'ONLINE' ? 1 : 0.5,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: '0px',
                      minHeight: '32px',
                      justifyContent: 'center',
                      borderRadius: '6px'
                    }}
                    onClick={() => handleMachineClick(m.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', minWidth: 0 }}>
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <Monitor size={14} color={m.has_ng ? 'var(--status-ng)' : 'var(--status-ok)'} />
                        <div style={{ 
                          position: 'absolute', top: -1, right: -1, width: 6, height: 6, borderRadius: '50%', 
                          background: m.status === 'ONLINE' ? 'var(--status-ok)' : '#64748b'
                        }}></div>
                      </div>
                      <div style={{ 
                        fontWeight: 'bold', 
                        fontSize: '0.75rem', 
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1
                      }}>
                        {m.name.replace('Machine', 'M')}
                      </div>
                    </div>
                    {m.has_ng && (
                      <div style={{ fontSize: '0.65rem', color: 'var(--status-ng)', fontWeight: 'bold', marginLeft: '20px' }}>
                         {m.unconfirmed_ng_count} NG
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
