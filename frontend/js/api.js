/**
 * API 调用封装模块
 * 封装所有与后端 API 的交互
 */

import { getApiBase } from './utils.js';
import { showToast, setButtonLoading } from './utils.js';
import { error as logError, info as logInfo, warn as logWarn, debug as logDebug, performanceLog } from './logger.js';
import { validateNonEmpty, validateURL, validateWorkflow, validateJobId, sanitizeString, sanitizeNumber } from './validation.js';

// API Base URL
const apiBase = getApiBase();

// API 请求配置
const API_CONFIG = {
  timeout: 30000, // 30秒超时
  retryMaxAttempts: 3, // 最大重试次数
  retryDelay: 1000, // 重试延迟（毫秒）
  retryableStatuses: [408, 429, 500, 502, 503, 504] // 可重试的 HTTP 状态码
};

/**
 * 延迟函数
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 判断错误是否可重试
 */
function isRetryableError(error, status) {
  // 网络错误通常可重试
  if (error && error.message) {
    if (
      error.message.includes("Failed to fetch") ||
      error.message.includes("NetworkError") ||
      error.message.includes("timeout") ||
      error.name === "AbortError"
    ) {
      return true;
    }
  }
  
  // 某些 HTTP 状态码可重试
  if (status && API_CONFIG.retryableStatuses.includes(status)) {
    return true;
  }
  
  return false;
}

/**
 * 带重试的 fetch 请求
 */
async function fetchWithRetry(url, options = {}, retryCount = 0) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    // 如果响应不成功且可重试
    if (!response.ok && retryCount < API_CONFIG.retryMaxAttempts) {
      if (isRetryableError(null, response.status)) {
        logWarn(`API 请求失败，将重试 (${retryCount + 1}/${API_CONFIG.retryMaxAttempts})`, {
          url,
          status: response.status,
          attempt: retryCount + 1
        });
        
        await delay(API_CONFIG.retryDelay * (retryCount + 1)); // 指数退避
        return fetchWithRetry(url, options, retryCount + 1);
      }
    } else if (!response.ok) {
      // 如果不可重试，直接返回响应
      return response;
    }
    
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    // 如果是可重试的错误
    if (retryCount < API_CONFIG.retryMaxAttempts && isRetryableError(error)) {
      logWarn(`API 请求失败，将重试 (${retryCount + 1}/${API_CONFIG.retryMaxAttempts})`, {
        url,
        error: error.message,
        attempt: retryCount + 1
      });
      
      await delay(API_CONFIG.retryDelay * (retryCount + 1)); // 指数退避
      return fetchWithRetry(url, options, retryCount + 1);
    }
    
    throw error;
  }
}

/**
 * 统一的 API 请求处理
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${apiBase}${endpoint}`;
  const method = options.method || 'GET';
  
  logDebug(`API 请求: ${method} ${endpoint}`, { options });
  
  try {
    const response = await performanceLog(`API ${method} ${endpoint}`, async () => {
      return await fetchWithRetry(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });
    });
    
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      let errorDetail = null;
      
      try {
        const errorText = await response.text();
        if (errorText) {
          try {
            errorDetail = JSON.parse(errorText);
            errorMessage = errorDetail.detail || errorDetail.message || errorMessage;
          } catch {
            errorMessage = errorText || errorMessage;
          }
        }
      } catch (e) {
        logWarn("解析错误响应失败", { error: e });
      }
      
      const error = new Error(errorMessage);
      error.status = response.status;
      error.detail = errorDetail;
      throw error;
    }
    
    // 如果响应是空的，返回 null
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      logWarn(`非 JSON 响应: ${contentType}`, { endpoint });
      return null;
    }
    
    const data = await response.json();
    logDebug(`API 响应: ${method} ${endpoint}`, { data });
    
    return data;
  } catch (error) {
    logError(`API 请求失败: ${method} ${endpoint}`, error, { url, options });
    throw error;
  }
}

// 缓存 DOM 元素引用
let cfgEls = null;

export function initApi(cfgElements) {
  cfgEls = cfgElements;
}

// ========== 配置管理 API ==========
export async function loadConfig() {
  try {
    const data = await apiRequest('/api/config');
    
    // 填充配置元素（添加安全检查，避免访问未定义的元素）
    if (cfgEls && data) {
      // 安全地设置值，只有当元素存在时才设置
      const setValue = (el, value) => {
        if (el) el.value = value;
      };
      
      setValue(cfgEls.qwenKey, sanitizeString(data.qwen_api_key));
      setValue(cfgEls.qwenBase, sanitizeString(data.qwen_base_url));
      setValue(cfgEls.qwenModel, sanitizeString(data.qwen_model));
      setValue(cfgEls.rhKey, sanitizeString(data.runninghub_api_key));
      setValue(cfgEls.rhBase, sanitizeString(data.runninghub_base_url));
      setValue(cfgEls.t8Key, sanitizeString(data.gemini_t8star_api_key));
      setValue(cfgEls.t8Base, sanitizeString(data.gemini_t8star_base_url));
      setValue(cfgEls.t8Model, sanitizeString(data.gemini_t8star_model));
      setValue(cfgEls.comKey, sanitizeString(data.gemini_comfly_api_key));
      setValue(cfgEls.comBase, sanitizeString(data.gemini_comfly_base_url));
      setValue(cfgEls.comModel, sanitizeString(data.gemini_comfly_model));
      setValue(cfgEls.cherryinGeminiKey, sanitizeString(data.gemini_cherryin_api_key));
      setValue(cfgEls.cherryinGeminiBase, sanitizeString(data.gemini_cherryin_base_url));
      setValue(cfgEls.cherryinGeminiModel, sanitizeString(data.gemini_cherryin_model));
      setValue(cfgEls.aihubmixGeminiKey, sanitizeString(data.gemini_aihubmix_api_key || ""));
      setValue(cfgEls.aihubmixGeminiBase, sanitizeString(data.gemini_aihubmix_base_url || ""));
      setValue(cfgEls.aihubmixGeminiModel, sanitizeString(data.gemini_aihubmix_model || ""));
      setValue(cfgEls.grsaiGeminiKey, sanitizeString(data.gemini_grsai_api_key || ""));
      setValue(cfgEls.grsaiGeminiBase, sanitizeString(data.gemini_grsai_base_url || ""));
      setValue(cfgEls.grsaiGeminiModel, sanitizeString(data.gemini_grsai_model || ""));
      
      // 同时更新 Settings 视图中的字段
      const cherryinGeminiKeySettings = document.getElementById('cfg-gemini-cherryin-key-settings');
      const cherryinGeminiBaseSettings = document.getElementById('cfg-gemini-cherryin-base-settings');
      const cherryinGeminiModelSettings = document.getElementById('cfg-gemini-cherryin-model-settings');
      if (cherryinGeminiKeySettings) {
        cherryinGeminiKeySettings.value = sanitizeString(data.gemini_cherryin_api_key);
      }
      if (cherryinGeminiBaseSettings) {
        cherryinGeminiBaseSettings.value = sanitizeString(data.gemini_cherryin_base_url);
      }
      if (cherryinGeminiModelSettings) {
        cherryinGeminiModelSettings.value = sanitizeString(data.gemini_cherryin_model);
      }
      
      const aihubmixGeminiKeySettings = document.getElementById('cfg-gemini-aihubmix-key-settings');
      const aihubmixGeminiBaseSettings = document.getElementById('cfg-gemini-aihubmix-base-settings');
      const aihubmixGeminiModelSettings = document.getElementById('cfg-gemini-aihubmix-model-settings');
      if (aihubmixGeminiKeySettings) {
        aihubmixGeminiKeySettings.value = sanitizeString(data.gemini_aihubmix_api_key || "");
      }
      if (aihubmixGeminiBaseSettings) {
        aihubmixGeminiBaseSettings.value = sanitizeString(data.gemini_aihubmix_base_url || "");
      }
      if (aihubmixGeminiModelSettings) {
        aihubmixGeminiModelSettings.value = sanitizeString(data.gemini_aihubmix_model || "");
      }
      
      const grsaiGeminiKeySettings = document.getElementById('cfg-gemini-grsai-key-settings');
      const grsaiGeminiBaseSettings = document.getElementById('cfg-gemini-grsai-base-settings');
      const grsaiGeminiModelSettings = document.getElementById('cfg-gemini-grsai-model-settings');
      if (grsaiGeminiKeySettings) {
        grsaiGeminiKeySettings.value = sanitizeString(data.gemini_grsai_api_key || "");
      }
      if (grsaiGeminiBaseSettings) {
        grsaiGeminiBaseSettings.value = sanitizeString(data.gemini_grsai_base_url || "");
      }
      if (grsaiGeminiModelSettings) {
        grsaiGeminiModelSettings.value = sanitizeString(data.gemini_grsai_model || "");
      }
      setValue(cfgEls.klingAccessKey, sanitizeString(data.kling_access_key));
      setValue(cfgEls.klingSecretKey, sanitizeString(data.kling_secret_key));
      setValue(cfgEls.klingKey, sanitizeString(data.kling_api_key));
      // 确保 kling_base_url 是基础 URL，不包含路径
      let klingBaseUrl = sanitizeString(data.kling_base_url);
      // 如果包含 /v1/videos/image2video 等路径，自动移除
      if (klingBaseUrl && klingBaseUrl.includes('/v1/videos/image2video')) {
        klingBaseUrl = klingBaseUrl.replace('/v1/videos/image2video', '').replace(/\/+$/, '');
      }
      setValue(cfgEls.klingBase, klingBaseUrl);
      setValue(cfgEls.klingModel, sanitizeString(data.kling_default_model));
      
      // 同时更新 Settings 视图中的字段
      const klingBaseSettings = document.getElementById('cfg-kling-base-settings');
      if (klingBaseSettings) {
        klingBaseSettings.value = klingBaseUrl;
      }
      setValue(cfgEls.ohmygptKey, sanitizeString(data.ohmygpt_api_key));
      setValue(cfgEls.ohmygptBase, sanitizeString(data.ohmygpt_base_url));
      setValue(cfgEls.ohmygptModel, sanitizeString(data.ohmygpt_model));
      setValue(cfgEls.modelscopeKey, sanitizeString(data.modelscope_api_key));
      setValue(cfgEls.modelscopeBase, sanitizeString(data.modelscope_base_url));
      setValue(cfgEls.modelscopeModel, sanitizeString(data.modelscope_model));
      setValue(cfgEls.siliconflowKey, sanitizeString(data.siliconflow_api_key));
      setValue(cfgEls.siliconflowBase, sanitizeString(data.siliconflow_base_url));
      setValue(cfgEls.siliconflowModel, sanitizeString(data.siliconflow_model));
      setValue(cfgEls.cherryinKey, sanitizeString(data.cherryin_api_key));
      setValue(cfgEls.cherryinBase, sanitizeString(data.cherryin_base_url));
      setValue(cfgEls.cherryinModel, sanitizeString(data.cherryin_model));
      setValue(cfgEls.publicBaseUrl, sanitizeString(data.public_base_url));
      setValue(cfgEls.maxWorkers, sanitizeNumber(data.max_workers, 4, 1, 16));
    }
    
    return data;
  } catch (e) {
    const errorMsg = e.message || String(e);
    if (errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError") || errorMsg.includes("timeout")) {
      showToast("无法连接到后端服务器，请检查服务是否已启动", "error", 5000);
    } else {
      showToast(`读取配置失败：${errorMsg}`, "error", 5000);
    }
    throw e;
  }
}

export async function saveConfig(cfgElements, syncConfigInputs, updateApiStatus) {
  if (!cfgEls && cfgElements) {
    cfgEls = cfgElements;
  }
  
  if (!cfgEls) {
    throw new Error("配置元素未初始化");
  }
  
  const saveBtn = document.getElementById('btn-save-config') || document.getElementById('btn-save-config-settings');
  setButtonLoading(saveBtn, true);
  
  const body = {
    qwen_api_key: cfgEls.qwenKey.value,
    qwen_base_url: cfgEls.qwenBase.value,
    qwen_model: cfgEls.qwenModel.value,
    runninghub_api_key: cfgEls.rhKey.value,
    runninghub_base_url: cfgEls.rhBase.value,
    gemini_t8star_api_key: cfgEls.t8Key.value,
    gemini_t8star_base_url: cfgEls.t8Base.value,
    gemini_t8star_model: cfgEls.t8Model ? cfgEls.t8Model.value : "",
    gemini_comfly_api_key: cfgEls.comKey.value,
    gemini_comfly_base_url: cfgEls.comBase.value,
    gemini_comfly_model: cfgEls.comModel ? cfgEls.comModel.value : "",
    gemini_cherryin_api_key: cfgEls.cherryinGeminiKey ? cfgEls.cherryinGeminiKey.value : "",
    gemini_cherryin_base_url: cfgEls.cherryinGeminiBase ? cfgEls.cherryinGeminiBase.value : "",
    gemini_cherryin_model: cfgEls.cherryinGeminiModel ? cfgEls.cherryinGeminiModel.value : "",
    gemini_aihubmix_api_key: cfgEls.aihubmixGeminiKey ? cfgEls.aihubmixGeminiKey.value : "",
    gemini_aihubmix_base_url: cfgEls.aihubmixGeminiBase ? cfgEls.aihubmixGeminiBase.value : "",
    gemini_aihubmix_model: cfgEls.aihubmixGeminiModel ? cfgEls.aihubmixGeminiModel.value : "",
    kling_access_key: cfgEls.klingAccessKey.value,
    kling_secret_key: cfgEls.klingSecretKey.value,
    kling_api_key: cfgEls.klingKey.value,
    kling_base_url: cfgEls.klingBase.value,
    kling_default_model: cfgEls.klingModel.value,
    ohmygpt_api_key: cfgEls.ohmygptKey.value,
    ohmygpt_base_url: cfgEls.ohmygptBase.value,
    ohmygpt_model: cfgEls.ohmygptModel ? cfgEls.ohmygptModel.value : "",
    modelscope_api_key: cfgEls.modelscopeKey.value,
    modelscope_base_url: cfgEls.modelscopeBase.value,
    modelscope_model: cfgEls.modelscopeModel.value,
    siliconflow_api_key: cfgEls.siliconflowKey.value,
    siliconflow_base_url: cfgEls.siliconflowBase.value,
    siliconflow_model: cfgEls.siliconflowModel.value,
    cherryin_api_key: cfgEls.cherryinKey.value,
    cherryin_base_url: cfgEls.cherryinBase.value,
    cherryin_model: cfgEls.cherryinModel.value,
    public_base_url: cfgEls.publicBaseUrl ? cfgEls.publicBaseUrl.value : "",
    max_workers: Number(cfgEls.maxWorkers.value || 4)
  };
  
  try {
    // 验证配置数据
    if (cfgEls.qwenBase.value) {
      validateURL(cfgEls.qwenBase.value, "Qwen Base URL");
    }
    if (cfgEls.rhBase.value) {
      validateURL(cfgEls.rhBase.value, "RunningHub Base URL");
    }
    if (cfgEls.t8Base.value) {
      validateURL(cfgEls.t8Base.value, "Gemini T8Star Base URL");
    }
    if (cfgEls.comBase.value) {
      validateURL(cfgEls.comBase.value, "Gemini Comfly Base URL");
    }
    if (cfgEls.cherryinGeminiBase && cfgEls.cherryinGeminiBase.value) {
      validateURL(cfgEls.cherryinGeminiBase.value, "Gemini Cherryin Base URL");
    }
    if (cfgEls.aihubmixGeminiBase && cfgEls.aihubmixGeminiBase.value) {
      validateURL(cfgEls.aihubmixGeminiBase.value, "Gemini AIHubMix Base URL");
    }
    if (cfgEls.grsaiGeminiBase && cfgEls.grsaiGeminiBase.value) {
      validateURL(cfgEls.grsaiGeminiBase.value, "Gemini Grsai Base URL");
    }
    if (cfgEls.klingBase.value) {
      validateURL(cfgEls.klingBase.value, "Kling Base URL");
    }
    if (cfgEls.ohmygptBase.value) {
      validateURL(cfgEls.ohmygptBase.value, "OhMyGPT Base URL");
    }
    if (cfgEls.modelscopeBase.value) {
      validateURL(cfgEls.modelscopeBase.value, "ModelScope Base URL");
    }
    if (cfgEls.siliconflowBase.value) {
      validateURL(cfgEls.siliconflowBase.value, "SiliconFlow Base URL");
    }
    if (cfgEls.cherryinBase.value) {
      validateURL(cfgEls.cherryinBase.value, "CherryIn Base URL");
    }
    
    const data = await apiRequest('/api/config', {
      method: "POST",
      body: JSON.stringify(body)
    });
    
    showToast("配置已保存", "success");
    if (syncConfigInputs) syncConfigInputs(false, true);
    if (updateApiStatus) updateApiStatus();
    return data;
  } catch (e) {
    const errorMsg = e.message || String(e);
    if (errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError") || errorMsg.includes("timeout")) {
      showToast("无法连接到后端服务器，请检查服务是否已启动", "error", 5000);
    } else {
      showToast(`保存配置失败：${errorMsg}`, "error", 5000);
    }
    throw e;
  } finally {
    setButtonLoading(saveBtn, false);
  }
}

export async function fetchModels(provider, cfgElements) {
  if (!cfgEls && cfgElements) {
    cfgEls = cfgElements;
  }
  
  if (!cfgEls) {
    throw new Error("配置元素未初始化");
  }
  
  try {
    // 先临时保存当前配置
    const body = {
      qwen_api_key: cfgEls.qwenKey.value,
      qwen_base_url: cfgEls.qwenBase.value,
      qwen_model: cfgEls.qwenModel.value,
      runninghub_api_key: cfgEls.rhKey.value,
      runninghub_base_url: cfgEls.rhBase.value,
      gemini_t8star_api_key: cfgEls.t8Key.value,
      gemini_t8star_base_url: cfgEls.t8Base.value,
      gemini_t8star_model: cfgEls.t8Model ? cfgEls.t8Model.value : "",
      gemini_comfly_api_key: cfgEls.comKey.value,
      gemini_comfly_base_url: cfgEls.comBase.value,
      gemini_comfly_model: cfgEls.comModel ? cfgEls.comModel.value : "",
      gemini_cherryin_api_key: cfgEls.cherryinGeminiKey ? cfgEls.cherryinGeminiKey.value : "",
      gemini_cherryin_base_url: cfgEls.cherryinGeminiBase ? cfgEls.cherryinGeminiBase.value : "",
      gemini_cherryin_model: cfgEls.cherryinGeminiModel ? cfgEls.cherryinGeminiModel.value : "",
      gemini_aihubmix_api_key: cfgEls.aihubmixGeminiKey ? cfgEls.aihubmixGeminiKey.value : "",
      gemini_aihubmix_base_url: cfgEls.aihubmixGeminiBase ? cfgEls.aihubmixGeminiBase.value : "",
      gemini_aihubmix_model: cfgEls.aihubmixGeminiModel ? cfgEls.aihubmixGeminiModel.value : "",
      gemini_grsai_api_key: cfgEls.grsaiGeminiKey ? cfgEls.grsaiGeminiKey.value : "",
      gemini_grsai_base_url: cfgEls.grsaiGeminiBase ? cfgEls.grsaiGeminiBase.value : "",
      gemini_grsai_model: cfgEls.grsaiGeminiModel ? cfgEls.grsaiGeminiModel.value : "",
      kling_access_key: cfgEls.klingAccessKey.value,
      kling_secret_key: cfgEls.klingSecretKey.value,
      kling_api_key: cfgEls.klingKey.value,
      kling_base_url: cfgEls.klingBase.value,
      kling_default_model: cfgEls.klingModel.value,
      ohmygpt_api_key: cfgEls.ohmygptKey.value,
      ohmygpt_base_url: cfgEls.ohmygptBase.value,
      ohmygpt_model: cfgEls.ohmygptModel ? cfgEls.ohmygptModel.value : "",
      modelscope_api_key: cfgEls.modelscopeKey.value,
      modelscope_base_url: cfgEls.modelscopeBase.value,
      modelscope_model: cfgEls.modelscopeModel.value,
      siliconflow_api_key: cfgEls.siliconflowKey.value,
      siliconflow_base_url: cfgEls.siliconflowBase.value,
      siliconflow_model: cfgEls.siliconflowModel.value,
      cherryin_api_key: cfgEls.cherryinKey.value,
      cherryin_base_url: cfgEls.cherryinBase.value,
      cherryin_model: cfgEls.cherryinModel.value,
      public_base_url: cfgEls.publicBaseUrl ? cfgEls.publicBaseUrl.value : "",
      max_workers: Number(cfgEls.maxWorkers.value || 4)
    };
    
    // 临时保存配置（静默保存）
    try {
      await fetch(`${apiBase}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    } catch (saveErr) {
      console.warn("临时保存配置失败，继续尝试获取模型列表:", saveErr);
    }
    
    // 调用获取模型列表接口（使用 GET /api/models）
    // 如果指定了 provider，添加 fetch_dynamic=true 参数以从API动态获取模型列表
    const params = new URLSearchParams();
    if (provider) {
      params.append('provider', provider);
      params.append('fetch_dynamic', 'true');  // 启用动态获取
    }
    const queryString = params.toString();
    const url = `${apiBase}/api/models${queryString ? '?' + queryString : ''}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errorText || '未知错误'}`);
    }
    
    const data = await res.json();
    // 后端直接返回模型列表数组，不是 { models: [...] }
    const models = Array.isArray(data) ? data : (data.models || []);
    
    if (models.length === 0) {
      showToast("未获取到模型列表", "warning");
      return [];
    }
    
    return models;
  } catch (e) {
    console.error("获取模型列表失败:", e);
    const errorMsg = e.message || String(e);
    if (errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError")) {
      showToast("无法连接到后端服务器，请检查后端服务是否已启动", "error", 5000);
    } else if (errorMsg.includes("API key 未配置")) {
      showToast("请先配置 API 密钥", "warning", 3000);
    } else {
      showToast(`获取模型列表失败：${errorMsg}`, "error", 5000);
    }
    throw e;
  }
}

// ========== 任务管理 API ==========
export async function startJob(inputDir1, inputDir2, inputDir3, inputDir4, workflow) {
  const startBtn = document.getElementById('btn-start-job-runs') || document.getElementById('btn-start-job');
  setButtonLoading(startBtn, true);
  
  try {
    // 验证输入
    validateNonEmpty(inputDir1, "图一目录");
    validateWorkflow(workflow);
    
    const data = await apiRequest('/api/jobs', {
      method: "POST",
      body: JSON.stringify({
        input_dir_1: sanitizeString(inputDir1),
        input_dir_2: sanitizeString(inputDir2) || null,
        input_dir_3: sanitizeString(inputDir3) || null,
        input_dir_4: sanitizeString(inputDir4) || null,
        workflow: workflow
      })
    });
    
    showToast("任务已创建，开始处理", "success");
    return data;
  } catch (e) {
    const errorMsg = e.message || String(e);
    if (errorMsg.includes("图一目录不能为空")) {
      showToast("请填写图一目录（必填）", "warning");
    } else if (errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError") || errorMsg.includes("timeout")) {
      showToast("无法连接到后端服务器，请检查服务是否已启动", "error", 5000);
    } else {
      showToast(`创建任务失败：${errorMsg}`, "error", 5000);
    }
    throw e;
  } finally {
    setButtonLoading(startBtn, false);
  }
}

export async function refreshJob(jobId) {
  if (!jobId) {
    logWarn("刷新任务状态：任务 ID 为空");
    return null;
  }
  
  try {
    // 验证任务 ID 格式（如果是有效的格式）
    if (/^[0-9a-f]{8}$/i.test(jobId)) {
      validateJobId(jobId);
    }
    
    const data = await apiRequest(`/api/jobs/${jobId}`);
    return data;
  } catch (e) {
    if (e.status === 404) {
      logWarn("任务不存在或已过期", { jobId });
      return { status: "failed", message: "任务不存在或已过期" };
    }
    logError("刷新任务状态失败", e, { jobId });
    return null;
  }
}

export async function cancelJob(jobId) {
  if (!jobId) {
    alert("暂无正在运行的任务");
    return null;
  }
  
  try {
    const res = await fetch(`${apiBase}/api/jobs/${jobId}/cancel`, {
      method: "POST"
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errorText || '未知错误'}`);
    }
    const data = await res.json();
    return data;
  } catch (e) {
    console.error("取消任务失败:", e);
    const errorMsg = e.message || String(e);
    if (errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError")) {
      alert("无法连接到后端服务器，请检查后端服务是否已启动");
    } else {
      alert(`取消失败：${errorMsg}`);
    }
    throw e;
  }
}

export async function loadJobResults(jobId) {
  if (!jobId) {
    logWarn("加载任务结果：任务 ID 为空");
    return null;
  }
  
  try {
    // 验证任务 ID 格式（如果是有效的格式）
    if (/^[0-9a-f]{8}$/i.test(jobId)) {
      validateJobId(jobId);
    }
    
    const data = await apiRequest(`/api/jobs/${jobId}/items`);
    return data || { items: [] };
  } catch (e) {
    logError("加载任务结果失败", e, { jobId });
    throw e;
  }
}

export async function listJobs() {
  try {
    const data = await apiRequest('/api/jobs');
    return data || [];
  } catch (e) {
    logError("列出任务失败", e);
    throw e;
  }
}

// ========== 壁纸上传 API ==========
export async function uploadWallpaper(file) {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const res = await fetch(`${apiBase}/api/wallpaper/upload`, {
      method: 'POST',
      body: formData
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: '上传失败' }));
      throw new Error(errorData.detail || '上传失败');
    }
    
    const data = await res.json();
    if (data.success && data.url) {
      return `${apiBase}${data.url}`;
    } else {
      throw new Error(data.detail || '上传失败');
    }
  } catch (error) {
    console.error('壁纸上传错误:', error);
    throw error;
  }
}

// ========== 模型管理 API ==========
export async function listModels(provider = null, tag = null) {
  try {
    const params = new URLSearchParams();
    if (provider) params.append('provider', provider);
    if (tag) params.append('tag', tag);
    
    const endpoint = params.toString() ? `/api/models?${params.toString()}` : '/api/models';
    const data = await apiRequest(endpoint);
    return data || [];
  } catch (e) {
    logError("获取模型列表失败", e);
    throw e;
  }
}

// ========== 工作流模板管理 API ==========
export async function listWorkflowTemplates() {
  try {
    const data = await apiRequest('/api/workflows');
    return Array.isArray(data) ? data : [];
  } catch (e) {
    logError("获取工作流模板列表失败", e);
    throw e;
  }
}

export async function getWorkflowTemplate(workflowId) {
  try {
    const data = await apiRequest(`/api/workflows/${workflowId}`);
    return data;
  } catch (e) {
    logError("获取工作流模板失败", e, { workflowId });
    throw e;
  }
}

export async function saveWorkflowTemplate(workflow, name, description = null, tags = null) {
  try {
    if (!name || !name.trim()) {
      throw new Error("工作流名称不能为空");
    }
    
    const data = await apiRequest('/api/workflows', {
      method: 'POST',
      body: JSON.stringify({
        workflow: workflow,
        name: name.trim(),
        description: description ? description.trim() : null,
        tags: tags && Array.isArray(tags) ? tags.filter(t => t && t.trim()) : null
      })
    });
    
    showToast("工作流模板已保存", "success");
    return data;
  } catch (e) {
    const errorMsg = e.message || String(e);
    if (errorMsg.includes("工作流名称不能为空")) {
      showToast("请填写工作流名称", "warning");
    } else if (errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError")) {
      showToast("无法连接到后端服务器，请检查服务是否已启动", "error", 5000);
    } else {
      showToast(`保存工作流模板失败：${errorMsg}`, "error", 5000);
    }
    throw e;
  }
}

export async function deleteWorkflowTemplate(workflowId) {
  try {
    const data = await apiRequest(`/api/workflows/${workflowId}`, {
      method: 'DELETE'
    });
    showToast("工作流模板已删除", "success");
    return data;
  } catch (e) {
    const errorMsg = e.message || String(e);
    if (errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError")) {
      showToast("无法连接到后端服务器，请检查服务是否已启动", "error", 5000);
    } else {
      showToast(`删除工作流模板失败：${errorMsg}`, "error", 5000);
    }
    throw e;
  }
}

// 导出为统一的 API 对象
export const API = {
  // 配置
  loadConfig,
  saveConfig,
  fetchModels,
  
  // 任务
  startJob,
  refreshJob,
  cancelJob,
  loadJobResults,
  listJobs,
  
  // 模型
  listModels,
  
  // 壁纸
  uploadWallpaper,
  
  // 工作流模板
  listWorkflowTemplates,
  getWorkflowTemplate,
  saveWorkflowTemplate,
  deleteWorkflowTemplate
};

// 导出 apiBase 供其他模块使用
export { apiBase };

