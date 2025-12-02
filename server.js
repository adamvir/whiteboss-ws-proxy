// WebSocket Proxy Server for WhiteBoss
// Relays WebSocket messages to bypass Origin restrictions

const WebSocket = require('ws');
const http = require('http');

const TARGET_WS_URL = 'wss://wlserver.whiteless.hu';
const PORT = process.env.PORT || 3001;

// Allowed origins
const ALLOWED_ORIGINS = [
  'https://white-boss.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

// Create HTTP server
const server = http.createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', target: TARGET_WS_URL }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WhiteBoss WebSocket Proxy - Connect via WebSocket');
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (clientWs, req) => {
  const origin = req.headers.origin;
  console.log(`Client connected from origin: ${origin}`);

  // Optional: Check origin (comment out for testing)
  // if (!ALLOWED_ORIGINS.includes(origin)) {
  //   console.log('Connection rejected: unauthorized origin');
  //   clientWs.close(4003, 'Unauthorized origin');
  //   return;
  // }

  console.log('Establishing connection to target server...');

  // Connect to target server with proper headers to mimic mobile app
  const targetWs = new WebSocket(TARGET_WS_URL, {
    headers: {
      'User-Agent': 'WhiteMob/1.0.4.124',
      'Origin': 'https://whiteless.hu',
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
      console.log('Sending queued message to target');
      targetWs.send(msg);
    }
  });

  targetWs.on('message', (data) => {
    // Forward message from target to client
    if (clientWs.readyState === WebSocket.OPEN) {
      // Convert Buffer to string if needed
      const message = Buffer.isBuffer(data) ? data.toString() : data;
      clientWs.send(message);

      // Log event type for debugging
      try {
        const parsed = JSON.parse(message);
        console.log(`Target -> Client: ${parsed.$TypeOfEvent || 'unknown'}`);
      } catch {
        console.log('Target -> Client: [non-JSON message]');
      }
    }
  });

  targetWs.on('close', (code, reason) => {
    const reasonStr = reason ? reason.toString() : '';
    console.log(`Target connection closed: ${code} - ${reasonStr}`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(code, reasonStr);
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
    // Convert Buffer to string if needed
    const message = Buffer.isBuffer(data) ? data.toString() : data;

    // Log request type for debugging
    try {
      const parsed = JSON.parse(message);
      console.log(`Client -> Target: ${parsed.$TypeOfRequest || 'unknown'}`);
    } catch {
      console.log('Client -> Target: [non-JSON message]');
    }

    if (targetConnected && targetWs.readyState === WebSocket.OPEN) {
      targetWs.send(message);
    } else {
      // Queue message until target is connected
      console.log('Target not ready, queuing message');
      messageQueue.push(message);
    }
  });

  clientWs.on('close', (code, reason) => {
    const reasonStr = reason ? reason.toString() : '';
    console.log(`Client connection closed: ${code} - ${reasonStr}`);
    if (targetWs.readyState === WebSocket.OPEN) {
      targetWs.close(code, reasonStr);
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
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
});
