// static/js/upload.js

// ---------- 图片上传（预览 + 文字组合发送） ----------
async function handleImageFile(file) {
    if (!file) return;
    const previewOverlay = document.createElement('div');
    previewOverlay.style.position = 'fixed'; previewOverlay.style.top = '0'; previewOverlay.style.left = '0';
    previewOverlay.style.width = '100%'; previewOverlay.style.height = '100%';
    previewOverlay.style.background = 'rgba(0,0,0,0.6)'; previewOverlay.style.display = 'flex';
    previewOverlay.style.flexDirection = 'column'; previewOverlay.style.alignItems = 'center';
    previewOverlay.style.justifyContent = 'center'; previewOverlay.style.zIndex = '2000';

    const img = document.createElement('img'); img.src = URL.createObjectURL(file);
    img.style.maxWidth = '80%'; img.style.maxHeight = '50%'; img.style.borderRadius = '8px';
    previewOverlay.appendChild(img);

    const textInput = document.createElement('input'); textInput.type = 'text'; textInput.placeholder = '输入文字...';
    textInput.style.marginTop = '10px'; textInput.style.padding = '8px 12px'; textInput.style.width = '60%'; textInput.style.borderRadius = '20px';
    previewOverlay.appendChild(textInput);

    const btnWrapper = document.createElement('div'); btnWrapper.style.marginTop = '10px';
    const sendBtn = document.createElement('button'); sendBtn.textContent = '发送';
    const cancelBtn = document.createElement('button'); cancelBtn.textContent = '取消';
    btnWrapper.appendChild(sendBtn); btnWrapper.appendChild(cancelBtn);
    previewOverlay.appendChild(btnWrapper);
    document.body.appendChild(previewOverlay);

    cancelBtn.onclick = () => { document.body.removeChild(previewOverlay); }
    sendBtn.onclick = async () => {
        const formData = new FormData(); formData.append('file', file); formData.append('sender', 'user');
        if (typeof getCurrentChatTarget === 'function') formData.append('target', getCurrentChatTarget());
        const extra_text = textInput.value.trim(); if (extra_text) formData.append('extra_text', extra_text);
        try { const res = await fetch('api/message/image', { method: 'POST', body: formData }); const data = await res.json(); if (data && data.message) appendMessage(data.message); }
        catch (e) { console.error(e); alert('上传失败'); }
        document.body.removeChild(previewOverlay);
    };
}

// ---------- 任意文件上传（弹窗 + 文字组合发送） ----------
async function handleAnyFile(file, inputEl) {
    if (!file) return;

    const previewOverlay = document.createElement('div');
    previewOverlay.style.position = 'fixed'; previewOverlay.style.top = '0'; previewOverlay.style.left = '0';
    previewOverlay.style.width = '100%'; previewOverlay.style.height = '100%';
    previewOverlay.style.background = 'rgba(0,0,0,0.6)'; previewOverlay.style.display = 'flex';
    previewOverlay.style.flexDirection = 'column'; previewOverlay.style.alignItems = 'center';
    previewOverlay.style.justifyContent = 'center'; previewOverlay.style.zIndex = '2000';

    const fileInfo = document.createElement('div');
    fileInfo.textContent = `文件: ${file.name}`;
    fileInfo.style.background = '#fff';
    fileInfo.style.padding = '10px 14px';
    fileInfo.style.borderRadius = '8px';
    previewOverlay.appendChild(fileInfo);

    const textInput = document.createElement('input'); textInput.type = 'text'; textInput.placeholder = '输入附加文字...';
    textInput.style.marginTop = '10px'; textInput.style.padding = '8px 12px'; textInput.style.width = '60%'; textInput.style.borderRadius = '20px';
    previewOverlay.appendChild(textInput);

    const btnWrapper = document.createElement('div'); btnWrapper.style.marginTop = '10px';
    const sendBtn = document.createElement('button'); sendBtn.textContent = '发送';
    const cancelBtn = document.createElement('button'); cancelBtn.textContent = '取消';
    btnWrapper.appendChild(sendBtn); btnWrapper.appendChild(cancelBtn);
    previewOverlay.appendChild(btnWrapper);
    document.body.appendChild(previewOverlay);

    cancelBtn.onclick = () => {
        if (inputEl) inputEl.value = '';
        document.body.removeChild(previewOverlay);
    };
    sendBtn.onclick = async () => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('sender', 'user');
        if (typeof getCurrentChatTarget === 'function') formData.append('target', getCurrentChatTarget());
        const extra_text = textInput.value.trim(); if (extra_text) formData.append('extra_text', extra_text);
        try { const res = await fetch('api/message/file', { method: 'POST', body: formData }); const data = await res.json(); if (data && data.message) appendMessage(data.message); }
        catch (e) { console.error(e); alert('文件上传失败'); }
        if (inputEl) inputEl.value = '';
        document.body.removeChild(previewOverlay);
    };
}


async function initUploadHandlers() {
    document.getElementById('camera-input').onchange = (e) => handleImageFile(e.target.files[0]);
    document.getElementById('gallery-input').onchange = (e) => handleImageFile(e.target.files[0]);

    // ---------- 任意文件上传 ----------
    document.getElementById('anyfile-input').onchange = async (e) => {
        const inputEl = e.target;
        const file = inputEl.files[0];
        if (!file) return;
        await handleAnyFile(file, inputEl);
    };

    // ---------- 语音录音 ----------
    let mediaRecorder, audioChunks = [], isRecording = false;
    const audioBtn = document.getElementById('send-audio');
    audioBtn.onclick = async () => {
        if (!isRecording) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream); audioChunks = [];
                mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
                mediaRecorder.onstop = async () => {
                    const blob = new Blob(audioChunks, { type: 'audio/webm' });
                    const formData = new FormData(); formData.append('file', blob, `record_${Date.now()}.webm`); formData.append('sender', 'user');
                    if (typeof getCurrentChatTarget === 'function') formData.append('target', getCurrentChatTarget());
                    try { const res = await fetch('api/message/audio', { method: 'POST', body: formData }); const data = await res.json(); if (data && data.message) appendMessage(data.message); }
                    catch (e) { console.error(e); alert('录音上传失败'); }
                };
                mediaRecorder.start(); isRecording = true; audioBtn.textContent = '⏹ 停止';
            } catch (err) { console.error(err); alert('无法访问麦克风'); }
        } else { mediaRecorder.stop(); isRecording = false; audioBtn.textContent = '🎤'; }
    };
}


