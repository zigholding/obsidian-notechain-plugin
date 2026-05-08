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
