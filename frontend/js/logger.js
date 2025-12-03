/**
 * 日志记录模块
 * 提供结构化的日志记录功能
 */

// 日志级别
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

// 当前日志级别（可在生产环境设置为更高的级别）
let currentLogLevel = LogLevel.INFO;

// 是否在控制台输出
let enableConsole = true;

// 是否存储日志历史
let enableHistory = true;
const maxHistorySize = 100;
let logHistory = [];

/**
 * 设置日志级别
 */
export function setLogLevel(level) {
  currentLogLevel = level;
}

/**
 * 启用/禁用控制台输出
 */
export function setConsoleEnabled(enabled) {
  enableConsole = enabled;
}

/**
 * 启用/禁用日志历史
 */
export function setHistoryEnabled(enabled) {
  enableHistory = enabled;
}

/**
 * 获取日志历史
 */
export function getLogHistory(maxSize = maxHistorySize) {
  return logHistory.slice(-maxSize);
}

/**
 * 清空日志历史
 */
export function clearLogHistory() {
  logHistory = [];
}

/**
 * 格式化日志消息
 */
function formatLogMessage(level, message, context = {}) {
  const timestamp = new Date().toISOString();
  const levelNames = ["DEBUG", "INFO", "WARN", "ERROR", "NONE"];
  const levelName = levelNames[level] || "UNKNOWN";
  
  const logEntry = {
    timestamp,
    level: levelName,
    message,
    context: context || {}
  };
  
  // 存储到历史
  if (enableHistory) {
    logHistory.push(logEntry);
    if (logHistory.length > maxHistorySize) {
      logHistory.shift();
    }
  }
  
  return logEntry;
}

/**
 * 输出日志到控制台
 */
function outputToConsole(entry) {
  if (!enableConsole) return;
  
  const { timestamp, level, message, context } = entry;
  const timeStr = new Date(timestamp).toLocaleTimeString("zh-CN");
  const prefix = `[${timeStr}] [${level}]`;
  
  const logArgs = [prefix, message];
  if (Object.keys(context).length > 0) {
    logArgs.push(context);
  }
  
  switch (level) {
    case "DEBUG":
      console.debug(...logArgs);
      break;
    case "INFO":
      console.info(...logArgs);
      break;
    case "WARN":
      console.warn(...logArgs);
      break;
    case "ERROR":
      console.error(...logArgs);
      break;
    default:
      console.log(...logArgs);
  }
}

/**
 * Debug 日志
 */
export function debug(message, context = {}) {
  if (currentLogLevel <= LogLevel.DEBUG) {
    const entry = formatLogMessage(LogLevel.DEBUG, message, context);
    outputToConsole(entry);
  }
}

/**
 * Info 日志
 */
export function info(message, context = {}) {
  if (currentLogLevel <= LogLevel.INFO) {
    const entry = formatLogMessage(LogLevel.INFO, message, context);
    outputToConsole(entry);
  }
}

/**
 * Warn 日志
 */
export function warn(message, context = {}) {
  if (currentLogLevel <= LogLevel.WARN) {
    const entry = formatLogMessage(LogLevel.WARN, message, context);
    outputToConsole(entry);
  }
}

/**
 * Error 日志
 */
export function error(message, error = null, context = {}) {
  if (currentLogLevel <= LogLevel.ERROR) {
    const errorContext = {
      ...context,
      error: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : null
    };
    const entry = formatLogMessage(LogLevel.ERROR, message, errorContext);
    outputToConsole(entry);
  }
}

/**
 * 日志组（用于分组相关日志）
 */
export function logGroup(groupName, callback) {
  const startTime = Date.now();
  debug(`开始: ${groupName}`);
  
  try {
    const result = callback();
    const duration = Date.now() - startTime;
    
    if (result instanceof Promise) {
      return result
        .then(res => {
          debug(`完成: ${groupName} (${duration}ms)`);
          return res;
        })
        .catch(err => {
          error(`失败: ${groupName} (${duration}ms)`, err);
          throw err;
        });
    } else {
      debug(`完成: ${groupName} (${duration}ms)`);
      return result;
    }
  } catch (err) {
    const duration = Date.now() - startTime;
    error(`失败: ${groupName} (${duration}ms)`, err);
    throw err;
  }
}

/**
 * 性能日志（用于记录操作耗时）
 */
export function performanceLog(operationName, callback) {
  const startTime = performance.now();
  
  try {
    const result = callback();
    
    if (result instanceof Promise) {
      return result
        .then(res => {
          const duration = performance.now() - startTime;
          info(`性能: ${operationName}`, { duration: `${duration.toFixed(2)}ms` });
          return res;
        })
        .catch(err => {
          const duration = performance.now() - startTime;
          error(`性能: ${operationName} 失败`, err, { duration: `${duration.toFixed(2)}ms` });
          throw err;
        });
    } else {
      const duration = performance.now() - startTime;
      info(`性能: ${operationName}`, { duration: `${duration.toFixed(2)}ms` });
      return result;
    }
  } catch (err) {
    const duration = performance.now() - startTime;
    error(`性能: ${operationName} 失败`, err, { duration: `${duration.toFixed(2)}ms` });
    throw err;
  }
}

/**
 * 导出默认日志工具对象
 */
export default {
  LogLevel,
  setLogLevel,
  setConsoleEnabled,
  setHistoryEnabled,
  getLogHistory,
  clearLogHistory,
  debug,
  info,
  warn,
  error,
  logGroup,
  performanceLog
};

