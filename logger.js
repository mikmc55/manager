const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// Create a logger instance
const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: logFormat,
    transports: [
        // Console transport for Vercel environment
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple(),
                winston.format.printf(({ level, message, timestamp, stack }) => {
                    if (stack) {
                        return `${timestamp} ${level}: ${message}\n${stack}`;
                    }
                    return `${timestamp} ${level}: ${message}`;
                })
            )
        }),
        // Optional: Write to temporary files during local development (not on Vercel)
        ...(process.env.NODE_ENV !== 'production' ? [
            new DailyRotateFile({
                filename: path.join('/tmp', 'stremio-addon-manager-%DATE%.log'), // Use /tmp for local
                datePattern: 'YYYY-MM-DD',
                maxSize: '20m',
                maxFiles: '14d',
                createSymlink: true,
                symlinkName: 'current.log'
            })
        ] : [])
    ]
});

// Create a stream object with a write function for Morgan
logger.stream = {
    write: function(message) {
        logger.info(message.trim());
    }
};

module.exports = logger;
