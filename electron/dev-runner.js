import { spawn } from 'child_process';
import http from 'http';

function checkUrl(url, timeout = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      http.get(url, (res) => {
        clearInterval(interval);
        resolve(true);
      }).on('error', () => {
        if (Date.now() - start > timeout) {
          clearInterval(interval);
          reject(new Error('Timeout waiting for dev server'));
        }
      });
    }, 500);
  });
}

async function main() {
  console.log('Waiting for Vite server on http://localhost:5173 ...');
  try {
    await checkUrl('http://localhost:5173');
    console.log('Vite server is ready! Launching Electron...');
    
    // Launch electron using npx electron
    const electronProcess = spawn('npx', ['electron', 'electron/dist/main.js'], {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, NODE_ENV: 'development' },
    });

    electronProcess.on('close', (code) => {
      process.exit(code || 0);
    });
  } catch (e) {
    console.error('Failed waiting for Vite server:', e);
    process.exit(1);
  }
}

main();
