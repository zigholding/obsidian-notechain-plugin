/** 读取 HTTP 请求体（Node IncomingMessage） */
export function readHttpBody(req: any): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk: any) => {
            body += chunk.toString();
        });
        req.on('end', () => {
            resolve(body);
        });
        req.on('error', (error: any) => {
            reject(error);
        });
    });
}

/** 读取 HTTP 请求体为 Buffer */
export function readHttpBodyBuffer(req: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: any) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

export function parseUrlEncoded(body: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const part of body.split('&')) {
        if (!part) continue;
        const idx = part.indexOf('=');
        const key = decodeURIComponent(idx >= 0 ? part.slice(0, idx) : part).replace(/\+/g, ' ');
        const val = decodeURIComponent(idx >= 0 ? part.slice(idx + 1) : '').replace(/\+/g, ' ');
        out[key] = val;
    }
    return out;
}

export interface MultipartField {
    name: string;
    filename?: string;
    mime?: string;
    data: Buffer;
}

/** 解析 multipart/form-data（供 oldbuddy 上传） */
export function parseMultipartForm(body: Buffer, contentType: string): {
    fields: Record<string, string>;
    files: MultipartField[];
} {
    const fields: Record<string, string> = {};
    const files: MultipartField[] = [];
    const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
    const boundary = m ? (m[1] || m[2] || '').trim() : '';
    if (!boundary) {
        return { fields, files };
    }
    const marker = `--${boundary}`;
    const text = body.toString('latin1');
    const parts = text.split(marker);
    for (const part of parts) {
        let chunk = part.replace(/^\r\n/, '').replace(/\r\n--$/, '').replace(/--\r\n$/, '');
        if (!chunk || chunk === '--') continue;
        chunk = chunk.replace(/^\r\n/, '').replace(/\r\n$/, '');
        const sep = chunk.indexOf('\r\n\r\n');
        if (sep < 0) continue;
        const headerBlock = chunk.slice(0, sep);
        const dataLatin1 = chunk.slice(sep + 4);
        const data = Buffer.from(dataLatin1, 'latin1');
        const nameMatch = /name="([^"]+)"/i.exec(headerBlock);
        if (!nameMatch) continue;
        const name = nameMatch[1];
        const fileMatch = /filename="([^"]*)"/i.exec(headerBlock);
        const mimeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headerBlock);
        if (fileMatch) {
            files.push({
                name,
                filename: fileMatch[1],
                mime: mimeMatch ? mimeMatch[1].trim() : 'application/octet-stream',
                data,
            });
        } else {
            fields[name] = data.toString('utf8');
        }
    }
    return { fields, files };
}

export function jsonResponse(res: any, status: number, data: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
}
