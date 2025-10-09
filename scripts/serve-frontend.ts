import { spawn } from 'child_process';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const PORT = 3000;

// Simple HTTP server to serve the frontend
const server = createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  
  // Serve static files from frontend directory
  if (filePath?.startsWith('/')) {
    filePath = join(__dirname, '..', 'frontend', filePath);
  }
  
  try {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath);
      const ext = filePath.split('.').pop();
      
      let contentType = 'text/html';
      if (ext === 'js') contentType = 'application/javascript';
      if (ext === 'css') contentType = 'text/css';
      if (ext === 'json') contentType = 'application/json';
      
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  } catch (error) {
    res.writeHead(500);
    res.end('Server error');
  }
});

server.listen(PORT, () => {
  console.log(`Frontend server running at http://localhost:${PORT}`);
  console.log('Open your browser and connect MetaMask to localhost:8545');
});
