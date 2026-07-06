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
        try { const res = await fetch('/oldbuddy/api/message/image', { method: 'POST', body: formData }); const data = await res.json(); if (data && data.message) appendMessage(data.message); }
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
        try { const res = await fetch('/oldbuddy/api/message/file', { method: 'POST', body: formData }); const data = await res.json(); if (data && data.message) appendMessage(data.message); }
        catch (e) { console.error(e); alert('文件上传失败'); }
        if (inputEl) inputEl.value = '';
        document.body.removeChild(previewOverlay);
    };
}

/** 手机经局域网 http://IP:端口 访问时非安全上下文，getUserMedia 会被拒绝 */
function canInlineAudioRecord() {
    return !!(window.isSecureContext
        && navigator.mediaDevices
        && navigator.mediaDevices.getUserMedia
        && typeof MediaRecorder !== 'undefined');
}

/** 触摸设备 / 非 HTTPS：走系统录音，不用页面内 getUserMedia */
function prefersSystemAudioRecord() {
    if (!window.isSecureContext) return true;
    return window.matchMedia('(pointer: coarse)').matches
        || window.matchMedia('(hover: none)').matches;
}

function useInlineAudioRecord() {
    return canInlineAudioRecord() && !prefersSystemAudioRecord();
}

function isNonAudioPick(file) {
    const type = String((file && file.type) || '').toLowerCase();
    const name = String((file && file.name) || '').toLowerCase();
    if (type.startsWith('video/') || type.startsWith('image/')) return true;
    if (/\.(mp4|mov|m4v|mkv|3gp|jpg|jpeg|png|gif|webp)(\?|$)/.test(name)) return true;
    return false;
}

function openSystemAudioRecorder(audioInput) {
    if (!audioInput) return;
    audioInput.value = '';
    audioInput.removeAttribute('capture');
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) audioInput.setAttribute('capture', 'user');
    audioInput.click();
}

function pickAudioRecorderFormat() {
    const candidates = [
        { mimeType: 'audio/webm;codecs=opus', ext: 'webm' },
        { mimeType: 'audio/webm', ext: 'webm' },
        { mimeType: 'audio/mp4', ext: 'm4a' },
        { mimeType: 'audio/aac', ext: 'aac' },
    ];
    for (const c of candidates) {
        if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
    }
    return { mimeType: '', ext: 'webm' };
}

async function uploadAudioBlob(blobOrFile, filename) {
    const file = blobOrFile instanceof File
        ? blobOrFile
        : new File([blobOrFile], filename || `record_${Date.now()}.webm`, { type: blobOrFile.type || 'audio/webm' });
    const formData = new FormData();
    formData.append('file', file, file.name || filename);
    formData.append('sender', 'user');
    if (typeof getCurrentChatTarget === 'function') formData.append('target', getCurrentChatTarget());
    const res = await fetch('/oldbuddy/api/message/audio', { method: 'POST', body: formData });
    const data = await res.json();
    if (data && data.message) appendMessage(data.message);
}

async function uploadVideoFile(file) {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sender', 'user');
    if (typeof getCurrentChatTarget === 'function') formData.append('target', getCurrentChatTarget());
    const res = await fetch('/oldbuddy/api/message/video', { method: 'POST', body: formData });
    const data = await res.json();
    if (data && data.message) appendMessage(data.message);
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

    // ---------- 语音录音：桌面 HTTPS 页面内录音；手机/HTTP 调系统录音 ----------
    const audioInput = document.getElementById('audio-input');
    let mediaRecorder, audioChunks = [], isRecording = false, recordStream = null;
    const audioBtn = document.getElementById('send-audio');

    if (audioInput) {
        audioInput.onchange = async (e) => {
            const file = e.target.files[0];
            e.target.value = '';
            if (!file) return;
            if (isNonAudioPick(file)) {
                alert('请选择录音，视频/图片请使用 📁 菜单');
                return;
            }
            try {
                await uploadAudioBlob(file, file.name || `record_${Date.now()}.m4a`);
            } catch (err) {
                console.error(err);
                alert('录音上传失败');
            }
        };
    }

    const videoInput = document.getElementById('video-input');
    if (videoInput) {
        videoInput.onchange = async (e) => {
            const file = e.target.files[0];
            e.target.value = '';
            if (!file) return;
            try {
                await uploadVideoFile(file);
            } catch (err) {
                console.error(err);
                alert('视频上传失败');
            }
        };
    }

    function stopRecordStream() {
        if (recordStream) {
            recordStream.getTracks().forEach((t) => t.stop());
            recordStream = null;
        }
    }

    audioBtn.onclick = async () => {
        if (!useInlineAudioRecord()) {
            openSystemAudioRecorder(audioInput);
            return;
        }

        if (!isRecording) {
            try {
                recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const fmt = pickAudioRecorderFormat();
                mediaRecorder = fmt.mimeType
                    ? new MediaRecorder(recordStream, { mimeType: fmt.mimeType })
                    : new MediaRecorder(recordStream);
                audioChunks = [];
                mediaRecorder.ondataavailable = (ev) => { if (ev.data?.size) audioChunks.push(ev.data); };
                mediaRecorder.onstop = async () => {
                    stopRecordStream();
                    const mime = fmt.mimeType || mediaRecorder.mimeType || 'audio/webm';
                    const blob = new Blob(audioChunks, { type: mime });
                    try {
                        await uploadAudioBlob(blob, `record_${Date.now()}.${fmt.ext}`);
                    } catch (err) {
                        console.error(err);
                        alert('录音上传失败');
                    }
                };
                mediaRecorder.start();
                isRecording = true;
                audioBtn.textContent = '⏹ 停止';
            } catch (err) {
                console.error(err);
                stopRecordStream();
                openSystemAudioRecorder(audioInput);
            }
        } else {
            mediaRecorder.stop();
            isRecording = false;
            audioBtn.textContent = '🎤';
        }
    };
}

