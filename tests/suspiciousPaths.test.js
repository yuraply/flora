import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const PORT = 19117;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function startServer() {
    const server = spawn(process.execPath, ['server.js'], {
        env: {
            ...process.env,
            PORT: String(PORT),
            OPENROUTER_API_KEY: '',
            ADMIN_USERNAME: 'test-admin',
            ADMIN_PASSWORD: 'test-password'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    server.stderr.setEncoding('utf8');
    server.stdout.setEncoding('utf8');

    const timeout = setTimeout(() => {
        server.kill('SIGTERM');
    }, 10000);

    try {
        for await (const chunk of server.stdout) {
            if (chunk.includes(`Flora server running on port ${PORT}`)) {
                return server;
            }
        }
    } catch (error) {
        clearTimeout(timeout);
        throw error;
    }

    const [code] = await once(server, 'exit');
    clearTimeout(timeout);
    throw new Error(`Server exited before startup with code ${code}`);
}

async function stopServer(server) {
    if (server.exitCode !== null) {
        return;
    }
    server.kill('SIGTERM');
    await once(server, 'exit');
}

test('suspicious scanner paths return 404 instead of the SPA shell', async () => {
    const server = await startServer();
    try {
        const suspiciousPaths = [
            '/.env',
            '/.env.backup',
            '/.git/config',
            '/wp-admin/css/colors/blue/file.php',
            '/shell.php'
        ];

        for (const requestPath of suspiciousPaths) {
            const response = await fetch(`${BASE_URL}${requestPath}`);
            const body = await response.text();

            assert.equal(response.status, 404, requestPath);
            assert.equal(body.includes('<!DOCTYPE html>'), false, requestPath);
        }
    } finally {
        await stopServer(server);
    }
});

test('ordinary frontend routes still return the SPA shell', async () => {
    const server = await startServer();
    try {
        const response = await fetch(`${BASE_URL}/plant-notes`);
        const body = await response.text();

        assert.equal(response.status, 200);
        assert.equal(body.includes('<!DOCTYPE html>'), true);
    } finally {
        await stopServer(server);
    }
});
