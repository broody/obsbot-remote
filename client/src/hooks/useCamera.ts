import { useState, useEffect, useCallback, useRef } from 'react';

export interface CameraStatus {
    info: any;
    status: any;
    zoom: number;
}

export interface Segment {
    filename: string;
    type: 'video' | 'audio';
    timestamp: number;
    keep: boolean;
    reason?: string;
}

export interface Toast {
    id: number;
    message: string;
    type: 'error' | 'success' | 'info';
}

export const useCamera = (baseUrl: string) => {
    const [status, setStatus] = useState<CameraStatus | null>(null);
    const [segments, setSegments] = useState<Segment[]>([]);
    const [connected, setConnected] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const ws = useRef<WebSocket | null>(null);
    const pollTimeoutRef = useRef<number | null>(null);
    const toastIdRef = useRef(0);

    // Derive REST API URL from base URL
    const apiUrl = baseUrl.replace('ws://', 'http://').replace(':8080', ':8080');

    // ==================== Toast Management ====================
    const addToast = useCallback((message: string, type: Toast['type'] = 'error') => {
        const id = ++toastIdRef.current;
        setToasts(prev => [...prev, { id, message, type }]);
        // Auto-remove after 4 seconds
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    }, []);

    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // ==================== REST API: Fetch Status ====================
    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch(`${apiUrl}/api/status`);
            if (res.ok) {
                const data = await res.json();
                setStatus(data.camera);
                setSegments(data.segments || []);
                setConnected(true);
                return data.camera;
            } else {
                setConnected(false);
                return null;
            }
        } catch (error) {
            setConnected(false);
            return null;
        }
    }, [apiUrl]);

    // Fetch status once on mount
    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    // ==================== Smart Polling After Command ====================
    const pollUntilStateMatches = useCallback(async (
        predicate: (status: CameraStatus | null) => boolean,
        commandName: string
    ) => {
        const startTime = Date.now();
        const TIMEOUT = 5000; // 5 seconds
        const POLL_INTERVAL = 1000; // 1 second

        const poll = async () => {
            // Clear any existing timeout
            if (pollTimeoutRef.current) {
                clearTimeout(pollTimeoutRef.current);
            }

            const newStatus = await fetchStatus();
            
            if (predicate(newStatus)) {
                // State matches expectation - success!
                return true;
            }

            if (Date.now() - startTime >= TIMEOUT) {
                // Timeout - show error toast
                addToast(`Failed to confirm ${commandName} - camera may not have responded`, 'error');
                return false;
            }

            // Keep polling
            return new Promise<boolean>((resolve) => {
                pollTimeoutRef.current = window.setTimeout(async () => {
                    resolve(await poll());
                }, POLL_INTERVAL);
            });
        };

        return poll();
    }, [fetchStatus, addToast]);

    // ==================== REST API: Send Command ====================
    const sendCommand = useCallback(async (
        type: string, 
        payload: any = {},
        expectation?: { field: string; value: any }
    ) => {
        try {
            const res = await fetch(`${apiUrl}/api/command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, payload })
            });
            
            if (res.ok) {
                const data = await res.json();
                
                // If we have an expectation, poll until it matches
                if (expectation) {
                    pollUntilStateMatches(
                        (s) => {
                            if (!s?.status) return false;
                            return s.status[expectation.field] === expectation.value;
                        },
                        type
                    );
                } else {
                    // Just fetch once after a short delay
                    setTimeout(fetchStatus, 300);
                }
                
                return data;
            } else {
                addToast(`Command ${type} failed`, 'error');
            }
        } catch (error) {
            console.error('Command failed:', error);
            addToast(`Command ${type} failed: ${error}`, 'error');
        }
    }, [apiUrl, pollUntilStateMatches, fetchStatus, addToast]);

    // ==================== WebSocket: Gimbal Control ====================
    const wsUrl = baseUrl.replace(':8080', ':8080/ws/gimbal');

    useEffect(() => {
        const connect = () => {
            ws.current = new WebSocket(wsUrl);

            ws.current.onopen = () => {
                console.log('Gimbal WebSocket connected');
            };

            ws.current.onclose = () => {
                console.log('Gimbal WebSocket disconnected, reconnecting...');
                setTimeout(connect, 3000);
            };

            ws.current.onerror = (err) => {
                console.error('Gimbal WebSocket error:', err);
            };
        };

        connect();

        return () => {
            if (ws.current) {
                ws.current.close();
            }
            if (pollTimeoutRef.current) {
                clearTimeout(pollTimeoutRef.current);
            }
        };
    }, [wsUrl]);

    // Send gimbal commands via WebSocket (low latency, no state tracking needed)
    const sendGimbalCommand = useCallback((type: string, payload: any = {}) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type, payload }));
        }
    }, []);

    return {
        status,
        segments,
        connected,
        toasts,
        removeToast,
        sendCommand,      // REST API for general commands
        sendGimbalCommand // WebSocket for gimbal only
    };
};
