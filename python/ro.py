#!/usr/bin/env python3
# coding: utf-8

"""
===============================================================================
【RO 控端自動化測試腳本 (輪盤 / RO)】
===============================================================================
說明: 本腳本用於自動化發送 RO (輪盤) 桌台控端指令（下注、啟動滾球、確認結算）。
"""

import json
import time
from websocket import WebSocketApp

# =============================================================================
# 1. 基礎設定與參數配置 (CONFIG & PARAMETERS)
# =============================================================================
# 伺服器與連線設定
WEBSOCKET_URL = "ws://10.80.41.31:8051/api/ws?account=qaroboss&password=aaaa1234"

# 預設荷官資訊
DEALER_ID = "69085a77a975e42c479440ee"
DEALER_NAME = "測試者二"
DEALER_ACCOUNT = "D0ES2"

# 流程動作間隔時間 (秒)
ACTION_DELAY_SECONDS = 1.0

# 測試點數結果清單 (輪盤號碼 0 ~ 36)
TEST_RESULTS = [1, 12, 0, 36, 17, 24, 5, 8, 19, 2, 35, 10, 28]

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
    point = TEST_RESULTS[result_idx]
    log_info(f"第 {result_idx} 筆 輪盤開獎點數: {point}")
    result_idx += 1

    time.sleep(ACTION_DELAY_SECONDS)
    send_json({"action": "LastConfirmRoundId"})
    send_json(
        {
            "action": "Betting",
            "data": {
                "dealerId": DEALER_ID,
                "dealerName": DEALER_NAME,
                "dealerAccount": DEALER_ACCOUNT,
            },
        }
    )


def running(r_id):
    """發送滾球 / 啟動開獎流程指令"""
    send_json({"action": "Running", "data": {"roundId": r_id}})


def confirm(r_id, point):
    """發送確認結算指令"""
    global is_running
    send_json(
        {
            "action": "Confirm",
            "data": {
                "roundId": r_id,
                "point": point,
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
    global round_id, DEALER_ID, DEALER_NAME, DEALER_ACCOUNT

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

            d_acc = data.get("dealerAccount")
            if d_acc:
                DEALER_ACCOUNT = d_acc

            status = data.get("status")
            bet_count_down = data.get("betCountDown", -1)

            # 下注倒數結束 $\rightarrow$ 觸發 Running
            if status == "betting" and bet_count_down == 0:
                running(round_id)

            # 進入 running 階段 $\rightarrow$ 發送 Confirm 結算
            elif status == "running":
                current_point = (
                    TEST_RESULTS[result_idx - 1] if result_idx > 0 else 0
                )
                confirm(round_id, current_point)

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
