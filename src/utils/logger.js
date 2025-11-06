const winston = require('winston');
const path = require('path');

// Créer le dossier logs s'il n'existe pas
const fs = require('fs');
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Configuration par défaut du logger
let loggerConfig = {
    level: 'info',
    logFile: path.join(logDir, 'app.log'),
    errorFile: path.join(logDir, 'error.log'),
    isDevelopment: process.env.NODE_ENV !== 'production'
};

// Filtrage des informations sensibles (password, token, authorization, secret, api key)
const SENSITIVE_KEYS = new Set(['password', 'passwd', 'pwd', 'secret', 'token', 'access_token', 'refresh_token', 'authorization', 'auth', 'api_key', 'apikey']);

function sanitizeMessageString(msg) {
    if (typeof msg !== 'string') return msg;
    try {
        let out = msg;
        // masquage patterns simples: password=..., password: ...
        out = out.replace(/(password\s*[:=]\s*)([^,\s]+)/ig, '$1***');
        out = out.replace(/(passwd\s*[:=]\s*)([^,\s]+)/ig, '$1***');
        out = out.replace(/(pwd\s*[:=]\s*)([^,\s]+)/ig, '$1***');
        out = out.replace(/(token\s*[:=]\s*)([^,\s]+)/ig, '$1***');
        out = out.replace(/(authorization\s*[:=]\s*)([^,\s]+)/ig, '$1***');
        out = out.replace(/(api[_-]?key\s*[:=]\s*)([^,\s]+)/ig, '$1***');
        return out;
    } catch (_) {
        return msg;
    }
}

function sanitizeObjectDeep(obj, seen = new WeakSet()) {
    if (!obj || typeof obj !== 'object') return obj;
    if (seen.has(obj)) return obj;
    seen.add(obj);
    const isArr = Array.isArray(obj);
    const keys = isArr ? Object.keys(obj) : Object.keys(obj);
    for (const key of keys) {
        const value = obj[key];
        if (SENSITIVE_KEYS.has(String(key).toLowerCase())) {
            // Masquer valeur sensible
            obj[key] = '***';
        } else if (typeof value === 'object' && value !== null) {
            sanitizeObjectDeep(value, seen);
        } else if (typeof value === 'string') {
            obj[key] = sanitizeMessageString(value);
        }
    }
    return obj;
}

const sanitizeFormat = winston.format((info) => {
    // Sanitize message string
    if (typeof info.message === 'string') {
        info.message = sanitizeMessageString(info.message);
    }
    // IMPORTANT: Mutate info in place to preserve Winston symbol properties
    sanitizeObjectDeep(info);
    return info;
});

const logger = winston.createLogger({
    level: loggerConfig.level,
    format: winston.format.combine(
        sanitizeFormat(),
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'onvif2mqtt' },
    transports: [
        new winston.transports.File({
            filename: loggerConfig.errorFile,
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        new winston.transports.File({
            filename: loggerConfig.logFile,
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        // Console transport TOUJOURS actif pour les logs Docker
        new winston.transports.Console({
            format: winston.format.combine(
                sanitizeFormat(),
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// En mode développement, garder la configuration existante
if (loggerConfig.isDevelopment) {
    logger.info('Mode développement détecté - logs colorisés activés');
}

/**
 * Configure le logger avec les paramètres du ConfigManager
 * @param {ConfigManager} config - Instance du ConfigManager
 */
logger.configure = function(config) {
    if (config) {
        loggerConfig.level = config.get('logging.level', 'info');
        const logFile = config.get('logging.file', 'logs/app.log');
        
        // Mettre à jour le niveau de log
        this.level = loggerConfig.level;
        
        logger.info(`Logger configuré avec le niveau: ${loggerConfig.level}`);
    }
};

module.exports = logger;
