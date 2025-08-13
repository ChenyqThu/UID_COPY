const fs = require('fs');
const path = require('path');
const config = require('./config');

class Logger {
  constructor() {
    this.logFile = path.join(config.get('logsDir'), `translation-${this.getTimestamp()}.log`);
    this.errorFile = path.join(config.get('logsDir'), `errors-${this.getTimestamp()}.log`);
    
    // Ensure log directory exists
    config.ensureDirectories();
    
    this.initLogFile();
  }

  getTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  }

  getCurrentTime() {
    return new Date().toISOString();
  }

  initLogFile() {
    const header = `=== Translation Service Log Started at ${this.getCurrentTime()} ===\n`;
    fs.writeFileSync(this.logFile, header);
  }

  log(level, message, data = null) {
    const timestamp = this.getCurrentTime();
    const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    // Console output
    if (level === 'error') {
      console.error(`\x1b[31m${logEntry}\x1b[0m`);
    } else if (level === 'warn') {
      console.warn(`\x1b[33m${logEntry}\x1b[0m`);
    } else if (level === 'success') {
      console.log(`\x1b[32m${logEntry}\x1b[0m`);
    } else if (level === 'debug' && config.isDebug()) {
      console.log(`\x1b[36m${logEntry}\x1b[0m`);
    } else if (level === 'info' || (level === 'verbose' && config.isVerbose())) {
      console.log(logEntry);
    }

    // File logging
    let fileEntry = logEntry;
    if (data) {
      fileEntry += `\nData: ${JSON.stringify(data, null, 2)}`;
    }
    fileEntry += '\n';

    fs.appendFileSync(this.logFile, fileEntry);

    // Error file logging
    if (level === 'error') {
      fs.appendFileSync(this.errorFile, fileEntry);
    }
  }

  info(message, data) {
    this.log('info', message, data);
  }

  success(message, data) {
    this.log('success', message, data);
  }

  warn(message, data) {
    this.log('warn', message, data);
  }

  error(message, error) {
    let data = null;
    if (error) {
      data = {
        message: error.message,
        stack: error.stack,
        name: error.name
      };
    }
    this.log('error', message, data);
  }

  debug(message, data) {
    this.log('debug', message, data);
  }

  verbose(message, data) {
    this.log('verbose', message, data);
  }

  // Progress logging with percentage
  progress(current, total, operation) {
    const percentage = Math.round((current / total) * 100);
    const message = `Progress: ${current}/${total} (${percentage}%) - ${operation}`;
    this.info(message);
  }

  // Translation specific logging
  translationStart(language, missingKeys) {
    this.info(`Starting translation for ${language}`, {
      language,
      missingKeysCount: missingKeys,
      timestamp: this.getCurrentTime()
    });
  }

  translationComplete(language, translatedKeys, errors = []) {
    this.success(`Translation completed for ${language}`, {
      language,
      translatedKeys,
      errors: errors.length,
      errorDetails: errors
    });
  }

  translationError(language, error, context = {}) {
    this.error(`Translation failed for ${language}`, {
      language,
      error: error.message,
      context,
      stack: error.stack
    });
  }

  // API call logging
  apiRequest(url, method, data) {
    if (config.isDebug()) {
      this.debug(`API Request: ${method} ${url}`, {
        headers: data.headers ? Object.keys(data.headers) : null,
        bodySize: data.body ? data.body.length : 0
      });
    }
  }

  apiResponse(url, statusCode, responseTime) {
    if (config.isDebug()) {
      this.debug(`API Response: ${statusCode} ${url}`, {
        responseTime: `${responseTime}ms`
      });
    }
  }

  apiError(url, error, retryCount) {
    this.error(`API Error: ${url}`, {
      error: error.message,
      retryCount,
      willRetry: retryCount < config.get('maxRetries')
    });
  }
}

module.exports = new Logger();