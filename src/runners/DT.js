import { sleep } from '../utils';

export class DT {
    constructor(config, onLog, onStatusChange) {
        this.config = config;
        this.onLog = onLog;
        this.onStatusChange = onStatusChange;
        this.ws = null;
        this.isStopped = false;
        this.resultIdx = 0;
        this.roundId = "";
        this.winner = "1";
        this.isGameRunning = false;
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
                    const status = data.status;
                    const betCountDown = data.betCountDown !== undefined ? data.betCountDown : -1;
                    const d = data.d || "";
                    const t = data.t || "";

                    if (data.roundId) this.roundId = data.roundId;

                    if (status === "betting" && betCountDown === 0) {
                        this.dealing(this.roundId, this.winner);
                    } else if (status === "dealing" && d !== "" && t !== "") {
                        this.confirm(this.roundId, this.winner);
                    } else if (status === "confirm" && d !== "" && t !== "") {
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

    getDragonCard(winCode) {
        return winCode === "1" ? "C3" : "C7";
    }

    getTigerCard(winCode) {
        return winCode === "1" ? "C7" : "C3";
    }

    async bet() {
        if (this.isGameRunning) return;

        if (this.resultIdx >= this.config.testResults.length) {
            this.log("[SYSTEM] 🎉 測試完全結束");
            this.stop();
            return;
        }

        this.isGameRunning = true;
        this.winner = this.config.testResults[this.resultIdx];
        this.log(`[SYSTEM] 第 ${this.resultIdx} 局勝負開牌結果: ${this.winner} (1:紅虎勝, 2:藍龍勝)`);
        this.resultIdx += 1;

        await sleep(this.config.actionDelay * 1000);
        if (this.isStopped) return;

        this.sendJson({
            action: "Betting",
            data: {
                dealerId: this.config.dealerId,
                dealerName: this.config.dealerName
            }
        });
    }

    dealing(rId, winCode) {
        const dragonCard = this.getDragonCard(winCode);
        const tigerCard = this.getTigerCard(winCode);

        this.sendJson({ action: "Dealing", data: { roundId: rId } });
        this.sendJson({ action: "Dealing", data: { roundId: rId, d: dragonCard } });
        this.sendJson({ action: "Dealing", data: { roundId: rId, t: tigerCard } });
    }

    confirm(rId, winCode) {
        const dragonCard = this.getDragonCard(winCode);
        const tigerCard = this.getTigerCard(winCode);

        this.sendJson({
            action: "Confirm",
            data: {
                roundId: rId,
                d: dragonCard,
                t: tigerCard
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
