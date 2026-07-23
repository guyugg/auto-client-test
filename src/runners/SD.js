import { sleep } from '../utils';

export class SD {
    constructor(config, onLog, onStatusChange) {
        this.config = config;
        this.onLog = onLog;
        this.onStatusChange = onStatusChange;
        this.ws = null;
        this.isStopped = false;
        this.resultIdx = 0;
        this.roundId = "";
        this.isGameRunning = false;
        this.dealerId = config.dealerId;
        this.dealerName = config.dealerName;
    }

    log(msg) {
        const timeStr = new Date().toLocaleTimeString('zh-TW', { hour12: false });
        this.onLog(`[${timeStr}] ${msg}`);
    }

    async start() {
        this.log(`[SYSTEM] 正在開啟 WebSocket 連線: ${this.config.websocketUrl}`);
        try {
            this.ws = new WebSocket(this.config.websocketUrl);
        } catch (e) {
            this.log(`[ERROR] 建立 WebSocket 失敗: ${e.message}`);
            this.onStatusChange(false);
            return;
        }

        this.ws.onopen = () => {
            this.log("[SYSTEM] WebSocket 連線成功");
        };

        this.ws.onmessage = async (event) => {
            if (this.isStopped) return;
            const message = event.data;
            this.onLog(`receive: ${message}`);

            try {
                const msg = JSON.parse(message);
                const action = msg.action;
                const data = msg.data || {};

                if (action === "LoginSuccess") {
                    await this.bet();
                } else if (action === "CurrentInfo") {
                    if (data.roundId) this.roundId = data.roundId;
                    if (data.dealerId) this.dealerId = data.dealerId;
                    if (data.dealerName) this.dealerName = data.dealerName;

                    const status = data.status;
                    const betCountDown = data.betCountDown !== undefined ? data.betCountDown : -1;

                    if (status === "betting" && betCountDown === 0) {
                        this.running(this.roundId);
                    } else if (status === "running") {
                        const currentRedpoint = this.resultIdx > 0 ? this.config.testResults[this.resultIdx - 1] : 1;
                        this.confirm(this.roundId, currentRedpoint);
                    } else if (status === "confirm") {
                        await this.bet();
                    }
                }
            } catch (e) {
                this.log("[SYSTEM] 收到非 JSON 訊息");
            }
        };

        this.ws.onerror = (err) => {
            this.log(`[ERROR] WebSocket 發生錯誤`);
        };

        this.ws.onclose = (event) => {
            this.log(`[SYSTEM] WebSocket 連線關閉 (Code: ${event.code})`);
            this.onStatusChange(false);
        };
    }

    sendJson(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const msgStr = JSON.stringify(data);
            this.onLog(`send: ${msgStr}`);
            this.ws.send(msgStr);
        }
    }

    async bet() {
        if (this.isGameRunning) return;

        if (this.resultIdx >= this.config.testResults.length) {
            this.log("[SYSTEM] 🎉 測試完全結束");
            this.stop();
            return;
        }

        this.isGameRunning = true;
        const redpoint = this.config.testResults[this.resultIdx];
        this.log(`[SYSTEM] 第 ${this.resultIdx} 筆 redpoint 結果: ${redpoint} (1:單, 4:雙)`);
        this.resultIdx += 1;

        await sleep(this.config.actionDelay * 1000);
        if (this.isStopped) return;

        this.sendJson({ action: "LastConfirmRoundId" });
        this.sendJson({
            action: "Betting",
            data: {
                dealerId: this.dealerId,
                dealerName: this.dealerName
            }
        });
    }

    running(rId) {
        this.sendJson({ action: "Running", data: { roundId: rId } });
    }

    confirm(rId, redpoint) {
        this.sendJson({
            action: "Confirm",
            data: {
                roundId: rId,
                redpoint: redpoint,
                passResultCheck: true
            }
        });
        this.isGameRunning = false;
    }

    stop() {
        this.isStopped = true;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.onStatusChange(false);
    }
}
