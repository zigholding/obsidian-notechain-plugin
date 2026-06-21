// static/js/quick_commands.js
async function createQuickCommandUI() {
    const statusBar = document.getElementById("status-bar");
    const quickBtn = document.createElement("button");
    quickBtn.id = "quick-cmd-btn";
    quickBtn.type = "button";
    quickBtn.title = "快捷命令";
    quickBtn.textContent = "⚡";
    quickBtn.style.cssText = `
        margin-right:8px; border:none; background:transparent; cursor:pointer;
        font-size:16px; padding:0 6px; height:22px; display:flex; align-items:center;
    `;
    const statusDot = document.getElementById("status-dot");
    statusBar.insertBefore(quickBtn, statusDot);

    const menu = document.createElement("div");
    menu.id = "quick-cmd-menu";
    menu.style.cssText = `
        position:absolute; top:34px; left:10px; background:#fff; border:1px solid #ccc;
        border-radius:6px; display:none; flex-direction:column; z-index:1002; min-width:140px;
        box-shadow:0 6px 18px rgba(0,0,0,0.12); padding:6px 6px;
    `;
    document.body.appendChild(menu);

    // 获取快捷命令
    try {
        const res = await fetch("/oldbuddy/api/quick_commands");
        if (!res.ok) throw new Error("获取快捷命令失败");
        const data = await res.json();
        const cmds = data.commands ?? [];
        console.log(cmds)
        cmds.forEach(cmd => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = cmd.label;
            btn.dataset.cmdId = cmd.id;
            btn.dataset.cmdText = cmd.text;
            btn.style.cssText = `
                padding:8px; border:none; background:transparent; text-align:left;
                cursor:pointer; width:100%;
            `;
            btn.onmouseover = () => btn.style.background = "#f5f5f5";
            btn.onmouseout = () => btn.style.background = "transparent";
            btn.onclick = async (e) => {
                e.stopPropagation();
                menu.style.display = "none";
                await sendQuickCommand(btn.dataset.cmdText, btn.dataset.cmdId);
            };
            menu.appendChild(btn);
        });
    } catch (err) {
        console.error("[quick_commands] 加载失败：", err);
    }

    quickBtn.onclick = (e) => {
        e.stopPropagation();
        menu.style.display = menu.style.display === "none" ? "block" : "none";
        const rect = quickBtn.getBoundingClientRect();
        menu.style.left = `${Math.max(8, rect.left)}px`;
    };

    document.addEventListener("click", () => { menu.style.display = "none"; });
    menu.addEventListener("click", (e) => e.stopPropagation());
}

async function sendQuickCommand(text, cmdId = null) {
    if (!text) return;
    try {
        const target = (typeof getCurrentChatTarget === "function")
            ? getCurrentChatTarget()
            : "local";
        const res = await fetch('/oldbuddy/api/message/text', {
            method: "POST",
            body: new URLSearchParams({
                content: text,
                sender: "user",
                quick_cmd_id: cmdId || "",
                target
            })
        });
        if (!res.ok) throw new Error("服务器返回错误");
        const data = await res.json();
        if (data?.message && typeof appendMessage === "function") {
            appendMessage(data.message);
        }
    } catch (err) {
        console.error("[quick_commands] 发送失败：", err);
        alert("发送快捷命令失败");
    }
}
