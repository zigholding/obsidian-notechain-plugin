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

/** 解析 Range: bytes=… 请求头 */
export function parseByteRange(
    rangeHeader: string,
    size: number,
): { start: number; end: number } | null {
    const m = /^bytes=(\d*)-(\d*)$/i.exec(String(rangeHeader || '').trim());
    if (!m || size <= 0) return null;
    const [, startStr, endStr] = m;
    let start: number;
    let end: number;
    if (startStr === '' && endStr !== '') {
        const suffixLen = parseInt(endStr, 10);
        if (!Number.isFinite(suffixLen) || suffixLen <= 0) return null;
        start = Math.max(0, size - suffixLen);
        end = size - 1;
    } else {
        start = startStr ? parseInt(startStr, 10) : 0;
        end = endStr ? parseInt(endStr, 10) : size - 1;
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
        return null;
    }
    end = Math.min(end, size - 1);
    return { start, end };
}

const fs = require('fs');

/** 以流式响应本地文件，支持 Range（视频/音频分段加载） */
export function sendLocalFile(
    req: any,
    res: any,
    absPath: string,
    opts: { mime: string; size: number; mtime?: number; cacheControl?: string },
) {
    const { mime, size } = opts;
    const cacheControl = opts.cacheControl || 'public, max-age=31536000, immutable';
    const etag =
        opts.mtime != null ? `"${size.toString(16)}-${Math.floor(opts.mtime).toString(16)}"` : undefined;
    const baseHeaders: Record<string, string | number> = {
        'Content-Type': mime,
        'Accept-Ranges': 'bytes',
        'Cache-Control': cacheControl,
    };
    if (etag) baseHeaders['ETag'] = etag;

    const rangeHeader = req?.headers?.range;
    if (rangeHeader) {
        const range = parseByteRange(String(rangeHeader), size);
        if (!range) {
            res.writeHead(416, { 'Content-Range': `bytes */${size}` });
            res.end();
            return;
        }
        const { start, end } = range;
        const chunkSize = end - start + 1;
        res.writeHead(206, {
            ...baseHeaders,
            'Content-Length': chunkSize,
            'Content-Range': `bytes ${start}-${end}/${size}`,
        });
        fs.createReadStream(absPath, { start, end }).pipe(res);
        return;
    }

    res.writeHead(200, {
        ...baseHeaders,
        'Content-Length': size,
    });
    fs.createReadStream(absPath).pipe(res);
}
