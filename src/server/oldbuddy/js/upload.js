// static/js/upload.js

function createUploadOverlay() {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.background = 'rgba(0,0,0,0.6)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '2000';
    return overlay;
}

function appendExtraTextRow(overlay, placeholder) {
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.placeholder = placeholder || '输入附加文字...';
    textInput.style.marginTop = '10px';
    textInput.style.padding = '8px 12px';
    textInput.style.width = '60%';
    textInput.style.borderRadius = '20px';
    overlay.appendChild(textInput);
    return textInput;
}

function appendSendCancelButtons(overlay, onSend, onCancel, failLabel) {
    const btnWrapper = document.createElement('div');
    btnWrapper.style.marginTop = '10px';
    const sendBtn = document.createElement('button');
    sendBtn.textContent = '发送';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    btnWrapper.appendChild(sendBtn);
    btnWrapper.appendChild(cancelBtn);
    overlay.appendChild(btnWrapper);
    cancelBtn.onclick = () => {
        onCancel();
        if (overlay.parentNode) document.body.removeChild(overlay);
    };
    sendBtn.onclick = async () => {
        sendBtn.disabled = true;
        try {
            await onSend();
            if (overlay.parentNode) document.body.removeChild(overlay);
        } catch (e) {
            console.error(e);
            if (failLabel) alert(failLabel);
            sendBtn.disabled = false;
        }
    };
}

/** 录音 / 视频上传前预览并输入 extra_text */
function handleMediaUpload(fileOrBlob, kind, opts = {}) {
    const { filename, inputEl, failLabel } = opts;
    const isVideo = kind === 'video';
    const file = fileOrBlob instanceof File
        ? fileOrBlob
        : new File(
            [fileOrBlob],
            filename || `${isVideo ? 'video' : 'record'}_${Date.now()}.${isVideo ? 'mp4' : 'webm'}`,
            { type: fileOrBlob.type || (isVideo ? 'video/mp4' : 'audio/webm') },
        );

    const overlay = createUploadOverlay();
    const label = document.createElement('div');
    label.textContent = isVideo ? `视频: ${file.name}` : `录音: ${file.name}`;
    label.style.background = '#fff';
    label.style.padding = '10px 14px';
    label.style.borderRadius = '8px';
    label.style.maxWidth = '80%';
    label.style.textAlign = 'center';
    overlay.appendChild(label);

    const objectUrl = URL.createObjectURL(file);
    if (isVideo) {
        const video = document.createElement('video');
        video.controls = true;
        video.playsInline = true;
        video.src = objectUrl;
        video.style.maxWidth = '80%';
        video.style.maxHeight = '40%';
        video.style.marginTop = '10px';
        video.style.borderRadius = '8px';
        video.style.background = '#000';
        overlay.appendChild(video);
    } else {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = objectUrl;
        audio.style.width = 'min(80%, 320px)';
        audio.style.marginTop = '10px';
        overlay.appendChild(audio);
    }

    const textInput = appendExtraTextRow(overlay, '输入附加文字...');
    document.body.appendChild(overlay);

    const apiPath = isVideo ? '/oldbuddy/api/message/video' : '/oldbuddy/api/message/audio';
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    appendSendCancelButtons(
        overlay,
        async () => {
            const formData = new FormData();
            formData.append('file', file, file.name);
            formData.append('sender', 'user');
            if (typeof getCurrentChatTarget === 'function') formData.append('target', getCurrentChatTarget());
            const extra_text = textInput.value.trim();
            if (extra_text) formData.append('extra_text', extra_text);
            const res = await fetch(apiPath, { method: 'POST', body: formData });
            const data = await res.json();
            if (data && data.message) appendMessage(data.message);
            cleanup();
        },
        () => {
            cleanup();
            if (inputEl) inputEl.value = '';
        },
        failLabel || (isVideo ? '视频上传失败' : '录音上传失败'),
    );
}

// ---------- 图片上传（预览 + 文字组合发送） ----------
function mimeToImageExt(mime) {
    const m = String(mime || '').toLowerCase();
    if (m.includes('png')) return 'png';
    if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
    if (m.includes('webp')) return 'webp';
    if (m.includes('gif')) return 'gif';
    return 'png';
}

function extractPastedImageFile(clipboardData) {
    if (!clipboardData?.items?.length) return null;
    for (const item of clipboardData.items) {
        if (item.kind !== 'file' || !String(item.type || '').startsWith('image/')) continue;
        const blob = item.getAsFile();
        if (!blob) continue;
        if (blob.name) return blob;
        const ext = mimeToImageExt(item.type || blob.type);
        return new File([blob], `paste_${Date.now()}.${ext}`, { type: item.type || blob.type || 'image/png' });
    }
    return null;
}

function initPasteImageHandler() {
    const textInput = document.getElementById('text-input');
    if (!textInput) return;
    textInput.addEventListener('paste', (e) => {
        if (typeof isReferencePickerOpen === 'function' && isReferencePickerOpen()) return;
        const file = extractPastedImageFile(e.clipboardData);
        if (!file) return;
        e.preventDefault();
        handleImageFile(file);
    });
}

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
    handleMediaUpload(blobOrFile, 'audio', { filename });
}

async function uploadVideoFile(file, inputEl) {
    handleMediaUpload(file, 'video', { inputEl });
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
                handleMediaUpload(file, 'audio', {
                    filename: file.name || `record_${Date.now()}.m4a`,
                });
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
                handleMediaUpload(file, 'video', { inputEl: e.target });
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
                        uploadAudioBlob(blob, `record_${Date.now()}.${fmt.ext}`);
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

    initPasteImageHandler();
}

