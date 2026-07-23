import { sleep } from '../utils';

export class SI {
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
        this.dealerAccount = config.dealerAccount;
        this.points = [];
    }

    log(msg) {
        const timeStr = new Date().toLocaleTimeString('zh-TW', { hour12: false });
        this.onLog(`[${timeStr}] ${msg}`);
    }

    getPoints(resultChar) {
        if (resultChar === "0") return [1, 1, 1];
        if (resultChar === "1") return [1, 1, 5];
        if (resultChar === "2") return [4, 5, 5];
        return [1, 1, 1];
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
                    if (data.dealerAccount) this.dealerAccount = data.dealerAccount;

                    const status = data.status;
                    const isDicecupReady = data.isDicecupReady;
                    const betCountDown = data.betCountDown !== undefined ? data.betCountDown : -1;

                    if (status === "betting" && betCountDown === 0) {
                        this.running(this.roundId);
                    } else if (status === "running") {
                        this.confirm(this.roundId, this.points);
                    } else if (status === "confirm" && isDicecupReady === true) {
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
        this.points = this.getPoints(this.config.testResults[this.resultIdx]);
        this.log(`[SYSTEM] 第 ${this.resultIdx} 筆 骰點結果: ${JSON.stringify(this.points)}`);
        this.resultIdx += 1;

        await sleep(this.config.actionDelay * 1000);
        if (this.isStopped) return;

        this.sendJson({ action: "LastConfirmRoundId" });
        this.sendJson({
            action: "Betting",
            data: {
                dealerId: this.dealerId,
                dealerName: this.dealerName,
                dealerAccount: this.dealerAccount
            }
        });
    }

    running(rId) {
        this.sendJson({ action: "Running", data: { roundId: rId } });
    }

    confirm(rId, finalPoints) {
        this.sendJson({
            action: "Confirm",
            data: {
                roundId: rId,
                points: finalPoints,
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
