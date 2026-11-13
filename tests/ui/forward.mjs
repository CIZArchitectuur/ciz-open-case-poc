import { spawn } from 'node:child_process';
import { createConnection, createServer } from 'node:net';

const forwarders = [[3000, 'frontend'], [8082, 'keycloak']].map(([port, host]) =>
  createServer(client => {
    const upstream = createConnection({ host, port: 8080 });
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
    client.on('close', () => upstream.destroy());
    upstream.on('close', () => client.destroy());
    client.pipe(upstream).pipe(client);
  }).listen(port, '127.0.0.1')
);

await Promise.all(forwarders.map(server => new Promise((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
})));

const playwright = spawn('npm', ['test'], { stdio: 'inherit' });
playwright.on('exit', code => process.exit(code ?? 1));
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => playwright.kill(signal));
}
