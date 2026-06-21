let ws;
function connectWS() {
    ws = new WebSocket((location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/oldbuddy/ws");

    ws.onopen = () => {
        document.getElementById('status-dot').style.backgroundColor = 'green';
        document.getElementById('status-text').textContent = '在线';
    };

    ws.onclose = () => {
        document.getElementById('status-dot').style.backgroundColor = 'gray';
        document.getElementById('status-text').textContent = '离线';
        // 尝试重连
        setTimeout(connectWS, 3000);
    };

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            appendMessage(msg); // 使用新增的去重机制渲染消息
        } catch (e) { console.error("WebSocket parse error:", e); }
    };

    ws.onerror = (e) => {
        console.warn("WebSocket error", e);
    };
}