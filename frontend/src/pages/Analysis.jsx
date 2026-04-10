import React, { useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, LineChart, Line, Cell
} from 'recharts';
import {
    TrendingUp, BarChart3, Database, Layers, X,
    Filter, Download, Calendar, RefreshCw
} from 'lucide-react';
import { api } from '../context/AuthContext';

function Analysis() {
    const [data, setData] = useState({ machines: [], jobs: [], units: [] });
    const [trends, setTrends] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ machineId: null, machineName: null, jobFile: null });

    const fetchData = async () => {
        setLoading(true);
        try {
            const params = {};
            if (filters.machineId) params.machine_id = filters.machineId;
            if (filters.jobFile) params.job_file = filters.jobFile;

            console.log("Analysis: Fetching data with params:", params);
            const [resSummary, resTrends] = await Promise.all([
                api.get('/api/analysis/summary', { params }),
                api.get('/api/dashboard/trends', { params })
            ]);
            setData(resSummary.data);
            setTrends(resTrends.data);
            setLoading(false);
        } catch (error) {
            console.error("Error fetching analysis data:", error);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [filters]);

    const resetFilters = () => setFilters({ machineId: null, machineName: null, jobFile: null });
    const removeMachineFilter = () => setFilters(prev => ({ ...prev, machineId: null, machineName: null }));
    const removeJobFilter = () => setFilters(prev => ({ ...prev, jobFile: null }));

    const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444'];

    return (
        <div className="fade-in">
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>Phân tích Tương quan</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Click vào các biểu đồ để lọc dữ liệu chuyên sâu</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={fetchData} className="btn btn-secondary" style={{ padding: '8px' }} title="Làm mới">
                        <RefreshCw size={18} />
                    </button>
                    <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Download size={18} /> Xuất PDF
                    </button>
                </div>
            </header>

            {/* Filter Status Bar */}
            {(filters.machineId || filters.jobFile) && (
                <div style={{ display: 'flex', gap: '10px', marginBottom: '2rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Bộ lọc đang áp dụng:</span>
                    {filters.machineId && (
                        <div className="badge badge-ok" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 12px' }}>
                            <span>Máy: {filters.machineName}</span>
                            <X size={14} style={{ cursor: 'pointer' }} onClick={removeMachineFilter} />
                        </div>
                    )}
                    {filters.jobFile && (
                        <div className="badge badge-ok" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 12px', background: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa' }}>
                            <span>Job: {filters.jobFile}</span>
                            <X size={14} style={{ cursor: 'pointer' }} onClick={removeJobFilter} />
                        </div>
                    )}
                    <button onClick={resetFilters} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}>
                        Xóa tất cả
                    </button>
                </div>
            )}

            {/* 1. Trends Row */}
            <div className="data-table-container" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
                    <TrendingUp size={20} /> Xu hướng Tỉ lệ lỗi {filters.machineName ? `của ${filters.machineName}` : filters.jobFile ? `của ${filters.jobFile}` : 'Tổng hệ thống'}
                </h3>
                <div style={{ height: '300px', opacity: loading ? 0.5 : 1, transition: 'opacity 0.3s' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trends}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                            <XAxis dataKey="date" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} unit="%" />
                            <Tooltip
                                contentStyle={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--glass-border)', borderRadius: '12px' }}
                            />
                            <Legend />
                            <Line type="monotone" dataKey="ng_rate" stroke="#ef4444" strokeWidth={3} name="Tỉ lệ NG (%)" dot={{ r: 6 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
                {/* 2. Machine Comparison */}
                <div className="data-table-container" style={{ padding: '1.5rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
                        <BarChart3 size={20} /> So sánh giữa các Máy
                    </h3>
                    <div style={{ height: '300px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={data.machines}
                                onClick={(e) => {
                                    if (e && e.activePayload) {
                                        const m = e.activePayload[0].payload;
                                        setFilters(prev => ({ ...prev, machineId: m.id, machineName: m.display_name }));
                                    }
                                }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis dataKey="display_name" stroke="var(--text-secondary)" fontSize={12} />
                                <YAxis stroke="var(--text-secondary)" fontSize={12} axisLine={false} tickLine={false} />
                                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--glass-border)', borderRadius: '12px' }} />
                                <Bar dataKey="ng_rate" name="Tỉ lệ NG (%)" radius={[5, 5, 0, 0]}>
                                    {data.machines.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={entry.id === filters.machineId ? '#22c55e' : COLORS[index % COLORS.length]}
                                            style={{ cursor: 'pointer' }}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '10px' }}>* Click vào cột để lọc theo Máy</p>
                </div>

                {/* 3. Unit Comparison */}
                <div className="data-table-container" style={{ padding: '1.5rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
                        <Layers size={20} /> Lỗi theo vị trí (Unit Heatmap)
                    </h3>
                    <div style={{ height: '300px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.units}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis dataKey="unit" stroke="var(--text-secondary)" fontSize={12} />
                                <YAxis stroke="var(--text-secondary)" fontSize={12} axisLine={false} tickLine={false} />
                                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--glass-border)', borderRadius: '12px' }} />
                                <Bar dataKey="ng_rate" fill="#ef4444" name="Tỉ lệ NG (%)" radius={[5, 5, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '10px' }}>Phân bổ lỗi theo vị trí ảnh trên PCB</p>
                </div>
            </div>

            {/* 4. Job Comparison */}
            <div className="data-table-container" style={{ padding: '1.5rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
                    <Database size={20} /> Tỉ lệ lỗi theo Job File
                </h3>
                <div style={{ height: '400px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={data.jobs}
                            layout="vertical"
                            onClick={(e) => {
                                if (e && e.activePayload) {
                                    const j = e.activePayload[0].payload;
                                    setFilters(prev => ({ ...prev, jobFile: j.job }));
                                }
                            }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                            <XAxis type="number" stroke="var(--text-secondary)" fontSize={12} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="job" stroke="var(--text-secondary)" fontSize={10} width={180} />
                            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--glass-border)', borderRadius: '12px' }} />
                            <Bar dataKey="ng_rate" name="Tỉ lệ NG (%)" radius={[0, 5, 5, 0]}>
                                {data.jobs.map((entry, index) => (
                                    <Cell
                                        key={`cell-job-${index}`}
                                        fill={entry.job === filters.jobFile ? '#22c55e' : '#8b5cf6'}
                                        style={{ cursor: 'pointer' }}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '10px' }}>* Click vào hàng để lọc theo mã Job</p>
            </div>
        </div>
    );
}

export default Analysis;
