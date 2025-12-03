/**
 * 数据验证工具模块
 * 提供各种数据验证和格式化功能
 */

/**
 * 验证非空字符串
 */
export function validateNonEmpty(value, fieldName = "字段") {
  if (value === null || value === undefined || value === "") {
    throw new Error(`${fieldName}不能为空`);
  }
  return true;
}

/**
 * 验证数字范围
 */
export function validateNumberRange(value, min, max, fieldName = "字段") {
  const num = Number(value);
  if (isNaN(num)) {
    throw new Error(`${fieldName}必须是数字`);
  }
  if (num < min || num > max) {
    throw new Error(`${fieldName}必须在 ${min} 到 ${max} 之间`);
  }
  return true;
}

/**
 * 验证 URL
 */
export function validateURL(url, fieldName = "URL") {
  if (!url) return true; // 允许空 URL（可选字段）
  try {
    new URL(url);
    return true;
  } catch (e) {
    throw new Error(`${fieldName}格式无效: ${url}`);
  }
}

/**
 * 验证 API Key 格式（基本格式检查）
 */
export function validateAPIKey(key, fieldName = "API Key") {
  if (!key) return true; // 允许空 key（可选字段）
  if (typeof key !== "string" || key.trim().length < 5) {
    throw new Error(`${fieldName}格式无效（至少5个字符）`);
  }
  return true;
}

/**
 * 验证目录路径
 */
export function validateDirectoryPath(path, fieldName = "目录路径") {
  if (!path) return true; // 允许空路径（可选字段）
  if (typeof path !== "string" || path.trim().length === 0) {
    throw new Error(`${fieldName}不能为空字符串`);
  }
  // 基本路径格式检查（可根据需要扩展）
  if (path.includes("..")) {
    throw new Error(`${fieldName}包含非法字符: ..`);
  }
  return true;
}

/**
 * 验证工作流步骤
 */
export function validateWorkflowStep(step, index = -1) {
  const prefix = index >= 0 ? `步骤 ${index + 1}` : "步骤";
  
  if (!step) {
    throw new Error(`${prefix}不能为空`);
  }
  
  if (!step.id || typeof step.id !== "string") {
    throw new Error(`${prefix}缺少有效的 id`);
  }
  
  if (!step.type || typeof step.type !== "string") {
    throw new Error(`${prefix}缺少有效的 type`);
  }
  
  if (!step.params || typeof step.params !== "object") {
    throw new Error(`${prefix}缺少有效的 params 对象`);
  }
  
  return true;
}

/**
 * 验证工作流
 */
export function validateWorkflow(workflow) {
  if (!workflow) {
    throw new Error("工作流不能为空");
  }
  
  if (!workflow.steps || !Array.isArray(workflow.steps)) {
    throw new Error("工作流必须包含 steps 数组");
  }
  
  if (workflow.steps.length === 0) {
    throw new Error("工作流至少需要包含一个步骤");
  }
  
  // 验证每个步骤
  workflow.steps.forEach((step, index) => {
    validateWorkflowStep(step, index);
  });
  
  // 验证最大并发数
  if (workflow.max_workers !== undefined) {
    validateNumberRange(workflow.max_workers, 1, 16, "最大并发数");
  }
  
  return true;
}

/**
 * 验证任务 ID
 */
export function validateJobId(jobId) {
  if (!jobId || typeof jobId !== "string") {
    throw new Error("任务 ID 无效");
  }
  if (jobId.length !== 8 || !/^[0-9a-f]{8}$/i.test(jobId)) {
    throw new Error("任务 ID 格式无效（应为8位十六进制字符串）");
  }
  return true;
}

/**
 * 清理和规范化字符串
 */
export function sanitizeString(value, defaultValue = "") {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  if (typeof value !== "string") {
    return String(value).trim() || defaultValue;
  }
  return value.trim() || defaultValue;
}

/**
 * 清理和规范化数字
 */
export function sanitizeNumber(value, defaultValue = 0, min = null, max = null) {
  if (value === null || value === undefined || value === "") {
    return defaultValue;
  }
  const num = Number(value);
  if (isNaN(num)) {
    return defaultValue;
  }
  if (min !== null && num < min) {
    return min;
  }
  if (max !== null && num > max) {
    return max;
  }
  return num;
}

/**
 * 深度复制对象（简单实现，不处理循环引用）
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item));
  }
  if (typeof obj === "object") {
    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }
  return obj;
}

/**
 * 安全获取嵌套对象属性
 */
export function safeGet(obj, path, defaultValue = undefined) {
  if (!obj || typeof obj !== "object") {
    return defaultValue;
  }
  
  const keys = path.split(".");
  let current = obj;
  
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return defaultValue;
    }
    current = current[key];
  }
  
  return current !== undefined ? current : defaultValue;
}

/**
 * 合并对象（深度合并）
 */
export function deepMerge(target, source) {
  if (!source || typeof source !== "object") {
    return target;
  }
  
  const result = deepClone(target || {});
  
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (source[key] !== null && typeof source[key] === "object" && !Array.isArray(source[key])) {
        result[key] = deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }
  
  return result;
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * 格式化时间戳
 */
export function formatTimestamp(timestamp) {
  if (!timestamp) return "-";
  const date = new Date(timestamp * 1000); // 假设是秒级时间戳
  return date.toLocaleString("zh-CN");
}

/**
 * 格式化相对时间
 */
export function formatRelativeTime(timestamp) {
  if (!timestamp) return "-";
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  
  if (diff < 60) {
    return `${diff}秒前`;
  } else if (diff < 3600) {
    return `${Math.floor(diff / 60)}分钟前`;
  } else if (diff < 86400) {
    return `${Math.floor(diff / 3600)}小时前`;
  } else if (diff < 2592000) {
    return `${Math.floor(diff / 86400)}天前`;
  } else {
    return formatTimestamp(timestamp);
  }
}

