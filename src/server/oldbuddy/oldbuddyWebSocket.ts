let crypto = require('crypto');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export type OldBuddyWsKind = 'web' | 'jiujiu';

export interface OldBuddyWsClient {
    socket: any;
    buffer: Buffer;
    kind: OldBuddyWsKind;
    target: string;
    senderId: string;
}

export interface OldBuddyWsUpgradeOpts {
    kind?: OldBuddyWsKind;
    target?: string;
    senderId?: string;
}

/** 轻量 WebSocket 服务：网页实时推送 + 啾啾 Native Chat */
export class OldBuddyWebSocketHub {
    private clients = new Set<OldBuddyWsClient>();
    onJiujiuMessage: ((client: OldBuddyWsClient, raw: string) => void | Promise<void>) | null = null;
    onJiujiuOpen: ((client: OldBuddyWsClient) => void | Promise<void>) | null = null;

    handleUpgrade(req: any, socket: any, head: Buffer, opts?: OldBuddyWsUpgradeOpts) {
        const key = req.headers['sec-websocket-key'];
        if (!key) {
            socket.destroy();
            return;
        }
        const accept = crypto
            .createHash('sha1')
            .update(String(key) + WS_GUID)
            .digest('base64');
        const headers = [
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${accept}`,
            '\r\n',
        ].join('\r\n');
        socket.write(headers);

        socket.setTimeout(0);
        socket.setNoDelay(true);
        socket.setKeepAlive(true);

        const client: OldBuddyWsClient = {
            socket,
            buffer: Buffer.isBuffer(head) && head.length ? Buffer.from(head) : Buffer.alloc(0),
            kind: opts?.kind === 'jiujiu' ? 'jiujiu' : 'web',
            target: String(opts?.target || '').trim() || 'local',
            senderId: String(opts?.senderId || '').trim(),
        };
        this.clients.add(client);

        const onData = (chunk: Buffer) => {
            client.buffer = Buffer.concat([client.buffer, chunk]);
            client.buffer = this.consumeFrames(client, client.buffer);
        };
        const cleanup = () => {
            socket.removeListener('data', onData);
            this.clients.delete(client);
        };
        socket.on('data', onData);
        socket.on('close', cleanup);
        socket.on('error', cleanup);

        if (client.buffer.length) {
            client.buffer = this.consumeFrames(client, client.buffer);
        }
        if (client.kind === 'jiujiu' && this.onJiujiuOpen) {
            void Promise.resolve(this.onJiujiuOpen(client));
        }
    }

    /** 网页客户端：OldBuddyMessage JSON */
    broadcast(payload: unknown) {
        this.writeToKind('web', payload);
    }

    /** 啾啾客户端：JiuJiu 协议包 */
    broadcastJiujiu(payload: unknown) {
        this.writeToKind('jiujiu', payload);
    }

    sendTo(client: OldBuddyWsClient, payload: unknown) {
        if (!this.clients.has(client) || client.socket?.destroyed) return;
        this.writeFrame(client, this.encodeTextFrame(JSON.stringify(payload)));
    }

    jiujiuCount(): number {
        let n = 0;
        for (const c of this.clients) {
            if (c.kind === 'jiujiu' && !c.socket?.destroyed) n++;
        }
        return n;
    }

    closeAll() {
        for (const client of this.clients) {
            try {
                client.socket.end();
                client.socket.destroy();
            } catch {
                // ignore
            }
        }
        this.clients.clear();
    }

    private writeToKind(kind: OldBuddyWsKind, payload: unknown) {
        const frame = this.encodeTextFrame(JSON.stringify(payload));
        for (const client of this.clients) {
            if (client.kind !== kind) continue;
            this.writeFrame(client, frame);
        }
    }

    private writeFrame(client: OldBuddyWsClient, frame: Buffer) {
        try {
            if (!client.socket.destroyed) {
                client.socket.write(frame);
            }
        } catch {
            this.clients.delete(client);
        }
    }

    private consumeFrames(client: OldBuddyWsClient, buf: Buffer): Buffer {
        while (buf.length >= 2) {
            const fin = (buf[0] & 0x80) !== 0;
            const opcode = buf[0] & 0x0f;
            let payloadLen = buf[1] & 0x7f;
            let offset = 2;
            if (payloadLen === 126) {
                if (buf.length < 4) return buf;
                payloadLen = buf.readUInt16BE(2);
                offset = 4;
            } else if (payloadLen === 127) {
                if (buf.length < 10) return buf;
                payloadLen = Number(buf.readBigUInt64BE(2));
                offset = 10;
            }
            const masked = (buf[1] & 0x80) !== 0;
            if (masked) offset += 4;
            if (buf.length < offset + payloadLen) return buf;
            let payload = buf.slice(offset, offset + payloadLen);
            if (masked) {
                const mask = buf.slice(offset - 4, offset);
                for (let i = 0; i < payload.length; i++) {
                    payload[i] ^= mask[i % 4];
                }
            }
            buf = buf.slice(offset + payloadLen);
            if (opcode === 0x8) {
                try {
                    client.socket.end();
                } catch {
                    // ignore
                }
                this.clients.delete(client);
                return buf;
            }
            if (opcode === 0x9) {
                client.socket.write(this.encodePongFrame(payload));
            }
            if (opcode === 0x1 && fin && client.kind === 'jiujiu' && this.onJiujiuMessage) {
                const text = payload.toString('utf8');
                void Promise.resolve(this.onJiujiuMessage(client, text));
            }
            if (!fin) continue;
        }
        return buf;
    }

    private encodeTextFrame(text: string): Buffer {
        const payload = Buffer.from(text, 'utf8');
        return this.encodeFrame(0x1, payload, false);
    }

    private encodePongFrame(payload: Buffer): Buffer {
        return this.encodeFrame(0xa, payload, false);
    }

    private encodeFrame(opcode: number, payload: Buffer, mask: boolean): Buffer {
        let header: number[] = [0x80 | opcode];
        const len = payload.length;
        if (len < 126) {
            header.push(len | (mask ? 0x80 : 0));
        } else if (len < 65536) {
            header.push(126 | (mask ? 0x80 : 0), (len >> 8) & 0xff, len & 0xff);
        } else {
            header.push(127 | (mask ? 0x80 : 0));
            const hi = Math.floor(len / 0x100000000);
            const lo = len >>> 0;
            header.push(
                (hi >> 24) & 0xff,
                (hi >> 16) & 0xff,
                (hi >> 8) & 0xff,
                hi & 0xff,
                (lo >> 24) & 0xff,
                (lo >> 8) & 0xff,
                lo & 0xff,
            );
        }
        if (mask) {
            const maskKey = crypto.randomBytes(4);
            header.push(...maskKey);
            const masked = Buffer.alloc(payload.length);
            for (let i = 0; i < payload.length; i++) {
                masked[i] = payload[i] ^ maskKey[i % 4];
            }
            return Buffer.concat([Buffer.from(header), masked]);
        }
        return Buffer.concat([Buffer.from(header), payload]);
    }
}
