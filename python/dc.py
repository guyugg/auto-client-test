#!/usr/bin/env python3
# coding: utf-8

"""
===============================================================================
【DC 控端自動化測試腳本 (百家樂 / DC)】
===============================================================================
說明: 本腳本用於自動化發送 DC (百家樂) 桌台控端指令（登入、下注、發牌、宣告結果、確認結算）。
"""

import json
import time
import requests
from websocket import WebSocketApp

# =============================================================================
# 1. 基礎設定與參數配置 (CONFIG & PARAMETERS)
# =============================================================================
# 伺服器與連線設定
WEBSOCKET_URL = "ws://10.80.41.31:8001/api/ws/dcfront"
LOGIN_API_URL = "http://10.80.41.31:8001/api/user/login"

# 帳號與密碼憑證
USER_ACCOUNT = "qadcboss"
USER_PASSWORD = "aaaa1234"

# 流程發牌延遲時間 (秒)
ACTION_DELAY_SECONDS = 1.0

# 測試結果模式 (1: 閒勝 P, 2: 庄勝 B)
# 說明: 連8閒、連8庄、連5閒、1庄、連6閒、連3庄、連3閒、連9庄、1閒、連8庄
TEST_RESULTS = "1111111122222222111112111111222111222222222122222222"

# =============================================================================
# 2. 全域狀態變數 (GLOBAL STATE)
# =============================================================================
round_number = 0
round_id = ""
result_idx = 0
cards = {"P1": "", "P2": "", "B1": "", "B2": "", "P3": "", "B3": ""}
points = ""
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


def send_login(url):
    """執行 HTTP 登入 API 取得 Session 後啟動 WebSocket 連線"""
    payload = {
        "useraccount": USER_ACCOUNT,
        "userpassword": USER_PASSWORD,
    }
    headers = {"Content-Type": "application/json"}
    try:
        log_info(f"正在登入 API: {url} ...")
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        log_info(f"登入狀態碼: {response.status_code}")

        try:
            log_info(f"登入回應: {response.json()}")
            log_info("啟動 WebSocket 連線...")
            ws_app.run_forever()
        except ValueError:
            log_info(f"非 JSON 回應內容: {response.text}")
    except requests.RequestException as e:
        log_info(f"HTTP 請求錯誤: {e}")


# =============================================================================
# 4. 業務流程步驟 (GAME ACTION STEPS)
# =============================================================================
def update_status(state):
    """更新桌台狀態 (Betting, Dealing, Confirm, Init)"""
    msg = {
        "action": "UpdateState",
        "data": {"state": state},
        "timestamp": int(time.time() * 1000),
        "mid": "",
    }
    send_json(msg)


def bet(r_num):
    """發送下注階段指令"""
    msg = {
        "action": "Betting",
        "data": {
            "roundnumber": r_num,
            "stoptime": int(time.time() * 1000),
        },
        "timestamp": int(time.time() * 1000),
        "mid": "",
    }
    send_json(msg)


def dealing(r_id, current_cards):
    """發送發牌與補牌狀態"""
    msg = {
        "action": "Dealing",
        "data": {
            "roundid": r_id,
            "cards": current_cards,
        },
        "timestamp": int(time.time() * 1000),
        "mid": "",
    }
    send_json(msg)


def dc_result(result_code):
    """發送勝負宣告結果 ('P' 或 'B')"""
    msg = {
        "action": "DCResult",
        "data": {"result": result_code},
        "timestamp": int(time.time() * 1000),
        "mid": "",
    }
    send_json(msg)


def confirm(r_id, final_cards, final_points):
    """發送結算確認指令"""
    msg = {
        "action": "Confirm",
        "data": {
            "results": {
                "cards": final_cards,
                "points": final_points,
                "result": "",
            },
            "roundid": r_id,
        },
        "timestamp": int(time.time() * 1000),
        "mid": "",
    }
    send_json(msg)


def p_win(r_id):
    """閒勝牌型模擬 (P:9分, B:4分)"""
    global cards, points

    cards["P1"] = "C11"
    dealing(r_id, cards)
    time.sleep(ACTION_DELAY_SECONDS)

    cards["P2"] = "S9"
    dealing(r_id, cards)
    time.sleep(ACTION_DELAY_SECONDS)

    cards["B1"] = "D4"
    dealing(r_id, cards)
    time.sleep(ACTION_DELAY_SECONDS)

    cards["B2"] = "D10"
    dealing(r_id, cards)
    time.sleep(ACTION_DELAY_SECONDS)

    update_status("Confirm")
    dc_result("P")
    points = "9,4"


def b_win(r_id):
    """庄勝牌型模擬 (P:4分, B:9分)"""
    global cards, points

    cards["P1"] = "D4"
    dealing(r_id, cards)
    time.sleep(ACTION_DELAY_SECONDS)

    cards["P2"] = "D10"
    dealing(r_id, cards)
    time.sleep(ACTION_DELAY_SECONDS)

    cards["B1"] = "C11"
    dealing(r_id, cards)
    time.sleep(ACTION_DELAY_SECONDS)

    cards["B2"] = "S9"
    dealing(r_id, cards)
    time.sleep(ACTION_DELAY_SECONDS)

    update_status("Confirm")
    dc_result("B")
    points = "4,9"


# =============================================================================
# 5. WEBSOCKET 事件處理器 (EVENT HANDLERS)
# =============================================================================
def on_open(ws):
    log_info("WebSocket 連線成功")


def on_message(ws, message):
    global round_number, round_id, result_idx, cards, points

    print("receive:", message)
    try:
        msg = json.loads(message)
        action = msg.get("action")

        if action == "Connect":
            round_number = msg["data"]["roundnumber"] + 1
            update_status("Betting")
            bet(round_number)

        elif action == "NewRound":
            round_id = msg["data"]["roundid"]
            update_status("Dealing")

            winner = TEST_RESULTS[result_idx]
            if winner == "1":
                p_win(round_id)
            elif winner == "2":
                b_win(round_id)

            confirm(round_id, cards, points)

        elif action == "Confirm" and msg.get("data", {}).get("result") is True:
            update_status("Init")
            time.sleep(ACTION_DELAY_SECONDS)

            result_idx += 1
            if result_idx >= len(TEST_RESULTS):
                log_info("🎉 測試完全結束")
                ws.close()
                return

            update_status("Betting")
            round_number += 1
            cards = {"P1": "", "P2": "", "B1": "", "B2": "", "P3": "", "B3": ""}
            points = ""
            bet(round_number)

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
    send_login(LOGIN_API_URL)