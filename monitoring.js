import Database from 'better-sqlite3';
import pidusage from 'pidusage';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data directory for persistent storage
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'stats.sqlite');
const RETENTION_DAYS = 60;

// Security thresholds
const SECURITY_CONFIG = {
    RATE_LIMIT_THRESHOLD: 100,      // requests per minute
    RATE_LIMIT_WINDOW: 60,          // seconds
    BRUTE_FORCE_THRESHOLD: 10,      // failed auth attempts
    BRUTE_FORCE_WINDOW: 300,        // 5 minutes
    ERROR_SPIKE_THRESHOLD: 0.2,     // 20% of requests
    SUSPICIOUS_PATHS: [
        '/wp-admin', '/wp-login', '/.env', '/phpmyadmin',
        '/admin.php', '/.git', '/config.php', '/shell',
        '/backup', '/db', '/.htaccess', '/xmlrpc.php'
    ],
    SUSPICIOUS_UA: [
        'sqlmap', 'nikto', 'burp', 'nmap', 'masscan',
        'zgrab', 'dirbuster', 'gobuster', 'wfuzz', 'nuclei'
    ]
};

// IP Classification Categories
const IP_CLASSIFICATION = {
    GREEN: 'technical',   // Technical requests (Google, bots, static assets)
    YELLOW: 'user',       // Normal user activity (AI requests, photos)
    RED: 'suspicious'     // Threats, scanners, suspicious behavior
};

// Patterns for technical/legitimate traffic
const TECHNICAL_PATTERNS = {
    paths: [
        '/favicon.ico', '/.well-known/', '/robots.txt',
        '/sitemap.xml', '/manifest.json', '/icon', '/apple-touch-icon',
        '/assets/', '/static/', '.js', '.css', '.png', '.jpg', '.svg', '.woff'
    ],
    userAgents: [
        'Googlebot', 'Bingbot', 'Yandex', 'APIs-Google', 'AdsBot-Google',
        'facebookexternalhit', 'Twitterbot', 'LinkedInBot', 'Slackbot',
        'UptimeRobot', 'Pingdom', 'StatusCake'
    ],
    // Known good IP ranges (partial match)
    ipPrefixes: ['66.249.', '64.233.', '216.239.', '74.125.']  // Google
};

// Patterns for normal user activity
const USER_PATTERNS = {
    paths: ['/api/identify', '/api/health'],
    hasImage: true
};

// IP Geolocation cache
const geoCache = new Map();
const GEO_CACHE_TTL = 3600000; // 1 hour

let db = null;

/**
 * Initialize the SQLite database
 */
export function initDatabase() {
    db = new Database(DB_PATH);

    // Enable WAL mode for better performance
    db.pragma('journal_mode = WAL');

    // Create tables if they don't exist
    db.exec(`
        -- Requests table (extended with user_agent)
        CREATE TABLE IF NOT EXISTS requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT (datetime('now', 'localtime')),
            ip TEXT,
            path TEXT,
            method TEXT,
            status_code INTEGER,
            response_time_ms INTEGER,
            has_image BOOLEAN DEFAULT 0,
            user_agent TEXT,
            is_api_request BOOLEAN DEFAULT 0
        );

        -- System metrics table
        CREATE TABLE IF NOT EXISTS system_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT (datetime('now', 'localtime')),
            cpu_percent REAL,
            memory_mb REAL
        );

        -- OpenRouter usage and cost table
        CREATE TABLE IF NOT EXISTS ai_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT (datetime('now', 'localtime')),
            endpoint TEXT,
            model TEXT,
            prompt_tokens INTEGER DEFAULT 0,
            completion_tokens INTEGER DEFAULT 0,
            total_tokens INTEGER DEFAULT 0,
            cost_usd REAL DEFAULT 0,
            is_byok BOOLEAN DEFAULT 0,
            status_code INTEGER,
            error TEXT
        );

        -- Security alerts table
        CREATE TABLE IF NOT EXISTS security_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT (datetime('now', 'localtime')),
            type TEXT,
            severity TEXT,
            ip TEXT,
            details TEXT,
            resolved BOOLEAN DEFAULT 0
        );

        -- Blocked IPs table
        CREATE TABLE IF NOT EXISTS blocked_ips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT UNIQUE,
            reason TEXT,
            blocked_at DATETIME DEFAULT (datetime('now', 'localtime')),
            auto_blocked BOOLEAN DEFAULT 0
        );

        -- Security settings table
        CREATE TABLE IF NOT EXISTS security_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        -- IP Geolocation cache
        CREATE TABLE IF NOT EXISTS geo_cache (
            ip TEXT PRIMARY KEY,
            country TEXT,
            country_code TEXT,
            city TEXT,
            cached_at DATETIME DEFAULT (datetime('now', 'localtime'))
        );

        -- IP Classifications table
        CREATE TABLE IF NOT EXISTS ip_classifications (
            ip TEXT PRIMARY KEY,
            classification TEXT DEFAULT 'user',
            owner_type TEXT DEFAULT 'unknown',
            owner_name TEXT,
            total_requests INTEGER DEFAULT 0,
            ai_requests INTEGER DEFAULT 0,
            suspicious_requests INTEGER DEFAULT 0,
            last_path TEXT,
            last_activity DATETIME DEFAULT (datetime('now', 'localtime')),
            updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
        );

        -- Create indexes for faster queries
        CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp);
        CREATE INDEX IF NOT EXISTS idx_requests_ip ON requests(ip);
        CREATE INDEX IF NOT EXISTS idx_requests_path ON requests(path);
        CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON system_metrics(timestamp);
        CREATE INDEX IF NOT EXISTS idx_ai_usage_timestamp ON ai_usage(timestamp);
        CREATE INDEX IF NOT EXISTS idx_ai_usage_model ON ai_usage(model);
        CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON security_alerts(timestamp);
        CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON security_alerts(resolved);
    `);

    // Migrate existing database: add new columns if they don't exist
    try {
        const columns = db.prepare(`PRAGMA table_info(requests)`).all();
        const columnNames = columns.map(c => c.name);

        if (!columnNames.includes('user_agent')) {
            db.exec(`ALTER TABLE requests ADD COLUMN user_agent TEXT`);
            console.log('[Monitoring] Migration: added user_agent column');
        }

        if (!columnNames.includes('is_api_request')) {
            db.exec(`ALTER TABLE requests ADD COLUMN is_api_request BOOLEAN DEFAULT 0`);
            console.log('[Monitoring] Migration: added is_api_request column');
        }
    } catch (err) {
        console.error('[Monitoring] Migration error:', err.message);
    }

    // Initialize default security settings
    const initSetting = db.prepare(`INSERT OR IGNORE INTO security_settings (key, value) VALUES (?, ?)`);
    initSetting.run('auto_block_enabled', 'false');
    initSetting.run('telegram_enabled', 'false');
    initSetting.run('telegram_bot_token', '');
    initSetting.run('telegram_chat_id', '');

    console.log('[Monitoring] Database initialized at:', DB_PATH);

    // Start periodic cleanup
    scheduleCleanup();

    // Start metrics collection
    startMetricsCollection();

    // Start security checks
    startSecurityMonitor();

    return db;
}

/**
 * Log a request to the database
 */
export function logRequest(req, res, responseTime) {
    if (!db) return;

    try {
        // Get real IP (considering proxies)
        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
            || req.headers['x-real-ip']
            || req.socket.remoteAddress
            || 'unknown';

        const stmt = db.prepare(`
            INSERT INTO requests (ip, path, method, status_code, response_time_ms, has_image, user_agent, is_api_request)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const hasImage = req.body?.base64Image ? 1 : 0;
        const userAgent = req.headers['user-agent'] || '';
        const isApiRequest = req.path.startsWith('/api/') ? 1 : 0;

        stmt.run(ip, req.path, req.method, res.statusCode, responseTime, hasImage, userAgent, isApiRequest);

        // Classify the IP based on request patterns
        classifyIp(ip, req.path, userAgent, req.method, hasImage, res.statusCode);

        // Check for security threats
        checkSecurityThreats(ip, req.path, res.statusCode, userAgent);


    } catch (err) {
        console.error('[Monitoring] Error logging request:', err.message);
    }
}

/**
 * Log OpenRouter usage and cost to the database.
 */
export function logAiUsage(record) {
    if (!db || !record) return;

    try {
        db.prepare(`
            INSERT INTO ai_usage (
                endpoint, model, prompt_tokens, completion_tokens, total_tokens,
                cost_usd, is_byok, status_code, error
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            record.endpoint,
            record.model,
            record.promptTokens,
            record.completionTokens,
            record.totalTokens,
            record.costUsd,
            record.isByok ? 1 : 0,
            record.statusCode,
            record.error
        );
    } catch (err) {
        console.error('[Monitoring] Error logging AI usage:', err.message);
    }
}

/**
 * Check for security threats
 */
function checkSecurityThreats(ip, path, statusCode, userAgent) {
    // Check if IP is blocked
    const blocked = db.prepare(`SELECT ip FROM blocked_ips WHERE ip = ?`).get(ip);
    if (blocked) return;

    // 1. Check suspicious paths (vulnerability scanners)
    const isSuspiciousPath = SECURITY_CONFIG.SUSPICIOUS_PATHS.some(p =>
        path.toLowerCase().includes(p)
    );
    if (isSuspiciousPath) {
        createAlert('scanner', 'warning', ip, `Suspicious path access: ${path}`);
    }

    // 2. Check suspicious User-Agent
    const isSuspiciousUA = SECURITY_CONFIG.SUSPICIOUS_UA.some(ua =>
        userAgent.toLowerCase().includes(ua)
    );
    if (isSuspiciousUA) {
        createAlert('suspicious_ua', 'warning', ip, `Suspicious User-Agent: ${userAgent.substring(0, 100)}`);
    }

    // 3. Check for brute force (401/403 errors)
    if (statusCode === 401 || statusCode === 403) {
        const recentErrors = db.prepare(`
            SELECT COUNT(*) as count FROM requests 
            WHERE ip = ? AND status_code IN (401, 403) 
            AND timestamp >= datetime('now', '-5 minutes', 'localtime')
        `).get(ip);

        if (recentErrors.count >= SECURITY_CONFIG.BRUTE_FORCE_THRESHOLD) {
            createAlert('brute_force', 'critical', ip, `${recentErrors.count} failed auth attempts in 5 minutes`);
        }
    }
}

/**
 * Create a security alert
 */
function createAlert(type, severity, ip, details) {
    if (!db) return;

    try {
        // Check if similar alert exists in last 5 minutes
        const existing = db.prepare(`
            SELECT id FROM security_alerts 
            WHERE type = ? AND ip = ? AND resolved = 0
            AND timestamp >= datetime('now', '-5 minutes', 'localtime')
        `).get(type, ip);

        if (existing) return; // Don't duplicate

        db.prepare(`
            INSERT INTO security_alerts (type, severity, ip, details)
            VALUES (?, ?, ?, ?)
        `).run(type, severity, ip, details);

        console.log(`[Security] Alert created: ${severity.toUpperCase()} - ${type} from ${ip}`);

        // Send Telegram notification for critical alerts
        if (severity === 'critical') {
            sendTelegramAlert(type, severity, ip, details);
        }

        // Auto-block if enabled
        checkAutoBlock(ip, type, severity);

    } catch (err) {
        console.error('[Security] Error creating alert:', err.message);
    }
}

/**
 * Check rate limits periodically
 */
function checkRateLimits() {
    if (!db) return;

    try {
        // Get IPs with high request rates in last minute
        const highRateIps = db.prepare(`
            SELECT ip, COUNT(*) as count
            FROM requests 
            WHERE timestamp >= datetime('now', '-1 minutes', 'localtime')
            GROUP BY ip
            HAVING count > ?
        `).all(SECURITY_CONFIG.RATE_LIMIT_THRESHOLD);

        for (const { ip, count } of highRateIps) {
            createAlert('rate_limit', 'warning', ip, `${count} requests in last minute`);
        }
    } catch (err) {
        console.error('[Security] Error checking rate limits:', err.message);
    }
}

/**
 * Start security monitoring
 */
function startSecurityMonitor() {
    // Check rate limits every 30 seconds
    setInterval(checkRateLimits, 30000);
    console.log('[Security] Security monitor started');
}

/**
 * Check and perform auto-block if enabled
 */
function checkAutoBlock(ip, type, severity) {
    if (!db) return;

    const autoBlockEnabled = db.prepare(`SELECT value FROM security_settings WHERE key = 'auto_block_enabled'`).get();
    if (autoBlockEnabled?.value !== 'true') return;

    // Auto-block on critical alerts
    if (severity === 'critical') {
        blockIp(ip, `Auto-blocked: ${type}`, true);
    }
}

/**
 * Block an IP address
 */
export function blockIp(ip, reason, auto = false) {
    if (!db) return { success: false, error: 'Database not initialized' };

    try {
        db.prepare(`
            INSERT OR REPLACE INTO blocked_ips (ip, reason, auto_blocked)
            VALUES (?, ?, ?)
        `).run(ip, reason, auto ? 1 : 0);

        console.log(`[Security] IP blocked: ${ip} - ${reason}`);

        // Send Telegram notification
        sendTelegramAlert('ip_blocked', 'info', ip, reason);

        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Unblock an IP address
 */
export function unblockIp(ip) {
    if (!db) return { success: false, error: 'Database not initialized' };

    try {
        db.prepare(`DELETE FROM blocked_ips WHERE ip = ?`).run(ip);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Get blocked IPs
 */
export function getBlockedIps() {
    if (!db) return [];
    return db.prepare(`SELECT * FROM blocked_ips ORDER BY blocked_at DESC`).all();
}

/**
 * Send Telegram alert (only for RED/suspicious IPs)
 */
async function sendTelegramAlert(type, severity, ip, details) {
    if (!db) {
        console.log('[Telegram] Database not initialized, skipping alert');
        return { success: false, error: 'Database not initialized' };
    }

    try {
        const tokenRow = db.prepare(`SELECT value FROM security_settings WHERE key = 'telegram_bot_token'`).get();
        const chatIdRow = db.prepare(`SELECT value FROM security_settings WHERE key = 'telegram_chat_id'`).get();
        const enabledRow = db.prepare(`SELECT value FROM security_settings WHERE key = 'telegram_enabled'`).get();

        console.log(`[Telegram] Check: enabled=${enabledRow?.value}, hasToken=${!!tokenRow?.value}, hasChatId=${!!chatIdRow?.value}`);

        if (enabledRow?.value !== 'true') {
            console.log('[Telegram] Notifications disabled');
            return { success: false, error: 'Telegram disabled' };
        }

        if (!tokenRow?.value || !chatIdRow?.value) {
            console.log('[Telegram] Missing token or chat_id');
            return { success: false, error: 'Missing token or chat_id' };
        }

        // Get IP classification info
        const ipInfo = getIpClassification(ip);
        const geo = await getGeoLocation(ip);

        const icons = {
            rate_limit: '🚨',
            brute_force: '🔴',
            scanner: '⚠️',
            suspicious_ua: '🟠',
            ip_blocked: '🛑',
            error_spike: '🟡',
            test: '🧪'
        };

        const severityEmoji = {
            critical: '🔴',
            warning: '🟡',
            info: 'ℹ️'
        };

        const classificationEmoji = {
            technical: '🟢',
            user: '🟡',
            suspicious: '🔴'
        };

        const ownerTypeRu = {
            company: 'Компания',
            user: 'Пользователь',
            bot: 'Бот',
            hacker: 'Хакер/Сканер',
            unknown: 'Неизвестно'
        };

        const message = `${icons[type] || '⚠️'} *FloraLens Security Alert*

${severityEmoji[severity]} *${severity.toUpperCase()}*: ${type.replace(/_/g, ' ')}
📍 IP: \`${ip}\`
🌍 Страна: ${geo.country || 'Unknown'} ${geo.city ? `(${geo.city})` : ''}
${classificationEmoji[ipInfo?.classification] || '⚪'} Тип: ${ownerTypeRu[ipInfo?.owner_type] || 'Неизвестно'}
📊 Запросов: ${ipInfo?.total_requests || 0} (подозр.: ${ipInfo?.suspicious_requests || 0})
📝 ${details}
🕐 ${new Date().toLocaleString('ru-RU')}`;

        const url = `https://api.telegram.org/bot${tokenRow.value}/sendMessage`;

        console.log(`[Telegram] Sending alert to chat ${chatIdRow.value}...`);

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatIdRow.value,
                text: message,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🚫 Заблокировать IP', callback_data: `block_${ip}` },
                        { text: '✅ Игнорировать', callback_data: `ignore_${ip}` }
                    ]]
                }
            })
        });

        const result = await response.json();

        if (result.ok) {
            console.log(`[Telegram] Alert sent successfully, message_id: ${result.result?.message_id}`);
            return { success: true, message_id: result.result?.message_id };
        } else {
            console.error(`[Telegram] API Error: ${result.description}`);
            return { success: false, error: result.description };
        }

    } catch (err) {
        console.error('[Telegram] Error sending alert:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Send test Telegram notification
 */
export async function sendTestTelegramAlert() {
    return await sendTelegramAlert(
        'test',
        'info',
        '127.0.0.1',
        '🧪 Это тестовое уведомление. Telegram интеграция работает!'
    );
}

/**
 * Classify an IP address based on its behavior
 */
export function classifyIp(ip, path, userAgent, method, hasImage = false, statusCode = 200) {
    if (!db) return IP_CLASSIFICATION.YELLOW;

    // Check for suspicious patterns first (RED)
    const isSuspiciousPath = SECURITY_CONFIG.SUSPICIOUS_PATHS.some(p =>
        path.toLowerCase().includes(p)
    );
    const isSuspiciousUA = SECURITY_CONFIG.SUSPICIOUS_UA.some(ua =>
        (userAgent || '').toLowerCase().includes(ua)
    );

    if (isSuspiciousPath || isSuspiciousUA) {
        updateIpClassification(ip, IP_CLASSIFICATION.RED, 'hacker', path);
        return IP_CLASSIFICATION.RED;
    }

    // Check for technical patterns (GREEN)
    const isTechnicalPath = TECHNICAL_PATTERNS.paths.some(p =>
        path.toLowerCase().includes(p.toLowerCase())
    );
    const isTechnicalUA = TECHNICAL_PATTERNS.userAgents.some(ua =>
        (userAgent || '').toLowerCase().includes(ua.toLowerCase())
    );
    const isTechnicalIP = TECHNICAL_PATTERNS.ipPrefixes.some(prefix =>
        ip.startsWith(prefix)
    );
    const isTechnicalMethod = method === 'HEAD' || method === 'OPTIONS';

    if (isTechnicalPath || isTechnicalUA || isTechnicalIP || isTechnicalMethod) {
        const ownerType = isTechnicalUA ? 'bot' : (isTechnicalIP ? 'company' : 'bot');
        updateIpClassification(ip, IP_CLASSIFICATION.GREEN, ownerType, path);
        return IP_CLASSIFICATION.GREEN;
    }

    // Check for user patterns (YELLOW)
    const isApiRequest = path.startsWith('/api/');
    if (isApiRequest || hasImage) {
        updateIpClassification(ip, IP_CLASSIFICATION.YELLOW, 'user', path, isApiRequest);
        return IP_CLASSIFICATION.YELLOW;
    }

    // Default to user
    updateIpClassification(ip, IP_CLASSIFICATION.YELLOW, 'unknown', path);
    return IP_CLASSIFICATION.YELLOW;
}

/**
 * Update IP classification in database
 */
function updateIpClassification(ip, classification, ownerType, lastPath, isAiRequest = false) {
    if (!db) return;

    try {
        const existing = db.prepare(`SELECT * FROM ip_classifications WHERE ip = ?`).get(ip);

        if (existing) {
            const isSuspicious = classification === IP_CLASSIFICATION.RED;
            db.prepare(`
                UPDATE ip_classifications SET
                    classification = CASE WHEN ? = 'suspicious' THEN 'suspicious' ELSE classification END,
                    owner_type = CASE WHEN owner_type = 'unknown' THEN ? ELSE owner_type END,
                    total_requests = total_requests + 1,
                    ai_requests = ai_requests + ?,
                    suspicious_requests = suspicious_requests + ?,
                    last_path = ?,
                    last_activity = datetime('now', 'localtime'),
                    updated_at = datetime('now', 'localtime')
                WHERE ip = ?
            `).run(
                classification,
                ownerType,
                isAiRequest ? 1 : 0,
                isSuspicious ? 1 : 0,
                lastPath,
                ip
            );
        } else {
            db.prepare(`
                INSERT INTO ip_classifications (ip, classification, owner_type, total_requests, ai_requests, suspicious_requests, last_path)
                VALUES (?, ?, ?, 1, ?, ?, ?)
            `).run(
                ip,
                classification,
                ownerType,
                isAiRequest ? 1 : 0,
                classification === IP_CLASSIFICATION.RED ? 1 : 0,
                lastPath
            );
        }
    } catch (err) {
        console.error('[Monitoring] Error updating IP classification:', err.message);
    }
}

/**
 * Get IP classification
 */
export function getIpClassification(ip) {
    if (!db) return null;
    try {
        return db.prepare(`SELECT * FROM ip_classifications WHERE ip = ?`).get(ip);
    } catch (err) {
        return null;
    }
}

/**
 * Get all IP classifications for dashboard
 */
export function getAllIpClassifications() {
    if (!db) return [];
    try {
        return db.prepare(`
            SELECT * FROM ip_classifications 
            ORDER BY last_activity DESC 
            LIMIT 100
        `).all();
    } catch (err) {
        return [];
    }
}

/**
 * Get detailed IP info (for popup)
 */
export async function getIpDetails(ip) {
    if (!db) return null;

    try {
        const classification = getIpClassification(ip);
        const geo = await getGeoLocation(ip);

        // Get recent requests from this IP
        const recentRequests = db.prepare(`
            SELECT path, method, status_code, timestamp, has_image
            FROM requests 
            WHERE ip = ? 
            ORDER BY timestamp DESC 
            LIMIT 20
        `).all(ip);

        // Get alerts for this IP
        const alerts = db.prepare(`
            SELECT type, severity, details, timestamp 
            FROM security_alerts 
            WHERE ip = ? 
            ORDER BY timestamp DESC 
            LIMIT 10
        `).all(ip);

        // Check if blocked
        const blocked = db.prepare(`SELECT * FROM blocked_ips WHERE ip = ?`).get(ip);

        return {
            ip,
            geo,
            classification: classification || { classification: 'unknown', owner_type: 'unknown' },
            recentRequests,
            alerts,
            isBlocked: !!blocked,
            blockedInfo: blocked
        };
    } catch (err) {
        console.error('[Monitoring] Error getting IP details:', err.message);
        return null;
    }
}

/**
 * Get IP geolocation
 */
export async function getGeoLocation(ip) {
    // Check memory cache
    if (geoCache.has(ip)) {
        const cached = geoCache.get(ip);
        if (Date.now() - cached.timestamp < GEO_CACHE_TTL) {
            return cached.data;
        }
    }

    // Check database cache
    if (db) {
        const dbCached = db.prepare(`
            SELECT country, country_code, city FROM geo_cache 
            WHERE ip = ? AND cached_at >= datetime('now', '-1 hour', 'localtime')
        `).get(ip);

        if (dbCached) {
            geoCache.set(ip, { data: dbCached, timestamp: Date.now() });
            return dbCached;
        }
    }

    // Fetch from API
    try {
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,city`);
        const data = await response.json();

        if (data.status === 'success') {
            const geoData = {
                country: data.country,
                country_code: data.countryCode,
                city: data.city
            };

            // Cache in memory
            geoCache.set(ip, { data: geoData, timestamp: Date.now() });

            // Cache in database
            if (db) {
                db.prepare(`
                    INSERT OR REPLACE INTO geo_cache (ip, country, country_code, city)
                    VALUES (?, ?, ?, ?)
                `).run(ip, geoData.country, geoData.country_code, geoData.city);
            }

            return geoData;
        }
    } catch (err) {
        console.error('[Geo] Error fetching location:', err.message);
    }

    return { country: 'Unknown', country_code: '??', city: '' };
}

/**
 * Get security alerts
 */
export function getSecurityAlerts(resolved = false) {
    if (!db) return [];

    return db.prepare(`
        SELECT * FROM security_alerts 
        WHERE resolved = ?
        ORDER BY timestamp DESC
        LIMIT 50
    `).all(resolved ? 1 : 0);
}

/**
 * Resolve a security alert
 */
export function resolveAlert(id) {
    if (!db) return { success: false };

    try {
        db.prepare(`UPDATE security_alerts SET resolved = 1 WHERE id = ?`).run(id);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Get/Set security settings
 */
export function getSecuritySettings() {
    if (!db) return {};

    const rows = db.prepare(`SELECT key, value FROM security_settings`).all();
    const settings = {};
    for (const row of rows) {
        settings[row.key] = row.value;
    }
    return settings;
}

export function setSecuritySetting(key, value) {
    if (!db) return { success: false };

    try {
        db.prepare(`INSERT OR REPLACE INTO security_settings (key, value) VALUES (?, ?)`).run(key, value);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Express middleware for logging requests
 */
export function requestLogger(req, res, next) {
    // Skip admin routes to avoid logging our own dashboard requests
    if (req.path.startsWith('/admin')) {
        return next();
    }

    const startTime = Date.now();

    res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        logRequest(req, res, responseTime);
    });

    next();
}

/**
 * Middleware to check if IP is blocked
 */
export function blockCheckMiddleware(req, res, next) {
    if (!db) return next();

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.headers['x-real-ip']
        || req.socket.remoteAddress;

    const blocked = db.prepare(`SELECT ip FROM blocked_ips WHERE ip = ?`).get(ip);

    if (blocked) {
        return res.status(403).json({ error: 'Access denied' });
    }

    next();
}

/**
 * Collect system metrics periodically
 */
function startMetricsCollection() {
    const collectMetrics = async () => {
        if (!db) return;

        try {
            const stats = await pidusage(process.pid);

            const stmt = db.prepare(`
                INSERT INTO system_metrics (cpu_percent, memory_mb)
                VALUES (?, ?)
            `);

            stmt.run(
                Math.round(stats.cpu * 100) / 100,
                Math.round(stats.memory / 1024 / 1024 * 100) / 100
            );
        } catch (err) {
            console.error('[Monitoring] Error collecting metrics:', err.message);
        }
    };

    // Collect every 30 seconds
    setInterval(collectMetrics, 30000);

    // Collect immediately on start
    collectMetrics();

    console.log('[Monitoring] Metrics collection started (every 30s)');
}

/**
 * Clean up old records
 */
function cleanupOldRecords() {
    if (!db) return;

    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
        const cutoffStr = cutoffDate.toISOString().slice(0, 19).replace('T', ' ');

        const reqResult = db.prepare(`DELETE FROM requests WHERE timestamp < ?`).run(cutoffStr);
        const metResult = db.prepare(`DELETE FROM system_metrics WHERE timestamp < ?`).run(cutoffStr);
        const alertResult = db.prepare(`DELETE FROM security_alerts WHERE timestamp < ? AND resolved = 1`).run(cutoffStr);
        const geoResult = db.prepare(`DELETE FROM geo_cache WHERE cached_at < datetime('now', '-7 days')`).run();

        if (reqResult.changes > 0 || metResult.changes > 0) {
            console.log(`[Monitoring] Cleaned up ${reqResult.changes} requests, ${metResult.changes} metrics, ${alertResult.changes} alerts`);
        }

        // Vacuum to reclaim space
        db.exec('VACUUM');
    } catch (err) {
        console.error('[Monitoring] Error during cleanup:', err.message);
    }
}

/**
 * Schedule daily cleanup
 */
function scheduleCleanup() {
    // Run cleanup once a day
    setInterval(cleanupOldRecords, 24 * 60 * 60 * 1000);

    // Run once on startup (after a short delay)
    setTimeout(cleanupOldRecords, 5000);

    console.log('[Monitoring] Cleanup scheduled (every 24h, retention: ' + RETENTION_DAYS + ' days)');
}

/**
 * Get statistics for the dashboard
 */
export function getStats() {
    if (!db) return null;

    try {
        // Total requests
        const totalRequests = db.prepare(`SELECT COUNT(*) as count FROM requests`).get();

        // Requests today
        const requestsToday = db.prepare(`
            SELECT COUNT(*) as count FROM requests 
            WHERE date(timestamp) = date('now', 'localtime')
        `).get();

        // Requests last 7 days
        const requestsWeek = db.prepare(`
            SELECT COUNT(*) as count FROM requests 
            WHERE timestamp >= datetime('now', '-7 days', 'localtime')
        `).get();

        // Unique IPs
        const uniqueIps = db.prepare(`SELECT COUNT(DISTINCT ip) as count FROM requests`).get();

        // Unique IPs today
        const uniqueIpsToday = db.prepare(`
            SELECT COUNT(DISTINCT ip) as count FROM requests 
            WHERE date(timestamp) = date('now', 'localtime')
        `).get();

        // Top 10 IPs
        const topIps = db.prepare(`
            SELECT ip, COUNT(*) as count 
            FROM requests 
            GROUP BY ip 
            ORDER BY count DESC 
            LIMIT 10
        `).all();

        // Requests per hour (last 24 hours)
        const requestsPerHour = db.prepare(`
            SELECT 
                strftime('%Y-%m-%d %H:00', timestamp) as hour,
                COUNT(*) as count
            FROM requests 
            WHERE timestamp >= datetime('now', '-24 hours', 'localtime')
            GROUP BY hour
            ORDER BY hour
        `).all();

        // Requests per day (last 30 days)
        const requestsPerDay = db.prepare(`
            SELECT 
                date(timestamp) as day,
                COUNT(*) as count
            FROM requests 
            WHERE timestamp >= datetime('now', '-30 days', 'localtime')
            GROUP BY day
            ORDER BY day
        `).all();

        // Average response time
        const avgResponseTime = db.prepare(`
            SELECT AVG(response_time_ms) as avg FROM requests
        `).get();

        // Current system metrics
        const currentMetrics = db.prepare(`
            SELECT cpu_percent, memory_mb FROM system_metrics 
            ORDER BY timestamp DESC LIMIT 1
        `).get();

        // Metrics history (last 24 hours, sampled)
        const metricsHistory = db.prepare(`
            SELECT 
                strftime('%Y-%m-%d %H:%M', timestamp) as time,
                cpu_percent,
                memory_mb
            FROM system_metrics 
            WHERE timestamp >= datetime('now', '-24 hours', 'localtime')
            ORDER BY timestamp
        `).all();

        // Requests with images count
        const requestsWithImages = db.prepare(`
            SELECT COUNT(*) as count FROM requests WHERE has_image = 1
        `).get();

        // AI requests only (API calls)
        const aiRequests = db.prepare(`
            SELECT COUNT(*) as count FROM requests WHERE is_api_request = 1
        `).get();

        // AI requests today
        const aiRequestsToday = db.prepare(`
            SELECT COUNT(*) as count FROM requests 
            WHERE is_api_request = 1 AND date(timestamp) = date('now', 'localtime')
        `).get();

        // Active security alerts count
        const activeAlerts = db.prepare(`
            SELECT COUNT(*) as count FROM security_alerts WHERE resolved = 0
        `).get();

        // Blocked IPs count
        const blockedIpsCount = db.prepare(`
            SELECT COUNT(*) as count FROM blocked_ips
        `).get();

        // OpenRouter usage and cost
        const aiUsageTotals = db.prepare(`
            SELECT
                COUNT(*) as count,
                COALESCE(SUM(prompt_tokens), 0) as promptTokens,
                COALESCE(SUM(completion_tokens), 0) as completionTokens,
                COALESCE(SUM(total_tokens), 0) as totalTokens,
                COALESCE(SUM(cost_usd), 0) as costUsd
            FROM ai_usage
        `).get();

        const aiUsageToday = db.prepare(`
            SELECT
                COUNT(*) as count,
                COALESCE(SUM(total_tokens), 0) as totalTokens,
                COALESCE(SUM(cost_usd), 0) as costUsd
            FROM ai_usage
            WHERE date(timestamp) = date('now', 'localtime')
        `).get();

        const aiUsageByModel = db.prepare(`
            SELECT
                model,
                COUNT(*) as count,
                COALESCE(SUM(total_tokens), 0) as totalTokens,
                COALESCE(SUM(cost_usd), 0) as costUsd
            FROM ai_usage
            GROUP BY model
            ORDER BY costUsd DESC
            LIMIT 10
        `).all();

        return {
            totalRequests: totalRequests.count,
            requestsToday: requestsToday.count,
            requestsWeek: requestsWeek.count,
            uniqueIps: uniqueIps.count,
            uniqueIpsToday: uniqueIpsToday.count,
            topIps,
            requestsPerHour,
            requestsPerDay,
            avgResponseTime: Math.round(avgResponseTime.avg || 0),
            currentMetrics: currentMetrics || { cpu_percent: 0, memory_mb: 0 },
            metricsHistory,
            requestsWithImages: requestsWithImages.count,
            aiRequests: aiRequests.count,
            aiRequestsToday: aiRequestsToday.count,
            aiUsage: {
                total: aiUsageTotals,
                today: aiUsageToday,
                byModel: aiUsageByModel
            },
            activeAlerts: activeAlerts.count,
            blockedIpsCount: blockedIpsCount.count
        };
    } catch (err) {
        console.error('[Monitoring] Error getting stats:', err.message);
        return null;
    }
}

/**
 * Get recent requests
 */
export function getRecentRequests(limit = 100, apiOnly = false) {
    if (!db) return [];

    try {
        const query = apiOnly
            ? `SELECT id, timestamp, ip, path, method, status_code, response_time_ms, has_image, user_agent
               FROM requests WHERE is_api_request = 1
               ORDER BY timestamp DESC LIMIT ?`
            : `SELECT id, timestamp, ip, path, method, status_code, response_time_ms, has_image, user_agent
               FROM requests ORDER BY timestamp DESC LIMIT ?`;

        return db.prepare(query).all(limit);
    } catch (err) {
        console.error('[Monitoring] Error getting recent requests:', err.message);
        return [];
    }
}

/**
 * HTTP Basic Auth middleware
 */
export function basicAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="FloraLens Admin"');
        return res.status(401).send('Authentication required');
    }

    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
    const [username, password] = credentials.split(':');

    const validUser = process.env.ADMIN_USER || 'admin';
    const validPass = process.env.ADMIN_PASSWORD;

    if (!validPass) {
        console.error('[Monitoring] WARNING: ADMIN_PASSWORD not set!');
        return res.status(500).send('Admin password not configured');
    }

    if (username === validUser && password === validPass) {
        return next();
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="FloraLens Admin"');
    return res.status(401).send('Invalid credentials');
}
