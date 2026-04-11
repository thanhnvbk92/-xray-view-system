import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = `http://${window.location.hostname}:8000`;
const AuthContext = createContext(null);

// Tạo instance axios để dùng chung cho toàn dự án
export const api = axios.create({
    baseURL: API_URL
});

// Request Interceptor: Luôn lấy token mới nhất từ localStorage trước mỗi request
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
            console.log(`API [Request]: ${config.method.toUpperCase()} ${config.url} - Token: ${token.substring(0, 10)}...`);
        } else {
            console.warn(`API [Request]: ${config.method.toUpperCase()} ${config.url} - NO TOKEN FOUND`);
        }
        return config;
    },
    (error) => Promise.reject(error)
);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const logout = (reason = "manual") => {
        console.log(`AuthContext: Performing Logout... (Reason: ${reason})`);
        localStorage.removeItem('token');
        setUser(null);
    };

    useEffect(() => {
        // Setup Response Interceptor cho lỗi 401
        const resInterceptor = api.interceptors.response.use(
            (response) => response,
            (error) => {
                if (error.response && error.response.status === 401) {
                    console.error("AuthContext: 401 Unauthorized detected at", error.config.url);
                    console.log("AuthContext: Token being used was:", localStorage.getItem('token') ? "Present" : "Missing");
                    logout("401_detected");
                }
                return Promise.reject(error);
            }
        );

        const token = localStorage.getItem('token');
        if (token) {
            console.log("AuthContext: Initializing user from token...");
            api.get('/api/auth/me')
                .then(res => {
                    console.log("AuthContext: Session restored for", res.data.username);
                    setUser(res.data);
                })
                .catch(err => {
                    console.error("AuthContext: Session restoration failed", err.response?.status);
                    // Không cần gọi logout() ở đây vì Interceptor 401 sẽ lo việc đó nếu token die
                })
                .finally(() => {
                    console.log("AuthContext: Initial session check complete.");
                    setLoading(false);
                });
        } else {
            setLoading(false);
        }

        return () => api.interceptors.response.eject(resInterceptor);
    }, []);

    const login = async (username, password) => {
        const formData = new FormData();
        formData.append('username', username);
        formData.append('password', password);

        console.log("AuthContext: Attempting login for", username);
        const res = await api.post('/api/auth/login', formData);
        
        const { access_token, role, full_name, permissions } = res.data;
        console.log("AuthContext: Login success, permissions:", permissions);

        localStorage.setItem('token', access_token);
        api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

        const userData = { username, role, full_name, permissions };
        setUser(userData);
        return userData;
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
