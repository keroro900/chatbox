// frontend/js/model-picker-demo.js
/**
 * 模型选择器演示模块
 * 用于测试和演示模型选择器功能
 */

import { openModelPicker } from './model-picker.js';
import { showToast } from './utils.js';

// 初始化演示功能
export function initModelPickerDemo() {
    // 在控制台添加测试函数
    window.testModelPicker = async function() {
        console.log('打开模型选择器...');
        try {
            const result = await openModelPicker();
            if (result) {
                console.log('选择的模型:', result);
                showToast(`已选择: ${result.display_name} (${result.provider})`, 'success');
            } else {
                console.log('用户取消选择');
                showToast('未选择模型', 'info');
            }
        } catch (error) {
            console.error('模型选择器错误:', error);
            showToast('打开模型选择器失败: ' + error.message, 'error');
        }
    };
    
    // 测试按特定provider过滤
    window.testModelPickerQwen = async function() {
        console.log('打开模型选择器（仅Qwen）...');
        try {
            const result = await openModelPicker({ provider: 'qwen' });
            if (result) {
                console.log('选择的模型:', result);
                showToast(`已选择: ${result.display_name}`, 'success');
            }
        } catch (error) {
            console.error('模型选择器错误:', error);
            showToast('打开模型选择器失败: ' + error.message, 'error');
        }
    };
    
    console.log('✅ 模型选择器演示已加载');
    console.log('💡 使用方式：');
    console.log('  - testModelPicker() - 打开完整模型选择器');
    console.log('  - testModelPickerQwen() - 打开Qwen模型选择器');
}

