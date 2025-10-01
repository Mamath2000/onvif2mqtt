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

const logger = winston.createLogger({
    level: loggerConfig.level,
    format: winston.format.combine(
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
        })
    ]
});

// En mode développement, ajouter la console
if (loggerConfig.isDevelopment) {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
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
