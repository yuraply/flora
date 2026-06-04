import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
// OpenRouter API (замена Google Generative AI SDK)
import dotenv from 'dotenv';
import {
    initDatabase,
    requestLogger,
    basicAuth,
    getStats,
    getRecentRequests,
    blockCheckMiddleware,
    getSecurityAlerts,
    resolveAlert,
    getSecuritySettings,
    setSecuritySetting,
    logAiUsage,
    blockIp,
    unblockIp,
    getBlockedIps,
    getGeoLocation
} from './monitoring.js';
import { extractOpenRouterUsage } from './utils/openrouterUsage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file
dotenv.config();

// Initialize monitoring database
initDatabase();

const app = express();
const PORT = process.env.PORT || 80;
const AI_RATE_LIMIT_PER_HOUR = parseInt(process.env.AI_RATE_LIMIT_PER_HOUR || '30', 10);
const aiRateLimitHits = new Map();

// Middleware
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

// Block check middleware (before request logging)
app.use(blockCheckMiddleware);

// Request logging middleware (must be after express.json to access body)
app.use(requestLogger);

// ==================== ADMIN ROUTES ====================

// Admin dashboard - protected with basic auth
app.get('/admin/dashboard', basicAuth, (req, res) => {
    const dashboardPath = path.join(__dirname, 'admin-dashboard.html');
    if (fs.existsSync(dashboardPath)) {
        res.sendFile(dashboardPath);
    } else {
        res.status(404).send('Dashboard not found');
    }
});

// Admin API - stats
app.get('/admin/api/stats', basicAuth, (req, res) => {
    const stats = getStats();
    if (stats) {
        res.json(stats);
    } else {
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

// Admin API - recent requests
app.get('/admin/api/requests', basicAuth, (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const apiOnly = req.query.apiOnly === 'true';
    const requests = getRecentRequests(limit, apiOnly);
    res.json(requests);
});

// ==================== SECURITY API ROUTES ====================

// Get security alerts
app.get('/admin/api/security/alerts', basicAuth, (req, res) => {
    const resolved = req.query.resolved === 'true';
    const alerts = getSecurityAlerts(resolved);
    res.json(alerts);
});

// Resolve security alert
app.post('/admin/api/security/alerts/:id/resolve', basicAuth, (req, res) => {
    const result = resolveAlert(parseInt(req.params.id));
    res.json(result);
});

// Get security settings
app.get('/admin/api/security/settings', basicAuth, (req, res) => {
    const settings = getSecuritySettings();
    res.json(settings);
});

// Update security settings
app.post('/admin/api/security/settings', basicAuth, (req, res) => {
    const { key, value } = req.body;
    if (!key) {
        return res.status(400).json({ error: 'Key is required' });
    }
    const result = setSecuritySetting(key, value);
    res.json(result);
});

// Get blocked IPs
app.get('/admin/api/security/blocked', basicAuth, (req, res) => {
    const blocked = getBlockedIps();
    res.json(blocked);
});

// Block IP
app.post('/admin/api/security/block', basicAuth, (req, res) => {
    const { ip, reason } = req.body;
    if (!ip) {
        return res.status(400).json({ error: 'IP is required' });
    }
    const result = blockIp(ip, reason || 'Manually blocked');
    res.json(result);
});

// Unblock IP
app.post('/admin/api/security/unblock', basicAuth, (req, res) => {
    const { ip } = req.body;
    if (!ip) {
        return res.status(400).json({ error: 'IP is required' });
    }
    const result = unblockIp(ip);
    res.json(result);
});

// Get geolocation for IP
app.get('/admin/api/security/geo/:ip', basicAuth, async (req, res) => {
    const geo = await getGeoLocation(req.params.ip);
    res.json(geo);
});

// Test Telegram notification
app.post('/admin/api/security/telegram/test', basicAuth, async (req, res) => {
    const { sendTestTelegramAlert } = await import('./monitoring.js');
    const result = await sendTestTelegramAlert();
    res.json(result);
});

// Get IP details (for popup)
app.get('/admin/api/security/ip/:ip', basicAuth, async (req, res) => {
    const { getIpDetails } = await import('./monitoring.js');
    const details = await getIpDetails(req.params.ip);
    if (details) {
        res.json(details);
    } else {
        res.status(404).json({ error: 'IP not found' });
    }
});

// Get all IP classifications
app.get('/admin/api/security/classifications', basicAuth, async (req, res) => {
    const { getAllIpClassifications } = await import('./monitoring.js');
    const classifications = getAllIpClassifications();
    res.json(classifications);
});

// ==================== END ADMIN ROUTES ====================

// OpenRouter Setup
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash-lite';
const OPENROUTER_SITE_URL = process.env.OPENROUTER_SITE_URL || 'http://localhost';

if (!OPENROUTER_API_KEY) {
    console.error("WARNING: OPENROUTER_API_KEY is not set!");
}

// JSON Schema описание для промпта (OpenRouter не поддерживает responseSchema напрямую)
const PLANT_JSON_SCHEMA = `{
  "isPlant": boolean,
  "name": string (Russian),
  "scientificName": string,
  "description": string (Russian),
  "care": {
    "light": string (Russian),
    "water": string (Russian),
    "soil": string (Russian),
    "temperature": string (Russian),
    "difficulty": "Easy" | "Medium" | "Hard"
  },
  "funFacts": string[] (Russian),
  "health": {
    "status": "Healthy" | "Sick",
    "issues": string[] (Russian),
    "recommendations": string[] (Russian)
  },
  "treatment": string (Russian),
  "ozon_search_term": string (Russian),
  "image_url": string (optional)
}`;

// API Route
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.headers['x-real-ip']
        || req.socket.remoteAddress
        || 'unknown';
}

function aiRateLimit(req, res, next) {
    const ip = getClientIp(req);
    const now = Date.now();
    const windowMs = 60 * 60 * 1000;
    const hits = (aiRateLimitHits.get(ip) || []).filter(ts => now - ts < windowMs);

    if (hits.length >= AI_RATE_LIMIT_PER_HOUR) {
        return res.status(429).json({
            error: 'Too many AI requests',
            retryAfterSeconds: Math.ceil((windowMs - (now - hits[0])) / 1000)
        });
    }

    hits.push(now);
    aiRateLimitHits.set(ip, hits);
    next();
}

app.get('/api/test', basicAuth, async (req, res) => {
    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': OPENROUTER_SITE_URL,
                'X-Title': 'FloraLens',
            },
            body: JSON.stringify({
                model: OPENROUTER_MODEL,
                messages: [{ role: 'user', content: 'Hello, respond with just "OK"' }],
                max_tokens: 10
            })
        });

        const data = await response.json();

        logAiUsage(extractOpenRouterUsage({
            endpoint: '/api/test',
            model: OPENROUTER_MODEL,
            statusCode: response.status,
            response: data
        }));

        if (!response.ok) {
            throw new Error(data.error?.message || `HTTP ${response.status}`);
        }

        res.json({
            status: 'success',
            apiKeyConfigured: Boolean(OPENROUTER_API_KEY),
            model: OPENROUTER_MODEL,
            aiResponse: data.choices?.[0]?.message?.content || 'No response',
        });
    } catch (error) {
        console.error("Test Error:", error);
        res.status(500).json({
            status: 'error',
            apiKeyConfigured: Boolean(OPENROUTER_API_KEY),
            model: OPENROUTER_MODEL,
            message: error.message,
        });
    }
});

// Main Plant Identification API (OpenRouter)
app.post('/api/identify', aiRateLimit, async (req, res) => {
    try {
        const { text, base64Image } = req.body;

        if (!OPENROUTER_API_KEY) {
            return res.status(500).json({ error: 'OpenRouter API key not configured' });
        }

        // Build the prompt
        let promptText = `Identify this plant or flower. Provide detailed care instructions and fun facts.

IMPORTANT: All text fields (name, description, light, water, soil, temperature, funFacts, treatment, health.issues, health.recommendations) MUST be in RUSSIAN language.
The 'difficulty' field must be one of: 'Easy', 'Medium', 'Hard'.
If it is not a plant, set isPlant to false.

ANALYZE HEALTH:
Check for signs of diseases, pests, or nutrient deficiencies.
If healthy, health.status is 'Healthy'.
If sick, health.status is 'Sick', list issues in health.issues, and provide treatment steps in 'treatment'.

OZON SEARCH:
Provide a short, specific search query for Ozon.ru to buy necessary fertilizer, medicine, or tool. Example: 'фунгицид для роз' or 'удобрение для орхидей'. IF HEALTHY, suggest a general fertilizer.

IMAGE URL:
If NO image was provided by the user, please provide a valid public URL to an image of this plant (e.g. from Wikimedia Commons) in the 'image_url' field. If the user provided an image, leave 'image_url' empty.

RESPOND ONLY WITH VALID JSON matching this schema:
${PLANT_JSON_SCHEMA}`;

        if (text) {
            promptText += `\n\nUSER QUESTION/CONTEXT: "${text}"\nIf the user asks a specific question, answer it in the 'description' or relevant care field.`;
        }

        // Build message content array for OpenAI Vision format
        const content = [];

        if (base64Image) {
            const base64Data = base64Image.includes(',') ? base64Image : `data:image/jpeg;base64,${base64Image}`;
            content.push({
                type: 'image_url',
                image_url: { url: base64Data }
            });
        }

        content.push({
            type: 'text',
            text: promptText
        });

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': OPENROUTER_SITE_URL,
                'X-Title': 'FloraLens',
            },
            body: JSON.stringify({
                model: OPENROUTER_MODEL,
                messages: [{ role: 'user', content }],
                temperature: 0.4,
            })
        });

        const result = await response.json();

        logAiUsage(extractOpenRouterUsage({
            endpoint: '/api/identify',
            model: OPENROUTER_MODEL,
            statusCode: response.status,
            response: result
        }));

        if (!response.ok) {
            console.error('OpenRouter Error:', result);
            throw new Error(result.error?.message || `HTTP ${response.status}`);
        }

        const aiText = result.choices?.[0]?.message?.content;
        if (!aiText) {
            throw new Error("No response from AI");
        }

        // Parse JSON from response (handle markdown code blocks)
        let jsonText = aiText;
        const jsonMatch = aiText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonText = jsonMatch[1].trim();
        }

        const data = JSON.parse(jsonText);
        res.json(data);

    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: "Failed to process request", details: error.message });
    }
});

// Catch-all for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Flora server running on port ${PORT}`);
    console.log(`OpenRouter API: ${OPENROUTER_API_KEY ? 'Configured' : 'NOT CONFIGURED'}`);
});
