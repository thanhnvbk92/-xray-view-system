import React, { useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, LineChart, Line, Cell, LabelList
} from 'recharts';
import {
    TrendingUp, BarChart3, Database, Layers, X,
    Filter, Download, Calendar, RefreshCw, CheckCircle2, AlertTriangle
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
    const [baselineData, setBaselineData] = useState(data); // Dữ liệu gốc để giữ các cột máy/job
    const [trends, setTrends] = useState(() => getCache('ana_trends', []));
    const [filters, setFilters] = useState({ 
        machineId: null, 
        machineName: null, 
        jobFile: null, 
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
            
            // Nếu không có bộ lọc máy/job, cập nhật baselineData làm khung cho biểu đồ
            if (!filters.machineId && !filters.jobFile) {
                setBaselineData(processedData);
            }
            
            // Xử lý cache nếu không có lọc
            if (!filters.machineId && !filters.jobFile && !filters.date && !filters.startDate && !filters.endDate) {
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

    const resetFilters = () => setFilters({ machineId: null, machineName: null, jobFile: null, date: null, startDate: '', endDate: '' });
    const removeMachineFilter = () => setFilters(prev => ({ ...prev, machineId: null, machineName: null }));
    const removeJobFilter = () => setFilters(prev => ({ ...prev, jobFile: null }));
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
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', position: 'relative' }}>
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
                <style>
                    {`
                        @keyframes loading-bar {
                            0% { background-position: 200% 0; }
                            100% { background-position: -200% 0; }
                        }
                    `}
                </style>
                <div>
                    <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>Phân tích Tương quan</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Click vào các biểu đồ để lọc dữ liệu chuyên sâu</p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '5px 15px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                        <Calendar size={16} color="var(--primary-color)" />
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginLeft: '4px' }}>Từ:</span>
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

            {/* Filter Bar with Fixed Height to stabilize layout */}
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
                                    <Calendar size={14} />
                                    <span>Ngày: {formatDateDisplay(filters.date)}</span>
                                    <X size={14} style={{ cursor: 'pointer' }} onClick={removeDateFilter} />
                                </div>
                            )}
                            <button onClick={resetFilters} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}>
                                Xóa tất cả
                            </button>
                        </>
                    ) : (
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', opacity: 0.6 }}>Chưa áp dụng bộ lọc chi tiết (Click vào biểu đồ để lọc)</span>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', color: 'var(--text-secondary)', fontSize: '0.8rem', background: 'rgba(255,255,255,0.03)', padding: '5px 15px', borderRadius: '20px', border: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {loading ? (
                            <RefreshCw size={12} className="spin" style={{ color: 'var(--primary-color)' }} />
                        ) : (
                            <CheckCircle2 size={12} style={{ color: '#22c55e' }} />
                        )}
                        <span>{loading ? 'Đang đồng bộ...' : `Cập nhật: ${lastUpdated || '--:--:--'}`}</span>
                    </div>
                    {!loading && processTime !== null && (
                        <>
                            <div style={{ width: '1px', height: '12px', background: 'rgba(255,255,255,0.1)' }} />
                            <div>Xử lý: <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{processTime}s</span></div>
                        </>
                    )}
                </div>
            </div>
            {/* 1. Trends Row */}
            <div className="data-table-container" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
                    <TrendingUp size={20} /> Xu hướng Tỉ lệ lỗi {filters.machineName ? `của ${filters.machineName}` : filters.jobFile ? `của ${filters.jobFile}` : 'Tổng hệ thống'}
                </h3>
                <div style={{ height: '300px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                            data={trends} 
                            margin={{ top: 20, right: 30, left: 10, bottom: 10 }} 
                            onClick={handleTrendClick}
                            style={{ outline: 'none' }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                            <XAxis 
                                dataKey="date" 
                                stroke="#94a3b8" 
                                fontSize={12} 
                                tickLine={false} 
                                axisLine={false} 
                                tickFormatter={(val) => formatDateDisplay(val)}
                            />
                            <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} unit="%" />
                            <Tooltip
                                cursor={false}
                                content={<CustomTooltip />}
                            />
                                <Bar 
                                    dataKey="ng_rate" 
                                    name="Tỉ lệ NG (%)"
                                    radius={[4, 4, 0, 0]}
                                    barSize={40}
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
                {/* 2. Machine Comparison */}
                <div className="data-table-container" style={{ padding: '1.5rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
                        <BarChart3 size={20} /> So sánh giữa các Máy
                    </h3>
                    <div style={{ height: '300px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={baselineData.machines}
                                margin={{ top: 30, right: 10, left: 10, bottom: 5 }}
                                style={{ outline: 'none' }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis dataKey="display_name" stroke="var(--text-secondary)" fontSize={12} />
                                <YAxis stroke="var(--text-secondary)" fontSize={12} axisLine={false} tickLine={false} />
                                <Tooltip 
                                    cursor={false} 
                                    contentStyle={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--glass-border)', borderRadius: '12px', color: '#fff' }} 
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Bar 
                                    dataKey="ng_rate" 
                                    name="Tỉ lệ NG (%)" 
                                    radius={[5, 5, 0, 0]} 
                                    isAnimationActive={false}
                                    activeBar={false}
                                    onClick={(payload) => {
                                        if (!payload) return;
                                        const clickedId = payload.id;
                                        if (String(filters.machineId) === String(clickedId)) {
                                            removeMachineFilter();
                                        } else {
                                            setFilters(prev => ({ ...prev, machineId: clickedId, machineName: payload.display_name }));
                                        }
                                    }}
                                >
                                    {baselineData.machines.map((entry, index) => {
                                        const isSelected = filters.machineId && String(entry.id) === String(filters.machineId);
                                        const isAnySelected = filters.machineId !== null;
                                        return (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={COLORS[index % COLORS.length]}
                                                fillOpacity={!isAnySelected || isSelected ? 1 : 0.25}
                                                style={{ 
                                                    cursor: 'pointer', 
                                                    transition: 'all 0.3s',
                                                    filter: isSelected ? 'brightness(1.3) contrast(1.1)' : 'none'
                                                }}
                                            />
                                        );
                                    })}
                                    <LabelList 
                                        dataKey="displayLabel" 
                                        position="top" 
                                        style={{ fill: '#ffffff', fontSize: '11px', fontWeight: 'bold' }}
                                        offset={10}
                                    />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '10px' }}>* Click vào cột để lọc theo Máy</p>
                </div>

                {/* 3. Shot Comparison */}
                <div className="data-table-container" style={{ padding: '1.5rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
                        <Layers size={20} /> Lỗi theo vị trí (Shot Heatmap)
                    </h3>
                    <div style={{ height: '300px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                                data={data.shots} 
                                margin={{ top: 30, right: 10, left: 10, bottom: 5 }}
                                style={{ outline: 'none' }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis dataKey="shot" stroke="var(--text-secondary)" fontSize={12} />
                                <YAxis stroke="var(--text-secondary)" fontSize={12} axisLine={false} tickLine={false} />
                                <Tooltip 
                                    cursor={false} 
                                    contentStyle={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--glass-border)', borderRadius: '12px', color: '#fff' }} 
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Bar dataKey="ng_rate" fill="#ef4444" name="Tỉ lệ NG (%)" radius={[5, 5, 0, 0]} isAnimationActive={false} activeBar={false}>
                                    <LabelList 
                                        dataKey="displayLabel" 
                                        position="top" 
                                        style={{ fill: '#ffffff', fontSize: '11px', fontWeight: 'bold' }}
                                        offset={10}
                                    />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '10px' }}>Phân bổ lỗi theo vị trí ảnh trên PCB (Shot-by-Shot)</p>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
                {/* 4. Array Index Comparison */}
                <div className="data-table-container" style={{ padding: '1.5rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
                        <Filter size={20} /> Tỉ lệ lỗi theo Array Index
                    </h3>
                    <div style={{ height: '300px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                                data={data.arrays} 
                                margin={{ top: 30, right: 10, left: 10, bottom: 5 }}
                                style={{ outline: 'none' }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis dataKey="displayLabel" stroke="var(--text-secondary)" fontSize={12} />
                                <YAxis stroke="var(--text-secondary)" fontSize={12} axisLine={false} tickLine={false} />
                                <Tooltip 
                                    cursor={false} 
                                    contentStyle={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--glass-border)', borderRadius: '12px', color: '#fff' }} 
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Bar dataKey="ng_rate" fill="#f59e0b" name="Tỉ lệ NG (%)" radius={[5, 5, 0, 0]} isAnimationActive={false} activeBar={false}>
                                    <LabelList 
                                        dataKey="displayLabel" 
                                        position="top" 
                                        style={{ fill: '#ffffff', fontSize: '11px', fontWeight: 'bold' }}
                                        offset={10}
                                    />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '10px' }}>Phân tích chất lượng theo vị trí bản mạch trong mảng</p>
                </div>

                {/* Placeholder or other small info if needed, keeping grid 1fr 1fr */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '1px dashed var(--glass-border)', padding: '2rem', textAlign: 'center' }}>
                    <AlertTriangle size={32} color="var(--text-secondary)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        Dữ liệu được tổng hợp thời gian thực từ Log máy quét.<br/>
                        Sử dụng các bộ lọc ở trên để xem chi tiết hơn.
                    </p>
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
                            margin={{ top: 5, right: 80, left: 10, bottom: 5 }}
                            style={{ outline: 'none' }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                            <XAxis type="number" stroke="var(--text-secondary)" fontSize={12} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="job" stroke="var(--text-secondary)" fontSize={10} width={180} />
                            <Tooltip 
                                cursor={false}                                contentStyle={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--glass-border)', borderRadius: '12px', color: '#fff' }} 
                                itemStyle={{ color: '#fff' }}
                            />
                            <Bar 
                                dataKey="ng_rate" 
                                name="Tỉ lệ NG (%)" 
                                radius={[0, 5, 5, 0]} 
                                isAnimationActive={false}
                                activeBar={false}
                                onClick={(data) => {
                                    if (filters.jobFile === data.job) {
                                        removeJobFilter();
                                    } else {
                                        setFilters(prev => ({ ...prev, jobFile: data.job }));
                                    }
                                }}
                            >
                                {data.jobs.map((entry, index) => {
                                    const isSelected = filters.jobFile && String(entry.job) === String(filters.jobFile);
                                    const isAnySelected = filters.jobFile !== null;
                                    return (
                                        <Cell
                                            key={`cell-job-${index}`}
                                            fill="#8b5cf6"
                                            fillOpacity={!isAnySelected || isSelected ? 1 : 0.25}
                                            style={{ 
                                                cursor: 'pointer', 
                                                transition: 'all 0.3s',
                                                filter: isSelected ? 'brightness(1.3) contrast(1.1)' : 'none'
                                            }}
                                        />
                                    );
                                })}
                                <LabelList 
                                    dataKey="displayLabel" 
                                    position="right" 
                                    style={{ fill: '#ffffff', fontSize: '11px', fontWeight: 'bold' }}
                                    offset={10}
                                />
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
