import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { DCRunner, DTRunner, RORunner, SDRunner, SIRunner } from './testRunners';

const gamePresets = {
    dc: {
        name: "百家樂 (DC)",
        websocketUrl: "ws://10.80.41.31:8001/api/ws/dcfront",
        account: "qadcboss",
        password: "aaaa1234",
        actionDelay: 1.0,
        testResults: "1111111122222222111112111111222111222222222122222222",
        resultsLabel: "測試結果模式 (1: 閒勝, 2: 庄勝)",
        presetsInfo: "1: 閒勝 P | 2: 庄勝 B"
    },
    dt: {
        name: "龍虎 (DT)",
        websocketUrl: "ws://10.80.41.31:8061/api/ws",
        account: "qadtcboss",
        password: "aaaa1234",
        dealerId: "67e21d167fdff87ac13d554c",
        dealerName: "bb",
        actionDelay: 1.0,
        testResults: "1221221221122112212212221221221122212121212121111111",
        resultsLabel: "測試結果模式 (1: 紅虎勝, 2: 藍龍勝)",
        presetsInfo: "1: 紅虎勝 | 2: 藍龍勝"
    },
    ro: {
        name: "輪盤 (RO)",
        websocketUrl: "ws://10.80.41.31:8051/api/ws",
        account: "qaroboss",
        password: "aaaa1234",
        dealerId: "69085a77a975e42c479440ee",
        dealerName: "測試者二",
        dealerAccount: "D0ES2",
        actionDelay: 1.0,
        testResults: "1, 12, 0, 36, 17, 24, 5, 8, 19, 2, 35, 10, 28",
        resultsLabel: "測試點數結果清單 (逗號分隔的 0 ~ 36 號碼)",
        presetsInfo: "數字: 0 ~ 36，以逗號分隔"
    },
    sd: {
        name: "色碟 (SD)",
        websocketUrl: "ws://10.80.41.31:8031/api/ws",
        account: "qasdcboss",
        password: "aaaa1234",
        dealerId: "67fcd2936aef8f1e0afaf845",
        dealerName: "bb",
        actionDelay: 1.0,
        testResults: "1,1,1,1,1,1,1,1,4,4,4,4,4,4,4,4,1,1,1,1,1,4,1,1,1,1,1,1,4,4,4,1,1,1,4,4,4,4,4,4,4,4,4,1,4,4,4,4,4,4,4,4",
        resultsLabel: "測試結果模式 (1: 單, 4: 雙，以逗號分隔)",
        presetsInfo: "1: 單 | 4: 雙"
    },
    si: {
        name: "骰寶 (SI)",
        websocketUrl: "ws://10.80.41.31:8041/api/ws",
        account: "qasiboss",
        password: "aaaa1234",
        dealerId: "67fcd2936aef8f1e0afaf845",
        dealerName: "bb",
        dealerAccount: "D0bb",
        actionDelay: 1.0,
        testResults: "00000000010000000",
        resultsLabel: "測試結果模式 (0: 圍, 1: 單, 2: 雙)",
        presetsInfo: "0: 圍 [1,1,1] | 1: 單 [1,1,5] | 2: 雙 [4,5,5]"
    }
};

const buildWsUrlWithAuth = (wsUrl, account, password) => {
    if (!wsUrl) return '';
    try {
        let tempUrl = wsUrl.replace(/^ws:/i, 'http:').replace(/^wss:/i, 'https:');
        const urlObj = new URL(tempUrl);
        urlObj.searchParams.set('account', account);
        urlObj.searchParams.set('password', password);
        let finalUrl = urlObj.toString();
        if (wsUrl.toLowerCase().startsWith('wss:')) {
            finalUrl = finalUrl.replace(/^https:/i, 'wss:');
        } else {
            finalUrl = finalUrl.replace(/^http:/i, 'ws:');
        }
        return finalUrl;
    } catch (e) {
        if (wsUrl.includes('?')) {
            let cleanUrl = wsUrl.split('?')[0];
            return `${cleanUrl}?account=${account}&password=${password}`;
        }
        return `${wsUrl}?account=${account}&password=${password}`;
    }
};

function App() {
    const [activeGame, setActiveGame] = useState('dc');
    const [isTestRunning, setIsTestRunning] = useState(false);
    const [runningGameType, setRunningGameType] = useState('');
    const [autoScroll, setAutoScroll] = useState(true);
    const [logs, setLogs] = useState([
        { id: 1, text: "[SYSTEM] 控制台已就緒，請在左側配置好參數後點擊「開始測試」。", type: "system" }
    ]);
    const [toasts, setToasts] = useState([]);

    // Form inputs state
    const [formData, setFormData] = useState({
        websocketUrl: gamePresets.dc.websocketUrl,
        loginApiUrl: gamePresets.dc.loginApiUrl,
        account: gamePresets.dc.account,
        password: gamePresets.dc.password,
        dealerId: '',
        dealerName: '',
        dealerAccount: '',
        actionDelay: gamePresets.dc.actionDelay,
        testResults: gamePresets.dc.testResults
    });

    const consoleBodyRef = useRef(null);
    const runnerRef = useRef(null);
    const logIdCounter = useRef(2);

    // Initial load
    useEffect(() => {
        applyPresetData('dc');
        return () => {
            if (runnerRef.current) {
                runnerRef.current.stop();
            }
        };
    }, []);

    // Scroll console
    useEffect(() => {
        if (autoScroll && consoleBodyRef.current) {
            consoleBodyRef.current.scrollTop = consoleBodyRef.current.scrollHeight;
        }
    }, [logs, autoScroll]);

    const applyPresetData = (game) => {
        const preset = gamePresets[game];
        setFormData({
            websocketUrl: preset.websocketUrl,
            actionDelay: preset.actionDelay,
            testResults: preset.testResults,
            loginApiUrl: preset.loginApiUrl || '',
            account: preset.account || '',
            password: preset.password || '',
            dealerId: preset.dealerId || '',
            dealerName: preset.dealerName || '',
            dealerAccount: preset.dealerAccount || ''
        });
    };

    const handleTabChange = (game) => {
        if (isTestRunning) {
            showToast("請先停止當前運行的測試，再切換遊戲種類！", "error");
            return;
        }
        setActiveGame(game);
        applyPresetData(game);
        showToast(`已切換至 ${gamePresets[game].name} 配置`, "info");
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleReset = () => {
        if (isTestRunning) return;
        applyPresetData(activeGame);
        showToast(`已回復 ${gamePresets[activeGame].name} 的預設值`, "success");
    };

    const showToast = (message, type = "info") => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3000);
    };

    const getLogType = (text) => {
        if (text.startsWith('send:')) return 'send';
        if (text.startsWith('receive:')) return 'receive';
        if (text.startsWith('[SYSTEM]')) return 'system';
        if (text.startsWith('[ERROR]')) return 'error';
        if (text.startsWith('[WARNING]')) return 'error';
        return 'default';
    };

    const appendLogCallback = (text) => {
        setLogs(prev => [
            ...prev,
            {
                id: logIdCounter.current++,
                text,
                type: getLogType(text)
            }
        ]);
    };

    const onStatusChangeCallback = (running) => {
        setIsTestRunning(running);
        if (!running) {
            setRunningGameType('');
            runnerRef.current = null;
        }
    };

    const handleStartTest = () => {
        if (isTestRunning) return;

        if (!formData.websocketUrl || !formData.actionDelay || !formData.testResults) {
            showToast("請填寫所有必要欄位", "error");
            return;
        }

        // Parse Results List if it's comma-separated (RO, SD)
        let parsedResults = formData.testResults;
        if (activeGame === 'ro' || activeGame === 'sd') {
            parsedResults = formData.testResults
                .split(',')
                .map(x => x.trim())
                .filter(x => x !== '')
                .map(x => parseInt(x, 10))
                .filter(x => !isNaN(x));
        }

        // 除了 DC 以外，自動將前端輸入的帳密拼接到 WebSocket URL 尾端
        let finalWsUrl = formData.websocketUrl;
        if (activeGame !== 'dc') {
            finalWsUrl = buildWsUrlWithAuth(formData.websocketUrl, formData.account, formData.password);
        }

        const config = {
            websocketUrl: finalWsUrl,
            actionDelay: formData.actionDelay,
            testResults: parsedResults,
            account: formData.account,
            password: formData.password,
            loginApiUrl: formData.loginApiUrl,
            dealerId: formData.dealerId,
            dealerName: formData.dealerName,
            dealerAccount: formData.dealerAccount
        };

        // Clear logs
        setLogs([
            { id: logIdCounter.current++, text: `[SYSTEM] 啟動純前端瀏覽器測試 (${gamePresets[activeGame].name})...`, type: "system" }
        ]);

        let runner = null;
        if (activeGame === 'dc') {
            runner = new DCRunner(config, appendLogCallback, onStatusChangeCallback);
        } else if (activeGame === 'dt') {
            runner = new DTRunner(config, appendLogCallback, onStatusChangeCallback);
        } else if (activeGame === 'ro') {
            runner = new RORunner(config, appendLogCallback, onStatusChangeCallback);
        } else if (activeGame === 'sd') {
            runner = new SDRunner(config, appendLogCallback, onStatusChangeCallback);
        } else if (activeGame === 'si') {
            runner = new SIRunner(config, appendLogCallback, onStatusChangeCallback);
        }

        if (runner) {
            runnerRef.current = runner;
            setIsTestRunning(true);
            setRunningGameType(activeGame);
            runner.start();
            showToast("測試已啟動", "success");
        } else {
            showToast("找不到對應的測試啟動器", "error");
        }
    };

    const handleStopTest = () => {
        if (!isTestRunning) return;

        if (runnerRef.current) {
            runnerRef.current.stop();
            runnerRef.current = null;
        }
        setIsTestRunning(false);
        setRunningGameType('');
        appendLogCallback("[SYSTEM] 測試已手動中斷。");
        showToast("測試已停止", "info");
    };

    const handleClearLogs = () => {
        setLogs([]);
    };

    const toggleAutoScroll = () => {
        setAutoScroll(prev => !prev);
    };

    const activePreset = gamePresets[activeGame];
    const isCurrentTabRunning = isTestRunning && runningGameType === activeGame;

    return (
        <div className="app-root">
            <header>
                <div className="logo-area">
                    <i className="fa-solid fa-gamepad logo-icon"></i>
                    <div className="logo-title">AUTOMATION CONTROL PLATFORM</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div className="system-status">
                        <div className={`status-dot ${isTestRunning ? 'active' : ''}`}></div>
                        <span style={{ color: isTestRunning ? 'var(--accent-green)' : '' }}>
                            {isTestRunning ? `執行中 (${gamePresets[runningGameType]?.name})` : '系統空閒'}
                        </span>
                    </div>
                </div>
            </header>

            <div className="container">
                {/* Settings Panel */}
                <div className="panel">
                    <div className="panel-title">
                        <i className="fa-solid fa-sliders"></i> 測試參數配置
                    </div>

                    {/* Tab Navigation */}
                    <div className="tabs">
                        {Object.keys(gamePresets).map(game => (
                            <button
                                key={game}
                                className={`tab-btn ${activeGame === game ? 'active' : ''}`}
                                onClick={() => handleTabChange(game)}
                                disabled={isTestRunning}
                            >
                                {game.toUpperCase()}
                            </button>
                        ))}
                    </div>

                    <form onSubmit={e => e.preventDefault()}>
                        {/* WebSocket URL */}
                        <div className="form-group" style={{ marginBottom: "1rem" }}>
                            <label>WebSocket URL</label>
                            <input
                                type="text"
                                className="form-control"
                                value={formData.websocketUrl}
                                onChange={e => handleInputChange('websocketUrl', e.target.value)}
                                disabled={isTestRunning}
                                required
                            />
                        </div>


                        {/* 所有遊戲通用的登入帳號密碼欄位 (明文顯示) */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                            <div className="form-group">
                                <label>登入帳號</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={formData.account}
                                    onChange={e => handleInputChange('account', e.target.value)}
                                    disabled={isTestRunning}
                                    placeholder="請輸入帳號"
                                />
                            </div>
                            <div className="form-group">
                                <label>登入密碼</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={formData.password}
                                    onChange={e => handleInputChange('password', e.target.value)}
                                    disabled={isTestRunning}
                                    placeholder="請輸入密碼"
                                />
                            </div>
                        </div>



                        {/* Non-DC fields */}
                        {activeGame !== 'dc' && (
                            <div style={{ marginBottom: "1rem" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                                    <div className="form-group">
                                        <label>荷官 ID</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={formData.dealerId}
                                            onChange={e => handleInputChange('dealerId', e.target.value)}
                                            disabled={isTestRunning}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>荷官姓名</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={formData.dealerName}
                                            onChange={e => handleInputChange('dealerName', e.target.value)}
                                            disabled={isTestRunning}
                                        />
                                    </div>
                                </div>
                                {(activeGame === 'ro' || activeGame === 'si') && (
                                    <div className="form-group">
                                        <label>荷官帳號</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={formData.dealerAccount}
                                            onChange={e => handleInputChange('dealerAccount', e.target.value)}
                                            disabled={isTestRunning}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Action Delay */}
                        <div className="form-group" style={{ marginBottom: "1rem" }}>
                            <label>
                                動作延遲 (秒) <span className="hint">指令之間的間隔時間</span>
                            </label>
                            <input
                                type="number"
                                className="form-control"
                                min="0.1"
                                max="10"
                                step="0.1"
                                value={formData.actionDelay}
                                onChange={e => handleInputChange('actionDelay', parseFloat(e.target.value) || 1.0)}
                                disabled={isTestRunning}
                                required
                            />
                        </div>

                        {/* Test Results */}
                        <div className="form-group">
                            <label>{activePreset.resultsLabel}</label>
                            <div style={{ marginBottom: "0.3rem" }}>
                                <span className="preset-badge">
                                    <i className="fa-solid fa-circle-info"></i> {activePreset.presetsInfo}
                                </span>
                            </div>
                            <textarea
                                className="form-control"
                                value={formData.testResults}
                                onChange={e => handleInputChange('testResults', e.target.value)}
                                disabled={isTestRunning}
                            />
                        </div>

                        {/* Actions */}
                        <div className="actions-panel">
                            <button
                                type="button"
                                className="btn btn-start"
                                onClick={handleStartTest}
                                disabled={isTestRunning}
                            >
                                {isCurrentTabRunning ? (
                                    <>
                                        <i className="fa-solid fa-spinner fa-spin"></i> 測試中...
                                    </>
                                ) : (
                                    <>
                                        <i className="fa-solid fa-play"></i> 開始測試
                                    </>
                                )}
                            </button>
                            <button
                                type="button"
                                className="btn btn-stop"
                                onClick={handleStopTest}
                                disabled={!isTestRunning}
                            >
                                <i className="fa-solid fa-stop"></i> 停止
                            </button>
                        </div>

                        <button
                            type="button"
                            className="btn btn-reset"
                            onClick={handleReset}
                            disabled={isTestRunning}
                            style={{ width: "100%", marginTop: "1rem" }}
                        >
                            <i className="fa-solid fa-rotate-left"></i> 回復此遊戲預設值
                        </button>
                    </form>
                </div>

                {/* Right Content Area */}
                <div className="right-content">
                    {/* Console Panel */}
                    <div className="panel console-panel">
                    <div className="console-header">
                        <div className="panel-title" style={{ border: "none", padding: 0, margin: 0 }}>
                            <i className="fa-solid fa-terminal"></i> 即時測試日誌
                        </div>
                        <div className="console-controls">
                            <button
                                onClick={toggleAutoScroll}
                                className="console-btn"
                                style={{ color: autoScroll ? 'var(--accent-green)' : 'var(--text-muted)' }}
                            >
                                <i className="fa-solid fa-arrow-down"></i> 自動滾動: {autoScroll ? '開' : '關'}
                            </button>
                            <button onClick={handleClearLogs} className="console-btn">
                                <i className="fa-solid fa-trash-can"></i> 清除日誌
                            </button>
                        </div>
                    </div>
                    <div className="console-body" ref={consoleBodyRef}>
                        {logs.map(log => (
                            <div key={log.id} className={`log-line log-${log.type}`}>
                                {log.text}
                            </div>
                        ))}
                    </div>
                </div>


                </div>
            </div>

            {/* Toasts */}
            <div className="toast-container">
                {toasts.map(t => (
                    <div key={t.id} className={`toast ${t.type} show`}>
                        {t.type === 'success' && <i className="fa-solid fa-circle-check"></i>}
                        {t.type === 'error' && <i className="fa-solid fa-circle-exclamation"></i>}
                        {t.type === 'info' && <i className="fa-solid fa-circle-info"></i>}
                        <span>{t.message}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default App;
