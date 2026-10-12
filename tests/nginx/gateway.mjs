// Gateway stand-in for the Nginx checks: records what the proxy forwards and answers on demand.
import http from 'node:http';

const requests = [];

const server = http.createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    const { url } = request;
    if (url === '/api/__requests') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(requests));
      return;
    }
    requests.push({
      method: request.method,
      url,
      host: request.headers.host ?? null,
      origin: request.headers.origin ?? null,
      cookie: request.headers.cookie ?? null,
      csrf: request.headers['x-csrf-token'] ?? null,
      httpVersion: request.httpVersion,
      connection: request.headers.connection ?? null,
      length: Buffer.concat(chunks).length,
    });
    if (url.startsWith('/api/drop') || url === '/api/live?drop') {
      request.socket.destroy();
      return;
    }
    // No X-Accel-Buffering here: the check proves Nginx's own settings.
    if (url === '/api/live') {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.write(
        'retry: 3000\n\nevent: upstream\ndata: {"available":true}\n\n',
      );
      setTimeout(() => {
        response.end('event: upstream\ndata: {"available":false}\n\n');
      }, 1500);
      return;
    }
    const status = /^\/api\/respond\/(\d{3})$/.exec(url);
    if (status) {
      response.writeHead(Number(status[1]), {
        'Content-Type': 'application/json',
        'Set-Cookie': 'umir_operator_session=s; Path=/; HttpOnly',
      });
      response.end('{"from":"gateway"}');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{"ok":true}');
  });
});

server.listen(8080, '0.0.0.0');
