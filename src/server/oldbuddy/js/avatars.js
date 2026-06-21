// static/js/avatars.js — 头像/昵称（nochain_oldbuddy_avatar）

let OLDBUDDY_AVATAR_MAP = {};

function resolveAvatarUrl(path) {
    if (!path) return '';
    const p = String(path).trim();
    if (!p) return '';
    if (/^https?:\/\//i.test(p)) return p;
    if (p.startsWith('/')) return p;
    return `/oldbuddy/api/vault_asset?path=${encodeURIComponent(p)}`;
}

function resolveSenderProfile(sender) {
    const id = String(sender ?? '').trim() || 'buddy';
    const map = OLDBUDDY_AVATAR_MAP || {};
    if (map[id]) {
        return { ...map[id], id };
    }
    if (typeof isUserSender === 'function' && isUserSender(id) && map.user) {
        return { ...map.user, id };
    }
    if (map.buddy && (typeof isUserSender !== 'function' || !isUserSender(id))) {
        return { ...map.buddy, id };
    }
    if (map['*']) {
        return { ...map['*'], id };
    }
    return { id, name: id, avatar: '' };
}

function shouldShowNickname(sender, profile) {
    if (!profile?.name) return false;
    const s = String(sender ?? '').trim();
    if (s === 'user') return false;
    if (typeof isUserSender === 'function' && isUserSender(s)) return true;
    return true;
}

function createMessageAvatarEl(profile) {
    const wrap = document.createElement('div');
    wrap.className = 'message-avatar';
    const url = resolveAvatarUrl(profile.avatar);
    const fallbackChar = (profile.name || profile.id || '?').slice(0, 1);

    const showFallback = () => {
        wrap.textContent = fallbackChar;
        wrap.classList.add('message-avatar-fallback');
        const img = wrap.querySelector('img');
        if (img) img.remove();
    };

    if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = profile.name || '';
        img.loading = 'lazy';
        img.addEventListener('error', showFallback, { once: true });
        wrap.appendChild(img);
    } else {
        showFallback();
    }
    return wrap;
}

function wrapMessageWithAvatar(div, msg, contentDiv) {
    const profile = resolveSenderProfile(msg.sender);
    const row = document.createElement('div');
    row.className = 'message-row';

    const avatar = createMessageAvatarEl(profile);
    const body = document.createElement('div');
    body.className = 'message-body';

    if (shouldShowNickname(msg.sender, profile)) {
        const nick = document.createElement('div');
        nick.className = 'message-nickname';
        nick.textContent = profile.name;
        body.appendChild(nick);
    }

    body.appendChild(contentDiv);

    if (typeof isUserSender === 'function' && isUserSender(msg.sender)) {
        row.classList.add('message-row-user');
        row.appendChild(body);
        row.appendChild(avatar);
    } else {
        row.appendChild(avatar);
        row.appendChild(body);
    }

    div.appendChild(row);
}

async function loadOldBuddyAvatars(target) {
    const tid =
        target ||
        (typeof getCurrentChatTarget === 'function' ? getCurrentChatTarget() : 'local');
    try {
        const res = await fetch(
            `/oldbuddy/api/avatars?target=${encodeURIComponent(tid || 'local')}`,
        );
        if (!res.ok) throw new Error('avatars fetch failed');
        const data = await res.json();
        OLDBUDDY_AVATAR_MAP = data.avatars && typeof data.avatars === 'object' ? data.avatars : {};
    } catch (e) {
        console.warn('[oldbuddy] load avatars failed', e);
        OLDBUDDY_AVATAR_MAP = {};
    }
}

function refreshAllMessageAvatars() {
    const container = document.getElementById('messages');
    if (!container) return;
    container.querySelectorAll('.message').forEach((node) => {
        const row = node.querySelector('.message-row');
        if (!row) return;
        const sender = node.dataset.sender || '';
        const profile = resolveSenderProfile(sender);
        const avatarWrap = row.querySelector('.message-avatar');
        if (avatarWrap) {
            const fresh = createMessageAvatarEl(profile);
            avatarWrap.replaceWith(fresh);
        }
        const nick = row.querySelector('.message-nickname');
        if (shouldShowNickname(sender, profile)) {
            if (nick) {
                nick.textContent = profile.name;
            } else {
                const body = row.querySelector('.message-body');
                if (body) {
                    const el = document.createElement('div');
                    el.className = 'message-nickname';
                    el.textContent = profile.name;
                    body.insertBefore(el, body.firstChild);
                }
            }
        } else if (nick) {
            nick.remove();
        }
    });
}
