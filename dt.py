#!/usr/bin/env python3
# coding: utf-8

"""
===============================================================================
【DT 控端自動化測試腳本 (龍虎 / DT)】
===============================================================================
說明: 本腳本用於自動化發送 DT (龍虎) 桌台控端指令（下注、開牌、確認結算）。
"""

import json
import time
from websocket import WebSocketApp

# =============================================================================
# 1. 基礎設定與參數配置 (CONFIG & PARAMETERS)
# =============================================================================
# 伺服器與連線設定
WEBSOCKET_URL = "ws://10.80.41.31:8061/api/ws?account=qadtcboss&password=aaaa1234"

# 預設荷官資訊
DEALER_ID = "67e21d167fdff87ac13d554c"
DEALER_NAME = "bb"

# 流程動作間隔時間 (秒)
ACTION_DELAY_SECONDS = 1.0

# 測試結果模式 (1: 紅虎勝 [龍:C3/虎:C7], 2: 藍龍勝 [龍:C7/虎:C3])
TEST_RESULTS = "1221221221122112212212221221221122212121212121111111"

# =============================================================================
# 2. 全域狀態變數 (GLOBAL STATE)
# =============================================================================
round_id = ""
winner = "1"
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


def get_dragon_card(win_code):
    """取得龍家牌面 ("C3" 若 1:紅虎勝，"C7" 若 2:藍龍勝)"""
    return "C3" if win_code == "1" else "C7"


def get_tiger_card(win_code):
    """取得虎家牌面 ("C7" 若 1:紅虎勝，"C3" 若 2:藍龍勝)"""
    return "C7" if win_code == "1" else "C3"


# =============================================================================
# 4. 業務流程步驟 (GAME ACTION STEPS)
# =============================================================================
def bet():
    """發送開啟下注指令"""
    global is_running, winner, result_idx

    if is_running:
        return

    if result_idx >= len(TEST_RESULTS):
        log_info("🎉 測試完全結束")
        if ws_app:
            ws_app.close()
        return

    is_running = True
    winner = TEST_RESULTS[result_idx]
    log_info(f"第 {result_idx} 筆勝負結果: {winner} (1:紅虎勝, 2:藍龍勝)")
    result_idx += 1

    time.sleep(ACTION_DELAY_SECONDS)
    send_json(
        {
            "action": "Betting",
            "data": {
                "dealerId": DEALER_ID,
                "dealerName": DEALER_NAME,
            },
        }
    )


def dealing(r_id, win_code):
    """發送開牌指令 (分別送出龍牌與虎牌)"""
    dragon_card = get_dragon_card(win_code)
    tiger_card = get_tiger_card(win_code)

    send_json({"action": "Dealing", "data": {"roundId": r_id}})
    send_json({"action": "Dealing", "data": {"roundId": r_id, "d": dragon_card}})
    send_json({"action": "Dealing", "data": {"roundId": r_id, "t": tiger_card}})


def confirm(r_id, win_code):
    """發送確認結算指令"""
    global is_running
    dragon_card = get_dragon_card(win_code)
    tiger_card = get_tiger_card(win_code)

    send_json(
        {
            "action": "Confirm",
            "data": {
                "roundId": r_id,
                "d": dragon_card,
                "t": tiger_card,
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
    global round_id, winner

    print("receive:", message)
    try:
        msg = json.loads(message)
        action = msg.get("action")
        data = msg.get("data", {})

        if action == "LoginSuccess":
            bet()

        elif action == "CurrentInfo":
            status = data.get("status")
            bet_count_down = data.get("betCountDown", -1)
            d = data.get("d", "")
            t = data.get("t", "")

            # 提取最新局號
            r_id = data.get("roundId")
            if r_id:
                round_id = r_id

            # 下注倒數結束 $\rightarrow$ 開始發牌
            if status == "betting" and bet_count_down == 0:
                dealing(round_id, winner)

            # 發牌完成 $\rightarrow$ 發送確認結算
            elif status == "dealing" and d != "" and t != "":
                confirm(round_id, winner)

            # 結算完成 $\rightarrow$ 開啟下一局下注
            elif status == "confirm" and d != "" and t != "":
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