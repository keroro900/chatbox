// frontend/js/model-picker.js
/**
 * 模型选择器组件
 * 
 * 提供类似 ohmy 的模型选择 UI，支持：
 * - 按标签过滤（全部/推荐/视觉/对话/图片/视频等）
 * - 搜索模型
 * - 按 family 分组展示
 * - 选择模型并返回
 */

import { API } from './api.js';
import loggerModule from './logger.js';

// 创建一个简单的 logger 对象
const logger = {
  debug: (msg, ...args) => loggerModule.debug(`[ModelPicker] ${msg}`, ...args),
  info: (msg, ...args) => loggerModule.info(`[ModelPicker] ${msg}`, ...args),
  warn: (msg, ...args) => loggerModule.warn(`[ModelPicker] ${msg}`, ...args),
  error: (msg, ...args) => loggerModule.error(`[ModelPicker] ${msg}`, ...args)
};

// 缓存模型列表
let cachedModels = null;
let cachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

/**
 * 获取模型列表（带缓存）
 */
async function fetchModels(force = false) {
    const now = Date.now();
    if (!force && cachedModels && now - cachedAt < CACHE_TTL) {
        return cachedModels;
    }
    
    try {
        const models = await API.listModels();
        cachedModels = models;
        cachedAt = now;
        return models;
    } catch (error) {
        logger.error('获取模型列表失败:', error);
        throw error;
    }
}

/**
 * 按 family 分组模型
 */
function groupModelsByFamily(models) {
    const groups = {};
    for (const model of models) {
        if (!groups[model.family]) {
            groups[model.family] = [];
        }
        groups[model.family].push(model);
    }
    return groups;
}

/**
 * 过滤模型
 */
function filterModels(models, options = {}) {
    const { tag, search } = options;
    
    let filtered = models;
    
    // 按标签过滤
    if (tag && tag !== 'all') {
        filtered = filtered.filter(m => m.tags.includes(tag));
    }
    
    // 按搜索词过滤
    if (search) {
        const searchLower = search.toLowerCase();
        filtered = filtered.filter(m => 
            m.model_id.toLowerCase().includes(searchLower) ||
            m.display_name.toLowerCase().includes(searchLower) ||
            m.description.toLowerCase().includes(searchLower)
        );
    }
    
    return filtered;
}

/**
 * 创建模型选择器 HTML
 */
function createPickerHTML() {
    return `
        <div id="model-picker-overlay" class="model-picker-overlay">
            <div class="model-picker-modal">
                <div class="model-picker-header">
                    <h3>选择模型</h3>
                    <button class="model-picker-close" title="关闭">&times;</button>
                </div>
                
                <div class="model-picker-toolbar">
                    <input 
                        type="text" 
                        id="model-search" 
                        class="model-search-input" 
                        placeholder="搜索模型 ID 或名称..."
                    />
                    <button id="model-refresh-btn" class="btn-secondary" title="刷新模型列表">
                        <span>🔄</span> 刷新
                    </button>
                </div>
                
                <div class="model-tags">
                    <button class="model-tag active" data-tag="all">全部</button>
                    <button class="model-tag" data-tag="recommended">推荐</button>
                    <button class="model-tag" data-tag="vision">视觉</button>
                    <button class="model-tag" data-tag="chat">对话</button>
                    <button class="model-tag" data-tag="image">图片</button>
                    <button class="model-tag" data-tag="video">视频</button>
                    <button class="model-tag" data-tag="free">免费</button>
                    <button class="model-tag" data-tag="online">联网</button>
                </div>
                
                <div id="model-list" class="model-list">
                    <div class="loading">加载中...</div>
                </div>
            </div>
        </div>
    `;
}

/**
 * 渲染模型列表
 */
function renderModelList(models) {
    const listEl = document.getElementById('model-list');
    
    if (models.length === 0) {
        listEl.innerHTML = '<div class="no-models">没有找到匹配的模型</div>';
        return;
    }
    
    const groups = groupModelsByFamily(models);
    const familyNames = Object.keys(groups).sort();
    
    let html = '';
    for (const family of familyNames) {
        const familyModels = groups[family];
        
        html += `
            <div class="model-family">
                <div class="model-family-header" data-family="${family}">
                    <span class="model-family-name">${family}</span>
                    <span class="model-family-count">${familyModels.length} 个模型</span>
                    <span class="model-family-toggle">▼</span>
                </div>
                <div class="model-family-content" data-family="${family}">
        `;
        
        for (const model of familyModels) {
            const tags = model.tags.map(t => `<span class="model-item-tag">${t}</span>`).join('');
            html += `
                <div class="model-item" data-model='${JSON.stringify(model)}'>
                    <div class="model-item-info">
                        <div class="model-item-name">${model.display_name}</div>
                        <div class="model-item-id">${model.model_id}</div>
                        <div class="model-item-desc">${model.description}</div>
                        <div class="model-item-tags">${tags}</div>
                    </div>
                    <button class="model-item-select" title="选择此模型">+</button>
                </div>
            `;
        }
        
        html += `
                </div>
            </div>
        `;
    }
    
    listEl.innerHTML = html;
    
    // 绑定折叠事件
    listEl.querySelectorAll('.model-family-header').forEach(header => {
        header.addEventListener('click', () => {
            const family = header.dataset.family;
            const content = listEl.querySelector(`.model-family-content[data-family="${family}"]`);
            const toggle = header.querySelector('.model-family-toggle');
            
            if (content.style.display === 'none') {
                content.style.display = 'block';
                toggle.textContent = '▼';
            } else {
                content.style.display = 'none';
                toggle.textContent = '▶';
            }
        });
    });
}

/**
 * 打开模型选择器
 */
export async function openModelPicker(options = {}) {
    return new Promise(async (resolve, reject) => {
        try {
            // 创建 UI
            const existingPicker = document.getElementById('model-picker-overlay');
            if (existingPicker) {
                existingPicker.remove();
            }
            
            document.body.insertAdjacentHTML('beforeend', createPickerHTML());
            const overlay = document.getElementById('model-picker-overlay');
            
            // 加载模型列表
            let allModels = await fetchModels();
            
            // 如果指定了 provider，先过滤
            if (options.provider) {
                allModels = allModels.filter(m => m.provider === options.provider);
            }
            
            let currentTag = 'all';
            let currentSearch = '';
            
            // 渲染模型列表
            const updateList = () => {
                const filtered = filterModels(allModels, { tag: currentTag, search: currentSearch });
                renderModelList(filtered);
            };
            updateList();
            
            // 绑定事件
            
            // 关闭
            const close = () => {
                overlay.remove();
                resolve(null);
            };
            overlay.querySelector('.model-picker-close').addEventListener('click', close);
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close();
            });
            
            // 标签切换
            overlay.querySelectorAll('.model-tag').forEach(btn => {
                btn.addEventListener('click', () => {
                    overlay.querySelectorAll('.model-tag').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentTag = btn.dataset.tag;
                    updateList();
                });
            });
            
            // 搜索
            const searchInput = overlay.querySelector('#model-search');
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    currentSearch = e.target.value.trim();
                    updateList();
                }, 300);
            });
            
            // 刷新
            overlay.querySelector('#model-refresh-btn').addEventListener('click', async () => {
                try {
                    allModels = await fetchModels(true);
                    if (options.provider) {
                        allModels = allModels.filter(m => m.provider === options.provider);
                    }
                    updateList();
                    logger.info('模型列表已刷新');
                } catch (error) {
                    logger.error('刷新模型列表失败:', error);
                    alert('刷新失败：' + error.message);
                }
            });
            
            // 选择模型
            overlay.addEventListener('click', (e) => {
                const selectBtn = e.target.closest('.model-item-select');
                if (selectBtn) {
                    const item = selectBtn.closest('.model-item');
                    const model = JSON.parse(item.dataset.model);
                    overlay.remove();
                    resolve({
                        provider: model.provider,
                        model_id: model.model_id,
                        display_name: model.display_name,
                        family: model.family
                    });
                }
            });
            
        } catch (error) {
            logger.error('打开模型选择器失败:', error);
            reject(error);
        }
    });
}

// 清除缓存
export function clearModelCache() {
    cachedModels = null;
    cachedAt = 0;
}

