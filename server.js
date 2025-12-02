// WebSocket Proxy Server for WhiteBoss
// Adds Authorization header that browser WebSocket cannot send

const WebSocket = require('ws');
const http = require('http');
const url = require('url');

const TARGET_WS_URL = 'wss://wlserver.whiteless.hu';
const PORT = process.env.PORT || 3001;

// Create HTTP server
const server = http.createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // CORS headers for regular HTTP requests
  res.writeHead(200, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  });
  res.end('WhiteBoss WebSocket Proxy');
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (clientWs, req) => {
  const parsedUrl = url.parse(req.url, true);
  const token = parsedUrl.query.token;

  if (!token) {
    console.log('Connection rejected: missing token');
    clientWs.close(4001, 'Missing token parameter');
    return;
  }

  console.log('Client connected, establishing connection to target server...');

  // Connect to target server with Authorization header
  const targetWs = new WebSocket(TARGET_WS_URL, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'WhiteWeb/1.0.0',
    },
  });

  let targetConnected = false;
  const messageQueue = [];

  targetWs.on('open', () => {
    console.log('Connected to target server');
    targetConnected = true;

    // Send any queued messages
    while (messageQueue.length > 0) {
      const msg = messageQueue.shift();
      targetWs.send(msg);
    }
  });

  targetWs.on('message', (data) => {
    // Forward message from target to client
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data);
    }
  });

  targetWs.on('close', (code, reason) => {
    console.log(`Target connection closed: ${code} - ${reason}`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(code, reason);
    }
  });

  targetWs.on('error', (error) => {
    console.error('Target WebSocket error:', error.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(4002, 'Target server error');
    }
  });

  // Handle messages from client
  clientWs.on('message', (data) => {
    if (targetConnected && targetWs.readyState === WebSocket.OPEN) {
      targetWs.send(data);
    } else {
      // Queue message until target is connected
      messageQueue.push(data);
    }
  });

  clientWs.on('close', (code, reason) => {
    console.log(`Client connection closed: ${code} - ${reason}`);
    if (targetWs.readyState === WebSocket.OPEN) {
      targetWs.close(code, reason);
    }
  });

  clientWs.on('error', (error) => {
    console.error('Client WebSocket error:', error.message);
    if (targetWs.readyState === WebSocket.OPEN) {
      targetWs.close();
    }
  });
});

server.listen(PORT, () => {
  console.log(`WebSocket proxy server running on port ${PORT}`);
  console.log(`Proxying to ${TARGET_WS_URL}`);
});
