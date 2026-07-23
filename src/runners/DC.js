import { sleep } from '../utils';

export class DC {
    constructor(config, onLog, onStatusChange) {
        this.config = config;
        this.onLog = onLog;
        this.onStatusChange = onStatusChange;
        this.ws = null;
        this.isStopped = false;
        this.resultIdx = 0;
        this.roundNumber = 0;
        this.roundId = "";
        this.cards = { P1: "", P2: "", B1: "", B2: "", P3: "", B3: "" };
        this.points = "";
    }

    log(msg) {
        const timeStr = new Date().toLocaleTimeString('zh-TW', { hour12: false });
        this.onLog(`[${timeStr}] ${msg}`);
    }

    async start() {
        if (this.isStopped) return;

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

                if (action === "Connect") {
                    this.roundNumber = msg.data.roundnumber + 1;
                    this.updateStatus("Betting");
                    this.bet(this.roundNumber);
                } else if (action === "NewRound") {
                    this.roundId = msg.data.roundid;
                    this.updateStatus("Dealing");

                    const winner = this.config.testResults[this.resultIdx];
                    this.log(`[SYSTEM] 第 ${this.resultIdx} 局勝負開牌結果: ${winner} (1:閒勝, 2:庄勝)`);

                    if (winner === "1") {
                        await this.pWin(this.roundId);
                    } else if (winner === "2") {
                        await this.bWin(this.roundId);
                    }

                    if (this.isStopped) return;
                    this.confirm(this.roundId, this.cards, this.points);
                } else if (action === "Confirm" && msg.data?.result === true) {
                    this.updateStatus("Init");
                    await sleep(this.config.actionDelay * 1000);
                    if (this.isStopped) return;

                    this.resultIdx += 1;
                    if (this.resultIdx >= this.config.testResults.length) {
                        this.log("[SYSTEM] 🎉 測試完全結束");
                        this.stop();
                        return;
                    }

                    this.updateStatus("Betting");
                    this.roundNumber += 1;
                    this.cards = { P1: "", P2: "", B1: "", B2: "", P3: "", B3: "" };
                    this.points = "";
                    this.bet(this.roundNumber);
                }
            } catch (e) {
                this.log("[SYSTEM] 收到非 JSON 訊息");
            }
        };

        this.ws.onerror = (err) => {
            this.log(`[ERROR] WebSocket 發生錯誤`);
        };

        this.ws.onclose = (event) => {
            this.log(`[SYSTEM] WebSocket 連線關閉 (Code: ${event.code}, Reason: ${event.reason || '無'})`);
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

    updateStatus(state) {
        this.sendJson({
            action: "UpdateState",
            data: { state },
            timestamp: Date.now(),
            mid: ""
        });
    }

    bet(rNum) {
        this.sendJson({
            action: "Betting",
            data: {
                roundnumber: rNum,
                stoptime: Date.now()
            },
            timestamp: Date.now(),
            mid: ""
        });
    }

    dealing(rId, currentCards) {
        this.sendJson({
            action: "Dealing",
            data: {
                roundid: rId,
                cards: currentCards
            },
            timestamp: Date.now(),
            mid: ""
        });
    }

    dcResult(resultCode) {
        this.sendJson({
            action: "DCResult",
            data: { result: resultCode },
            timestamp: Date.now(),
            mid: ""
        });
    }

    confirm(rId, finalCards, finalPoints) {
        this.sendJson({
            action: "Confirm",
            data: {
                results: {
                    cards: finalCards,
                    points: finalPoints,
                    result: ""
                },
                roundid: rId
            },
            timestamp: Date.now(),
            mid: ""
        });
    }

    async pWin(rId) {
        this.cards.P1 = "C11";
        this.dealing(rId, this.cards);
        await sleep(this.config.actionDelay * 1000);
        if (this.isStopped) return;

        this.cards.P2 = "S9";
        this.dealing(rId, this.cards);
        await sleep(this.config.actionDelay * 1000);
        if (this.isStopped) return;

        this.cards.B1 = "D4";
        this.dealing(rId, this.cards);
        await sleep(this.config.actionDelay * 1000);
        if (this.isStopped) return;

        this.cards.B2 = "D10";
        this.dealing(rId, this.cards);
        await sleep(this.config.actionDelay * 1000);
        if (this.isStopped) return;

        this.updateStatus("Confirm");
        this.dcResult("P");
        this.points = "9,4";
    }

    async bWin(rId) {
        this.cards.P1 = "D4";
        this.dealing(rId, this.cards);
        await sleep(this.config.actionDelay * 1000);
        if (this.isStopped) return;

        this.cards.P2 = "D10";
        this.dealing(rId, this.cards);
        await sleep(this.config.actionDelay * 1000);
        if (this.isStopped) return;

        this.cards.B1 = "C11";
        this.dealing(rId, this.cards);
        await sleep(this.config.actionDelay * 1000);
        if (this.isStopped) return;

        this.cards.B2 = "S9";
        this.dealing(rId, this.cards);
        await sleep(this.config.actionDelay * 1000);
        if (this.isStopped) return;

        this.updateStatus("Confirm");
        this.dcResult("B");
        this.points = "4,9";
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
