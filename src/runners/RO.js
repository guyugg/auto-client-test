import { sleep } from '../utils';

export class RO {
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
                    if (data.dealerAccount) this.dealerAccount = data.dealerAccount;

                    const status = data.status;
                    const betCountDown = data.betCountDown !== undefined ? data.betCountDown : -1;

                    if (status === "betting" && betCountDown === 0) {
                        this.running(this.roundId);
                    } else if (status === "running") {
                        const currentPoint = this.resultIdx > 0 ? this.config.testResults[this.resultIdx - 1] : 0;
                        this.confirm(this.roundId, currentPoint);
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
        const point = this.config.testResults[this.resultIdx];
        this.log(`[SYSTEM] 第 ${this.resultIdx} 筆 輪盤開獎點數: ${point}`);
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

    confirm(rId, point) {
        this.sendJson({
            action: "Confirm",
            data: {
                roundId: rId,
                point: point
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
