/**
 * UI 交互模块
 * 处理模态框、视图切换、Keroro 对话框等 UI 交互
 */

import { keroroLines } from './config.js';

// 模态框懒加载标记
const modalLoaded = new Set();

// 打开模态框
export function openModal(modalId) {
  // 懒加载：首次打开时才渲染模态框内容
  if (!modalLoaded.has(modalId)) {
    lazyLoadModal(modalId);
    modalLoaded.add(modalId);
  }
  const overlay = document.getElementById(modalId);
  if (overlay) {
    overlay.classList.remove("hidden");
    // 移除内联 display 样式，让 CSS 规则生效
    overlay.style.display = "";
    console.log(`[Modal] 打开模态框: ${modalId}`);
  } else {
    console.error(`[Modal] 错误: 找不到模态框元素 #${modalId}`);
  }
}

// 懒加载模态框内容（按需渲染）
function lazyLoadModal(modalId) {
  // 这里可以根据 modalId 动态加载内容
  // 目前所有模态框都在 HTML 中，所以暂时不需要动态加载
  // 但可以在这里添加按需初始化的逻辑
}

// 关闭模态框
export function closeModal(modalId) {
  const overlay = document.getElementById(modalId);
  if (overlay) {
    // 强制添加 hidden 类
    overlay.classList.add("hidden");
    // 同时设置 display: none 确保关闭（双重保险）
    overlay.style.display = "none";
    console.log(`[Modal] 关闭模态框: ${modalId}`);
  } else {
    console.error(`[Modal] 错误: 找不到模态框元素 #${modalId}`);
  }
}

// 切换模态框
export function toggleModal(modalId) {
  const overlay = document.getElementById(modalId);
  if (overlay) {
    if (overlay.classList.contains("hidden")) {
      openModal(modalId);
    } else {
      closeModal(modalId);
    }
  }
}

// 显示 Keroro 对话框
export function showKeroroDialog(character, text) {
  const config = keroroLines[character] || keroroLines.keroro;
  const dialogOverlay = document.getElementById("keroro-dialog-overlay");
  const dialogCharacter = document.getElementById("keroro-dialog-character");
  const dialogText = document.getElementById("keroro-dialog-text");
  const dialog = document.getElementById("keroro-dialog");
  
  if (!config || !dialogOverlay || !dialogCharacter || !dialogText || !dialog) return;
  
  dialogCharacter.style.background = `linear-gradient(135deg, ${config.color}, ${config.color}dd)`;
  dialogCharacter.textContent = config.emoji;
  dialogText.textContent = text || `${config.name}：${text}`;
  dialog.style.borderColor = config.color;
  dialogOverlay.classList.remove("hidden");
}

// 隐藏 Keroro 对话框
export function hideKeroroDialog() {
  const dialogOverlay = document.getElementById("keroro-dialog-overlay");
  if (dialogOverlay) {
    dialogOverlay.classList.add("hidden");
  }
}

// 切换视图
export function switchView(viewName) {
  // 隐藏所有视图 - 强制隐藏
  document.querySelectorAll('.view-container').forEach(view => {
    view.classList.remove('active');
    view.style.display = 'none'; // 强制隐藏，确保CSS优先级
  });
  
  // 移除所有导航标签的 active 状态
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // 显示目标视图 - 使用更具体的选择器
  const targetView = document.querySelector(`.view-container[data-view="${viewName}"]`);
  const targetTab = document.querySelector(`.nav-tab[data-view="${viewName}"]`);
  
  if (targetView) {
    // 确保视图容器在main中（防止被错误移动到nav）
    const main = document.querySelector('main');
    if (main && !main.contains(targetView)) {
      main.appendChild(targetView);
    }
    
    // 添加active类并显示
    targetView.classList.add('active');
    // 移除内联样式，让CSS规则生效
    targetView.style.display = '';
  }
  
  if (targetTab) {
    targetTab.classList.add('active');
  }
  
  // 保存当前视图到 localStorage
  localStorage.setItem('currentView', viewName);
  
  // 触发自定义事件，允许其他模块监听视图切换
  window.dispatchEvent(new CustomEvent('viewChanged', { detail: { view: viewName } }));
}

// 设置状态药丸
export function setStatusPill(element, status, queuePosition = null) {
  if (!element) return;
  
  // 获取状态文本
  const statusMap = {
    'pending': '等待中',
    'queued': '排队中',
    'running': '运行中',
    'completed': '已完成',
    'partial': '部分完成',
    'failed': '失败',
    'cancelled': '已取消'
  };
  
  let statusText = statusMap[status] || status || "-";
  
  // 如果任务在队列中，显示队列位置
  if (status === 'queued' && queuePosition !== null && queuePosition !== undefined) {
    statusText = `排队中 (第 ${queuePosition} 位)`;
  }
  
  element.textContent = statusText;
  element.className = "status-pill";
  if (status === "running") element.classList.add("running");
  if (status === "completed") element.classList.add("completed");
  if (status === "partial") element.classList.add("partial");
  if (status === "failed" || status === "cancelled") element.classList.add("failed");
  if (status === "queued" || status === "pending") element.classList.add("pending");
}

