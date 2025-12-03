/**
 * 节点输入输出定义模块
 * 定义每个节点类型的输入输出字段，用于连接验证
 */

import { apiBase } from './api.js';

/**
 * 节点字段类型
 */
export const FIELD_TYPES = {
  STRING: 'STRING',
  TEXT: 'TEXT',
  IMAGE: 'IMAGE',
  NUMBER: 'NUMBER',
  BOOLEAN: 'BOOLEAN',
  JSON: 'JSON',
  ANY: 'ANY' // 任意类型
};

/**
 * 节点输入输出定义
 * 每个节点类型定义其输入和输出字段
 */
export const NODE_DEFINITIONS = {
  qwen_prompt: {
    name: 'Qwen 提示词',
    inputs: [],
    outputs: [
      { name: 'prompt', type: FIELD_TYPES.TEXT, description: '生成的文本提示词' },
      { name: 'result', type: FIELD_TYPES.JSON, description: '完整的响应结果' }
    ]
  },
  vision_prompt: {
    name: '视觉提示词',
    inputs: [],
    outputs: [
      { name: 'prompt', type: FIELD_TYPES.TEXT, description: '生成的文本提示词' },
      { name: 'result', type: FIELD_TYPES.JSON, description: '完整的响应结果' }
    ]
  },
  runninghub_app: {
    name: 'RunningHub 应用',
    inputs: [
      // 动态输入，需要从 API 获取
      // 这里定义通用输入
      { name: 'prompt', type: FIELD_TYPES.TEXT, description: '文本提示词（可选）', optional: true },
      { name: 'image', type: FIELD_TYPES.IMAGE, description: '图片输入（可选）', optional: true }
    ],
    outputs: [
      { name: 'result', type: FIELD_TYPES.JSON, description: '应用执行结果' },
      { name: 'images', type: FIELD_TYPES.IMAGE, description: '生成的图片（数组）', multiple: true }
    ],
    // 标记为需要动态获取输入定义
    dynamicInputs: true
  },
  gemini_edit: {
    name: 'Gemini 换装',
    inputs: [
      { name: 'base_image', type: FIELD_TYPES.IMAGE, description: '基础图片' },
      { name: 'top_image', type: FIELD_TYPES.IMAGE, description: '上衣图片（可选）', optional: true },
      { name: 'bottom_image', type: FIELD_TYPES.IMAGE, description: '下装图片（可选）', optional: true },
      { name: 'prompt', type: FIELD_TYPES.TEXT, description: '提示词（可选）', optional: true }
    ],
    outputs: [
      { name: 'result', type: FIELD_TYPES.JSON, description: '编辑结果' },
      { name: 'image', type: FIELD_TYPES.IMAGE, description: '编辑后的图片' }
    ]
  },
  gemini_edit_custom: {
    name: 'Gemini 自定义编辑',
    inputs: [
      { name: 'image', type: FIELD_TYPES.IMAGE, description: '输入图片' },
      { name: 'prompt', type: FIELD_TYPES.TEXT, description: '自定义提示词' }
    ],
    outputs: [
      { name: 'result', type: FIELD_TYPES.JSON, description: '编辑结果' },
      { name: 'image', type: FIELD_TYPES.IMAGE, description: '编辑后的图片' }
    ]
  },
  gemini_generate: {
    name: 'Gemini 文生图',
    inputs: [
      { name: 'prompt', type: FIELD_TYPES.TEXT, description: '文本提示词' }
    ],
    outputs: [
      { name: 'result', type: FIELD_TYPES.JSON, description: '生成结果' },
      { name: 'image', type: FIELD_TYPES.IMAGE, description: '生成的图片' }
    ]
  },
  gemini_generate_model: {
    name: 'Gemini 生模特',
    inputs: [
      { name: 'prompt', type: FIELD_TYPES.TEXT, description: '提示词模板' }
    ],
    outputs: [
      { name: 'result', type: FIELD_TYPES.JSON, description: '生成结果' },
      { name: 'image', type: FIELD_TYPES.IMAGE, description: '生成的模特图片' }
    ]
  },
  compare_image: {
    name: '对比图生成',
    inputs: [
      { name: 'original_image', type: FIELD_TYPES.IMAGE, description: '原图' },
      { name: 'new_image', type: FIELD_TYPES.IMAGE, description: '新图' }
    ],
    outputs: [
      { name: 'result', type: FIELD_TYPES.JSON, description: '生成结果' },
      { name: 'image', type: FIELD_TYPES.IMAGE, description: '对比图' }
    ]
  },
  kling_image2video: {
    name: '可灵图生视频',
    inputs: [
      { name: 'base_image', type: FIELD_TYPES.IMAGE, description: '基础图片' }
    ],
    outputs: [
      { name: 'result', type: FIELD_TYPES.JSON, description: '生成结果' },
      { name: 'video', type: FIELD_TYPES.STRING, description: '视频文件路径' }
    ]
  }
};

/**
 * 获取节点的输入定义
 * @param {string} nodeType - 节点类型
 * @param {Object} nodeParams - 节点参数（用于动态获取）
 * @returns {Promise<Array>} 输入字段数组
 */
export async function getNodeInputs(nodeType, nodeParams = {}) {
  const definition = NODE_DEFINITIONS[nodeType];
  if (!definition) {
    return [];
  }
  
  // 如果是 RunningHub 节点，需要动态获取输入定义
  if (nodeType === 'runninghub_app' && definition.dynamicInputs) {
    return await getRunningHubInputs(nodeParams);
  }
  
  return definition.inputs || [];
}

/**
 * 获取节点的输出定义
 * @param {string} nodeType - 节点类型
 * @returns {Array} 输出字段数组
 */
export function getNodeOutputs(nodeType) {
  const definition = NODE_DEFINITIONS[nodeType];
  return definition?.outputs || [];
}

/**
 * 获取 RunningHub 节点的输入定义（从 API 获取）
 * @param {Object} nodeParams - 节点参数
 * @returns {Promise<Array>} 输入字段数组
 */
async function getRunningHubInputs(nodeParams) {
  const webappId = nodeParams?.webapp_id;
  if (!webappId) {
    return NODE_DEFINITIONS.runninghub_app.inputs; // 返回默认输入
  }
  
  try {
    // 调用后端 API 获取 RunningHub WebApp 的 API 文档
    const response = await fetch(`${apiBase}/api/runninghub/node-info?webapp_id=${encodeURIComponent(webappId)}`);
    if (!response.ok) {
      console.warn('获取 RunningHub API 文档失败:', response.status);
      return NODE_DEFINITIONS.runninghub_app.inputs;
    }
    
    const data = await response.json();
    
    // 解析 API 文档，提取输入字段
    // RunningHub api_call_demo 返回的格式可能包含 nodeInfoList 或 data.nodeInfoList
    const inputs = [];
    
    // 尝试多种可能的响应格式
    let nodeInfoList = null;
    if (data.nodeInfoList) {
      nodeInfoList = data.nodeInfoList;
    } else if (data.data && data.data.nodeInfoList) {
      nodeInfoList = data.data.nodeInfoList;
    } else if (Array.isArray(data)) {
      nodeInfoList = data;
    }
    
    if (nodeInfoList && Array.isArray(nodeInfoList)) {
      nodeInfoList.forEach(nodeInfo => {
        if (nodeInfo.fieldName && nodeInfo.fieldType) {
          inputs.push({
            name: nodeInfo.fieldName,
            type: mapFieldType(nodeInfo.fieldType),
            description: nodeInfo.description || `${nodeInfo.fieldName} 字段`,
            nodeId: nodeInfo.nodeId,
            optional: nodeInfo.optional !== false
          });
        }
      });
    }
    
    return inputs.length > 0 ? inputs : NODE_DEFINITIONS.runninghub_app.inputs;
  } catch (error) {
    console.error('获取 RunningHub 输入定义失败:', error);
    return NODE_DEFINITIONS.runninghub_app.inputs;
  }
}

/**
 * 映射 RunningHub 字段类型到标准字段类型
 * @param {string} rhType - RunningHub 字段类型
 * @returns {string} 标准字段类型
 */
function mapFieldType(rhType) {
  const typeMap = {
    'STRING': FIELD_TYPES.STRING,
    'TEXT': FIELD_TYPES.TEXT,
    'IMAGE': FIELD_TYPES.IMAGE,
    'NUMBER': FIELD_TYPES.NUMBER,
    'BOOLEAN': FIELD_TYPES.BOOLEAN,
    'JSON': FIELD_TYPES.JSON
  };
  
  return typeMap[rhType?.toUpperCase()] || FIELD_TYPES.ANY;
}

/**
 * 验证连接是否有效
 * @param {string} fromNodeType - 源节点类型
 * @param {string} fromOutputName - 源输出字段名
 * @param {string} toNodeType - 目标节点类型
 * @param {string} toInputName - 目标输入字段名
 * @param {Object} toNodeParams - 目标节点参数（用于动态验证）
 * @returns {Promise<{valid: boolean, error?: string}>} 验证结果
 */
export async function validateConnection(fromNodeType, fromOutputName, toNodeType, toInputName, toNodeParams = {}) {
  // 获取输出和输入定义
  const outputs = getNodeOutputs(fromNodeType);
  const inputs = await getNodeInputs(toNodeType, toNodeParams);
  
  // 查找输出字段
  const outputField = outputs.find(o => o.name === fromOutputName);
  if (!outputField) {
    return { valid: false, error: `源节点没有输出字段: ${fromOutputName}` };
  }
  
  // 查找输入字段
  const inputField = inputs.find(i => i.name === toInputName);
  if (!inputField) {
    return { valid: false, error: `目标节点没有输入字段: ${toInputName}` };
  }
  
  // 检查类型兼容性
  if (!isTypeCompatible(outputField.type, inputField.type)) {
    return { 
      valid: false, 
      error: `类型不兼容: ${outputField.type} -> ${inputField.type}` 
    };
  }
  
  return { valid: true };
}

/**
 * 检查类型是否兼容
 * @param {string} fromType - 源类型
 * @param {string} toType - 目标类型
 * @returns {boolean} 是否兼容
 */
function isTypeCompatible(fromType, toType) {
  // ANY 类型可以接受任何类型
  if (toType === FIELD_TYPES.ANY || fromType === FIELD_TYPES.ANY) {
    return true;
  }
  
  // 完全匹配
  if (fromType === toType) {
    return true;
  }
  
  // TEXT 和 STRING 兼容
  if ((fromType === FIELD_TYPES.TEXT && toType === FIELD_TYPES.STRING) ||
      (fromType === FIELD_TYPES.STRING && toType === FIELD_TYPES.TEXT)) {
    return true;
  }
  
  // JSON 可以接受任何结构化数据
  if (toType === FIELD_TYPES.JSON) {
    return true;
  }
  
  return false;
}

