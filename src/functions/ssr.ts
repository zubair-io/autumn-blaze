import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import * as path from 'path';
//@ts-ignore
global.location = {}

// Helper to convert Azure Request to Node Request
function createIncomingMessage(request: HttpRequest): IncomingMessage {
    const socket = new Socket();
    const incoming = new IncomingMessage(socket);
    // Ensure the URL is relative or properly formatted
    // Azure Functions might provide the full URL in request.url, but Express/Node expects relative for internal routing
    // or a full URL. The error suggests double protocol 'http://localhost:7071http://localhost:7071/api/'
    // We'll try to extract just the path.
    try {
        const urlObj = new URL(request.url);
        let pathname = urlObj.pathname;
        if (pathname.startsWith('/api')) {
            pathname = pathname.replace('/api', '') || '/';
        }
        incoming.url = pathname + urlObj.search;
        incoming.headers['host'] = urlObj.host;
    } catch (e) {
        incoming.url = request.url;
    }
    
    incoming.method = request.method;
    incoming.headers = {};
    for (const [key, value] of request.headers) {
        incoming.headers[key] = value;
    }
    return incoming;
}

export async function ssr(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        // Dynamic import to load the Angular server bundle
        // Adjust the path to point to the built server bundle
        const serverBundlePath = path.join(__dirname, '../../../../SugarMaple/dist/maple/server/server.mjs');
        // Use new Function to bypass TypeScript transpiling import() to require()
        const dynamicImport = new Function('specifier', 'return import(specifier)');
        const serverBundle = await dynamicImport(serverBundlePath);
        const reqHandler = serverBundle.reqHandler;

        return new Promise((resolve) => {
            const req = createIncomingMessage(request);
            const res = new ServerResponse(req);
            
            let bodyChunks: any[] = [];
            res.write = (chunk: any) => {
                bodyChunks.push(chunk);
                return true;
            };
            
            res.end = (chunk?: any) => {
                if (chunk) bodyChunks.push(chunk);
                const body = Buffer.concat(bodyChunks.map(c => typeof c === 'string' ? Buffer.from(c) : Buffer.from(c))).toString('utf8');
                resolve({
                    status: res.statusCode,
                    headers: res.getHeaders() as any,
                    body: body
                });
                return res;
            };

            reqHandler(req, res, (err: any) => {
                if (err) {
                    context.error(err);
                    resolve({ status: 500, body: err.toString() });
                } else {
                    resolve({ status: 404, body: 'Not Found' });
                }
            });
        });
    } catch (error) {
        context.error('Error importing server bundle or handling request', error);
        return { status: 500, body: 'Internal Server Error: ' + error };
    }
}

app.http('ssr', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: '{*route}', 
    handler: ssr
});
