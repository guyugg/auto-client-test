#!/usr/bin/env python3
# coding: utf-8

"""
===============================================================================
【SD 控端自動化測試腳本 (色碟 SD)】
===============================================================================
說明: 本腳本用於自動化發送 SD (色碟) 桌台控端指令（下注、搖骰開蓋、確認結算）。
"""

import json
import time
from websocket import WebSocketApp

# =============================================================================
# 1. 基礎設定與參數配置 (CONFIG & PARAMETERS)
# =============================================================================
# 伺服器與連線設定
WEBSOCKET_URL = "ws://10.80.41.31:8031/api/ws?account=qasdcboss&password=aaaa1234"

# 預設荷官資訊
DEALER_ID = "67fcd2936aef8f1e0afaf845"
DEALER_NAME = "bb"

# 流程動作間隔時間 (秒)
ACTION_DELAY_SECONDS = 1.0

# 測試結果模式 (1: 單, 4: 雙)
# 說明: 連8單、連8双、連5單、1双、連6單、連3双、連3單、連9双、1單、連8双
TEST_RESULTS = (
    [1] * 8
    + [4] * 8
    + [1] * 5
    + [4] * 1
    + [1] * 6
    + [4] * 3
    + [1] * 3
    + [4] * 9
    + [1] * 1
    + [4] * 8
)

# =============================================================================
# 2. 全域狀態變數 (GLOBAL STATE)
# =============================================================================
round_id = ""
result_idx = 0
is_running = False
ws_app = None


# =============================================================================
# 3. 訊息發送與輔助函式 (HELPER & NETWORK)
# =============================================================================
def log_info(msg):
    """標準化日誌輸出"""
    print(f"[{time.strftime('%H:%M:%S')}] {msg}")


def send_json(params):
    """序列化並發送 JSON 訊息"""
    message = json.dumps(params)
    print(f"send: {message}")
    if ws_app:
        ws_app.send(message)


# =============================================================================
# 4. 業務流程步驟 (GAME ACTION STEPS)
# =============================================================================
def bet():
    """發送開啟下注指令"""
    global is_running, result_idx

    if is_running:
        return

    if result_idx >= len(TEST_RESULTS):
        log_info("🎉 測試完全結束")
        if ws_app:
            ws_app.close()
        return

    is_running = True
    redpoint = TEST_RESULTS[result_idx]
    log_info(f"第 {result_idx} 筆 redpoint 結果: {redpoint} (1:單, 4:雙)")
    result_idx += 1

    time.sleep(ACTION_DELAY_SECONDS)
    send_json({"action": "LastConfirmRoundId"})
    send_json(
        {
            "action": "Betting",
            "data": {
                "dealerId": DEALER_ID,
                "dealerName": DEALER_NAME,
            },
        }
    )


def running(r_id):
    """發送搖骰 / 啟動開蓋流程指令"""
    send_json({"action": "Running", "data": {"roundId": r_id}})


def confirm(r_id, redpoint):
    """發送確認結算指令 (附帶 passResultCheck 強制通過校驗)"""
    global is_running
    send_json(
        {
            "action": "Confirm",
            "data": {
                "roundId": r_id,
                "redpoint": redpoint,
                "passResultCheck": True,
            },
        }
    )
    is_running = False


# =============================================================================
# 5. WEBSOCKET 事件處理器 (EVENT HANDLERS)
# =============================================================================
def on_open(ws):
    log_info("WebSocket 連線成功")


def on_message(ws, message):
    global round_id, DEALER_ID, DEALER_NAME

    print("receive:", message)
    try:
        msg = json.loads(message)
        action = msg.get("action")
        data = msg.get("data", {})

        if action == "LoginSuccess":
            bet()

        elif action == "CurrentInfo":
            # 動態更新最新局號與荷官資訊
            r_id = data.get("roundId")
            if r_id:
                round_id = r_id

            d_id = data.get("dealerId")
            if d_id:
                DEALER_ID = d_id

            d_name = data.get("dealerName")
            if d_name:
                DEALER_NAME = d_name

            status = data.get("status")
            bet_count_down = data.get("betCountDown", -1)

            # 下注倒數結束 $\rightarrow$ 觸發 Running
            if status == "betting" and bet_count_down == 0:
                running(round_id)

            # 進入 running 階段 $\rightarrow$ 發送 Confirm 結算
            elif status == "running":
                current_redpoint = TEST_RESULTS[result_idx - 1] if result_idx > 0 else 1
                confirm(round_id, current_redpoint)

            # 結算完成 $\rightarrow$ 開啟下一局下注
            elif status == "confirm":
                bet()

    except json.JSONDecodeError:
        log_info("收到非 JSON 訊息")


def on_error(ws, error):
    log_info(f"WebSocket 錯誤: {error}")


def on_close(ws, close_status_code, close_msg):
    log_info(f"WebSocket 連線關閉 (Code: {close_status_code}, Msg: {close_msg})")


# =============================================================================
# 6. 主程式執行入口 (MAIN ENTRYPOINT)
# =============================================================================
if __name__ == "__main__":
    ws_app = WebSocketApp(
        WEBSOCKET_URL,
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close,
    )
    ws_app.run_forever()