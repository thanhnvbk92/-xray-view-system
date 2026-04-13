import React, { useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, LineChart, Line, Cell, LabelList
} from 'recharts';
import {
    TrendingUp, BarChart3, Database, Layers, X,
    Filter, Download, Calendar, RefreshCw, CheckCircle2, 
    AlertTriangle, Zap, Layout, Monitor, FileText
} from 'lucide-react';
import { api } from '../context/AuthContext';

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        const total = (data.ok || 0) + (data.ng || 0);
        const ai_ok = data.ai_ok || 0;
        const user_ok = data.user_ok || 0;
        const okPercent = total > 0 ? (((data.ok || 0) / total) * 100).toFixed(1) : "0.0";
        const ngPercent = total > 0 ? (((data.ng || 0) / total) * 100).toFixed(1) : "0.0";
        return (
            <div style={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '12px', color: '#fff', fontSize: '0.85rem', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)' }}>
                <p style={{ margin: 0, fontWeight: 'bold', marginBottom: '8px', color: '#94a3b8' }}>{label}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <div style={{ color: '#fff' }}>Tổng quét: {total}</div>
                    <div style={{ color: '#22c55e' }}>OK: {data.ok || 0} ({okPercent}%)</div>
                    <div style={{ color: '#ef4444' }}>NG: {data.ng || 0} ({ngPercent}%)</div>
                    <div style={{ color: '#06b6d4' }}>AI OK: {ai_ok}</div>
                    <div style={{ color: '#f59e0b' }}>User OK: {user_ok}</div>
                </div>
            </div>
        );
    }
    return null;
};

function Analysis() {
    // Instant Display từ Cache
    const getCache = (key, fallback) => {
        const cached = sessionStorage.getItem(key);
        return cached ? JSON.parse(cached) : fallback;
    };

    const [loading, setLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [processTime, setProcessTime] = useState(0);
    const [data, setData] = useState(() => getCache('ana_data', { 
        overall: { total: 0, ok: 0, ng: 0, ai_ok: 0, ok_rate: 0, ng_rate: 0 },
        machines: [], jobs: [], shots: [], arrays: [] 
    }));
    const [trends, setTrends] = useState(() => getCache('ana_trends', []));
    const [filters, setFilters] = useState({ 
        machineId: null, 
        machineName: null, 
        jobFile: null, 
        arrayIndex: null,
        shotIdx: null,
        date: null,
        startDate: '',
        endDate: ''
    });

    const fetchData = async () => {
        const startTime = performance.now();
        setLoading(true);
        setProcessTime(null); // Reset thời gian xử lý khi bắt đầu lọc mới
        try {
            const params = {
                machine_id: filters.machineId,
                job_file: filters.jobFile,
                array_index: filters.arrayIndex,
                shot_idx: filters.shotIdx,
                target_date: filters.date,
                start_date: filters.startDate,
                end_date: filters.endDate
            };
            
            const [resSummary, resTrends] = await Promise.all([
                api.get('/api/analysis/summary', { params }),
                api.get('/api/dashboard/trends', { params })
            ]);

            const processedData = {
                ...resSummary.data,
                machines: (resSummary.data.machines || []).map(m => ({ ...m, displayLabel: `${m.ng} (${m.ng_rate}%)` })),
                jobs: (resSummary.data.jobs || []).map(j => ({ ...j, displayLabel: `${j.ng} (${j.ng_rate}%)` })),
                shots: (resSummary.data.shots || []).map(s => ({ ...s, displayLabel: `${s.ng} (${s.ng_rate}%)` })),
                arrays: (resSummary.data.arrays || []).map(a => ({ ...a, displayLabel: `${a.ng} (${a.ng_rate}%)` }))
            };

            const trendsWithLabels = (resTrends.data || []).map(t => {
                const total = t.ok + t.ng;
                const okPerc = total > 0 ? ((t.ok / total) * 100).toFixed(1) : "0.0";
                const ngPerc = total > 0 ? ((t.ng / total) * 100).toFixed(1) : "0.0";
                return {
                    ...t,
                    okLabel: `${t.ok} (${okPerc}%)`,
                    ngLabel: `${t.ng} (${ngPerc}%)`,
                    ng_rate: t.ng_rate || 0
                };
            });

            setData(processedData);
            setTrends(trendsWithLabels);
            
            
            // Xử lý cache nếu không có lọc
            if (!filters.machineId && !filters.jobFile && !filters.arrayIndex && !filters.shotIdx && !filters.date && !filters.startDate && !filters.endDate) {
                sessionStorage.setItem('ana_data', JSON.stringify(processedData));
                sessionStorage.setItem('ana_trends', JSON.stringify(trendsWithLabels));
            }
            
            const endTime = performance.now();
            setProcessTime(parseFloat(((endTime - startTime) / 1000).toFixed(2)));
            setLastUpdated(new Date().toLocaleTimeString('vi-VN'));
        } catch (error) {
            console.error("Analysis: Fetch error:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [filters]);

    const resetFilters = () => setFilters({ machineId: null, machineName: null, jobFile: null, arrayIndex: null, shotIdx: null, date: null, startDate: '', endDate: '' });
    const removeMachineFilter = () => setFilters(prev => ({ ...prev, machineId: null, machineName: null }));
    const removeJobFilter = () => setFilters(prev => ({ ...prev, jobFile: null }));
    const removeArrayIndexFilter = () => setFilters(prev => ({ ...prev, arrayIndex: null }));
    const removeShotIdxFilter = () => setFilters(prev => ({ ...prev, shotIdx: null }));
    const removeDateFilter = () => setFilters(prev => ({ ...prev, date: null }));
    
    // Hàm chuyển đổi YYYY-MM-DD thành DD/MM
    const formatDateDisplay = (dateStr) => {
        if (!dateStr) return '';
        try {
            const parts = dateStr.split('-');
            if (parts.length === 3) return `${parts[2]}/${parts[1]}`; // DD/MM
            return dateStr;
        } catch (e) { return dateStr; }
    };

    const handleTrendClick = (data) => {
        // Log để debug
        console.log("Analysis: Trend Clicked:", data);
        
        // Lấy ngày từ payload (điểm dữ liệu) hoặc label (trục X)
        let selectedDate = null;
        if (data && data.activePayload && data.activePayload.length > 0) {
            selectedDate = data.activePayload[0].payload.date;
        } else if (data && data.activeLabel) {
            selectedDate = data.activeLabel;
        }

        if (selectedDate) {
            console.log("Analysis: Selecting date:", selectedDate);
            if (filters.date === selectedDate) {
                removeDateFilter();
            } else {
                setFilters(prev => ({ ...prev, date: selectedDate }));
            }
        }
    };

    const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444'];
    
    return (
        <div className="fade-in analysis-page-root">
            <style>
                {`
                    @keyframes loading-bar {
                        0% { background-position: 200% 0; }
                        100% { background-position: -200% 0; }
                    }
                `}
            </style>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', position: 'relative' }}>
                <div style={{
                    position: 'absolute',
                    top: '-20px',
                    left: '-2rem',
                    right: '-2rem',
                    height: '3px',
                    background: loading ? 'linear-gradient(90deg, transparent, var(--primary-color), transparent)' : 'transparent',
                    backgroundSize: '200% 100%',
                    animation: loading ? 'loading-bar 1.5s infinite linear' : 'none',
                    zIndex: 10
                }} />
                <div>
                    <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>Phân tích Tương quan</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Click vào các biểu đồ để lọc dữ liệu chuyên sâu</p>
                </div>
                
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '5px 15px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                        <Calendar size={16} color="var(--primary-color)" />
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Từ:</span>
                        <input 
                            type="date" 
                            value={filters.startDate} 
                            onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                            style={{ background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}
                        />
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Đến:</span>
                        <input 
                            type="date" 
                            value={filters.endDate} 
                            onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                            style={{ background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}
                        />
                    </div>
                    <button onClick={fetchData} className="btn btn-secondary" style={{ padding: '8px' }} title="Làm mới">
                        <RefreshCw size={18} className={loading ? 'spin' : ''} />
                    </button>
                    <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Download size={18} /> Xuất PDF
                    </button>
                </div>
            </header>

            {/* Filter Bar (Stabilized Height) */}
            <div style={{ minHeight: '60px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px' }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {(filters.machineId || filters.jobFile || filters.date) ? (
                        <>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Đang lọc:</span>
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
                            {filters.date && (
                                <div className="badge badge-ok" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 12px', background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24' }}>
                                    <span>Ngày: {formatDateDisplay(filters.date)}</span>
                                    <X size={14} style={{ cursor: 'pointer' }} onClick={removeDateFilter} />
                                </div>
                            )}
                            {filters.arrayIndex && (
                                <div className="badge badge-ok" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 12px', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' }}>
                                    <span>Array: {filters.arrayIndex}</span>
                                    <X size={14} style={{ cursor: 'pointer' }} onClick={removeArrayIndexFilter} />
                                </div>
                            )}
                            {filters.shotIdx && (
                                <div className="badge badge-ok" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 12px', background: 'rgba(239, 68, 68, 0.2)', color: '#f87171' }}>
                                    <span>Shot: {filters.shotIdx}</span>
                                    <X size={14} style={{ cursor: 'pointer' }} onClick={removeShotIdxFilter} />
                                </div>
                            )}
                            <button onClick={resetFilters} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}>Xóa tất cả</button>
                        </>
                    ) : (
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', opacity: 0.6 }}>Chưa áp dụng bộ lọc (Click đồ thị để lọc)</span>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', color: 'var(--text-secondary)', fontSize: '0.8rem', background: 'rgba(255,255,255,0.03)', padding: '5px 15px', borderRadius: '20px', border: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {loading ? <RefreshCw size={12} className="spin" /> : <CheckCircle2 size={12} style={{ color: '#22c55e' }} />}
                        <span>{loading ? 'Đang cập nhật...' : `Cập nhật: ${lastUpdated || '--:--'}`}</span>
                    </div>
                    {!loading && processTime !== null && (
                        <span>Xử lý: <b>{processTime}s</b></span>
                    )}
                </div>
            </div>

            {/* 1. Trends Row - Adaptive */}
            <div className="data-table-container" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem', fontSize: '1.2rem' }}>
                    <TrendingUp size={22} /> Xu hướng Tỉ lệ lỗi {filters.machineName ? `(${filters.machineName})` : filters.jobFile ? `(${filters.jobFile})` : filters.arrayIndex ? `(Array ${filters.arrayIndex})` : filters.shotIdx ? `(Shot ${filters.shotIdx})` : 'Hệ thống'}
                </h3>
                <div style={{ height: '280px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                            data={trends} 
                            margin={{ top: 10, right: 30, left: 0, bottom: 0 }} 
                            onClick={handleTrendClick}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                            <XAxis 
                                dataKey="date" 
                                stroke="#94a3b8" 
                                fontSize={11} 
                                tickLine={false} 
                                axisLine={false} 
                                tickFormatter={(val) => formatDateDisplay(val)}
                            />
                            <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} unit="%" />
                            <Tooltip
                                cursor={false}
                                content={<CustomTooltip />}
                            />
                                <Bar 
                                    dataKey="ng_rate" 
                                    name="Tỉ lệ NG (%)"
                                    radius={[5, 5, 0, 0]}
                                    barSize={45}
                                    activeBar={false}
                                >
                                    {trends.map((entry, index) => (
                                        <Cell 
                                            key={`cell-${index}`}
                                            fill="#ef4444"
                                            style={{ 
                                                cursor: 'pointer',
                                                transition: 'all 0.3s ease',
                                                filter: (!filters.date || filters.date === entry.date) ? 'brightness(1.3) contrast(1.1)' : 'none'
                                            }}
                                            opacity={(!filters.date || filters.date === entry.date) ? 1 : 0.25}
                                        />
                                    ))}
                                    <LabelList 
                                        dataKey="ng_rate" 
                                        position="top" 
                                        style={{ fill: '#ef4444', fontSize: '11px', fontWeight: 'bold' }} 
                                        formatter={(v) => v > 0 ? `${v}%` : ''} 
                                    />
                                </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 2. Responsive Grid 2x2 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                {/* 2.1 Machine Comparison */}
                <div className="data-table-container" style={{ padding: '1.5rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem', fontSize: '1.1rem' }}>
                        <BarChart3 size={20} /> So sánh giữa các Máy
                    </h3>
                    <div style={{ height: '240px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={data.machines}
                                margin={{ top: 25, right: 10, left: 10, bottom: 40 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis 
                                    dataKey="display_name" 
                                    stroke="var(--text-secondary)" 
                                    fontSize={9} 
                                    interval={0}
                                    angle={-45}
                                    textAnchor="end"
                                    height={40}
                                />
                                <YAxis stroke="var(--text-secondary)" fontSize={11} axisLine={false} tickLine={false} />
                                <Tooltip 
                                    cursor={false} 
                                    contentStyle={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--glass-border)', borderRadius: '12px', color: '#fff' }} 
                                />
                                <Bar 
                                    dataKey="ng_rate" 
                                    radius={[5, 5, 0, 0]} 
                                    activeBar={false}
                                    onClick={(entry) => {
                                        if (!entry) return;
                                        const clickedId = entry.id;
                                        if (String(filters.machineId) === String(clickedId)) {
                                            removeMachineFilter();
                                        } else {
                                            setFilters(prev => ({ ...prev, machineId: clickedId, machineName: entry.display_name }));
                                        }
                                    }}
                                >
                                    {data.machines.map((entry, index) => {
                                        const isSelected = filters.machineId && String(entry.id) === String(filters.machineId);
                                        const isAnySelected = filters.machineId !== null;
                                        return (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill="#3b82f6"
                                                fillOpacity={!isAnySelected || isSelected ? 1 : 0.25}
                                                style={{ 
                                                    filter: isSelected ? 'brightness(1.3) contrast(1.1)' : 'none',
                                                    cursor: 'pointer',
                                                    transition: 'fill 0.2s ease'
                                                }}
                                                onMouseEnter={(e) => e.target.style.fill = '#60a5fa'}
                                                onMouseLeave={(e) => e.target.style.fill = '#3b82f6'}
                                            />
                                        );
                                    })}
                                    <LabelList dataKey="displayLabel" position="top" style={{ fill: '#fff', fontSize: '10px', fontWeight: 'bold' }} offset={10} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 2.2 Job Comparison */}
                <div className="data-table-container" style={{ padding: '1.5rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem', fontSize: '1.1rem' }}>
                        <Database size={20} /> Tỉ lệ lỗi theo Job File
                    </h3>
                    <div style={{ height: '240px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart layout="vertical" data={data.jobs} margin={{ top: 5, right: 60, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                                <XAxis type="number" hide />
                                <YAxis dataKey="job" type="category" stroke="var(--text-secondary)" fontSize={9} width={160} />
                                <Tooltip 
                                    cursor={false} contentStyle={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--glass-border)', borderRadius: '12px', color: '#fff' }} 
                                />
                                <Bar 
                                    dataKey="ng_rate" 
                                    radius={[0, 5, 5, 0]} 
                                    activeBar={false}
                                    onClick={(entry) => {
                                        if (!entry) return;
                                        const job = entry.job;
                                        if (filters.jobFile === job) removeJobFilter();
                                        else setFilters(prev => ({ ...prev, jobFile: job }));
                                    }}
                                >
                                    {data.jobs.map((entry, index) => {
                                        const isSelected = filters.jobFile && entry.job === filters.jobFile;
                                        return <Cell key={`job-${index}`} fill="#8b5cf6" fillOpacity={!filters.jobFile || isSelected ? 1 : 0.25} style={{ filter: isSelected ? 'brightness(1.3) contrast(1.1)' : 'none' }} />;
                                    })}
                                    <LabelList dataKey="displayLabel" position="right" style={{ fill: '#fff', fontSize: '10px', fontWeight: 'bold' }} offset={10} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 2.3 Array Comparison */}
                <div className="data-table-container" style={{ padding: '1.5rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem', fontSize: '1.1rem' }}>
                        <Filter size={20} /> Tỉ lệ lỗi theo Array Index
                    </h3>
                    <div style={{ height: '240px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.arrays} margin={{ top: 25, right: 10, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis dataKey="array_index" stroke="var(--text-secondary)" fontSize={11} />
                                <YAxis stroke="var(--text-secondary)" fontSize={11} axisLine={false} tickLine={false} />
                                <Tooltip cursor={false} contentStyle={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--glass-border)', borderRadius: '12px', color: '#fff' }} />
                                <Bar 
                                    dataKey="ng_rate" 
                                    fill="#f59e0b" 
                                    radius={[5, 5, 0, 0]} 
                                    activeBar={false}
                                    onClick={(entry) => {
                                        if (!entry) return;
                                        const idx = entry.array_index;
                                        if (filters.arrayIndex === idx) removeArrayIndexFilter();
                                        else setFilters(prev => ({ ...prev, arrayIndex: idx }));
                                    }}
                                >
                                    {data.arrays.map((entry, index) => {
                                        const isSelected = filters.arrayIndex !== null && entry.array_index === filters.arrayIndex;
                                        return <Cell key={`array-${index}`} fill="#f59e0b" fillOpacity={filters.arrayIndex === null || isSelected ? 1 : 0.25} style={{ filter: isSelected ? 'brightness(1.3) contrast(1.1)' : 'none' }} />;
                                    })}
                                    <LabelList dataKey="displayLabel" position="top" style={{ fill: '#fff', fontSize: '10px', fontWeight: 'bold' }} offset={10} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 2.4 Shot Comparison */}
                <div className="data-table-container" style={{ padding: '1.5rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem', fontSize: '1.1rem' }}>
                        <Layers size={20} /> Lỗi theo vị trí (Shot Heatmap)
                    </h3>
                    <div style={{ height: '240px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.shots} margin={{ top: 25, right: 10, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis dataKey="shot" stroke="var(--text-secondary)" fontSize={11} />
                                <YAxis stroke="var(--text-secondary)" fontSize={11} axisLine={false} tickLine={false} />
                                <Tooltip cursor={false} contentStyle={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--glass-border)', borderRadius: '12px', color: '#fff' }} />
                                <Bar 
                                    dataKey="ng_rate" 
                                    fill="#ef4444" 
                                    radius={[5, 5, 0, 0]} 
                                    activeBar={false}
                                    onClick={(entry) => {
                                        if (!entry) return;
                                        const shot = entry.shot;
                                        if (filters.shotIdx === shot) removeShotIdxFilter();
                                        else setFilters(prev => ({ ...prev, shotIdx: shot }));
                                    }}
                                >
                                    {data.shots.map((entry, index) => {
                                        const isSelected = filters.shotIdx !== null && entry.shot === filters.shotIdx;
                                        return <Cell key={`shot-${index}`} fill="#ef4444" fillOpacity={filters.shotIdx === null || isSelected ? 1 : 0.25} style={{ filter: isSelected ? 'brightness(1.3) contrast(1.1)' : 'none' }} />;
                                    })}
                                    <LabelList dataKey="displayLabel" position="top" style={{ fill: '#fff', fontSize: '10px', fontWeight: 'bold' }} offset={10} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Analysis;
