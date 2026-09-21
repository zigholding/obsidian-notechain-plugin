let ws;
let es;
let wsReconnectTimer;
let wsGen = 0;

function setLiveStatus(online) {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    if (!dot || !text) return;
    if (online) {
        dot.classList.add('is-online');
        dot.classList.remove('is-offline');
        text.textContent = '在线';
    } else {
        dot.classList.remove('is-online');
        dot.classList.add('is-offline');
        text.textContent = '离线';
    }
}

function isLiveOnline() {
    const wsOpen = !!(ws && ws.readyState === WebSocket.OPEN);
    const esOpen = !!(typeof EventSource !== 'undefined' && es && es.readyState === EventSource.OPEN);
    return wsOpen || esOpen;
}

function refreshLiveStatus() {
    setLiveStatus(isLiveOnline());
}

function onLiveMessage(raw) {
    try {
        const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (msg && typeof appendMessage === 'function') appendMessage(msg);
    } catch (e) {
        console.error('live message parse error', e);
    }
}

function connectSSE() {
    if (typeof EventSource === 'undefined') return;
    if (es) {
        es.onopen = null;
        es.onerror = null;
        es.onmessage = null;
        es.close();
        es = null;
    }
    es = new EventSource('/oldbuddy/api/stream');
    es.onopen = () => refreshLiveStatus();
    es.onmessage = (event) => onLiveMessage(event.data);
    es.onerror = () => refreshLiveStatus();
}

function connectWS() {
    if (!es || es.readyState === EventSource.CLOSED) {
        connectSSE();
    }
    const gen = ++wsGen;
    if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
    }
    if (ws) {
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        try { ws.close(); } catch (e) { /* ignore */ }
        ws = null;
    }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(proto + '://' + location.host + '/oldbuddy/ws');
    ws.onopen = () => {
        if (gen !== wsGen) return;
        refreshLiveStatus();
    };
    ws.onclose = () => {
        if (gen !== wsGen) return;
        refreshLiveStatus();
        wsReconnectTimer = setTimeout(function () {
            if (gen !== wsGen) return;
            connectWS();
        }, 3000);
    };
    ws.onmessage = (event) => onLiveMessage(event.data);
    ws.onerror = () => {};
}
