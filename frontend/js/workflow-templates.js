/**
 * 工作流模板管理模块
 * 处理工作流模板的保存、加载、删除等 UI 逻辑
 */

import { listWorkflowTemplates, getWorkflowTemplate, saveWorkflowTemplate, deleteWorkflowTemplate } from './api.js';
import { showToast } from './utils.js';
import { normalizeWorkflow } from './workflow.js';

// DOM 元素引用
let templateSelect = null;
let wfMaxWorkersEl = null;
let workflow = null;
let renderSteps = null;
let updateWorkflowPreview = null;

// 防止重复绑定
let saveTemplateModalEventsBound = false;

/**
 * 初始化工作流模板管理
 */
export function initWorkflowTemplates(templateSelectEl, maxWorkersEl, workflowRef, renderStepsFn, updatePreviewFn) {
  templateSelect = templateSelectEl;
  wfMaxWorkersEl = maxWorkersEl;
  workflow = workflowRef;
  renderSteps = renderStepsFn;
  updateWorkflowPreview = updatePreviewFn;
  
  // 绑定事件
  bindTemplateEvents();
  
  // 绑定保存模板模态框事件
  bindSaveTemplateModalEvents();
  
  // 加载模板列表
  loadTemplates();
}

/**
 * 绑定保存模板模态框事件
 */
function bindSaveTemplateModalEvents() {
  // 防止重复绑定
  if (saveTemplateModalEventsBound) {
    console.log("[WorkflowTemplates] 保存模板模态框事件已绑定，跳过重复绑定");
    return;
  }
  
  console.log("[WorkflowTemplates] 开始绑定保存模板模态框事件");
  
  // 关闭按钮
  const closeBtn = document.getElementById("btn-close-save-template");
  const cancelBtn = document.getElementById("btn-cancel-save-template");
  const confirmBtn = document.getElementById("btn-confirm-save-template");
  const overlay = document.getElementById("modal-save-template-overlay");
  
  const hideModal = () => hideSaveTemplateModal();
  
  if (closeBtn) {
    closeBtn.addEventListener("click", hideModal);
  }
  if (cancelBtn) {
    cancelBtn.addEventListener("click", hideModal);
  }
  if (confirmBtn) {
    confirmBtn.addEventListener("click", async () => {
      await confirmSaveTemplate();
    });
  }
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        hideModal();
      }
    });
  }
  
  // 支持 Enter 键确认，Esc 键取消
  const nameInput = document.getElementById("save-template-name");
  if (nameInput) {
    nameInput.addEventListener("keydown", async (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        await confirmSaveTemplate();
      }
    });
  }
  
  // Esc 键关闭（使用命名函数，方便后续移除）
  const escKeyHandler = (e) => {
    if (e.key === "Escape" && overlay && !overlay.classList.contains("hidden")) {
      hideModal();
    }
  };
  document.addEventListener("keydown", escKeyHandler);
  
  saveTemplateModalEventsBound = true;
  console.log("[WorkflowTemplates] 保存模板模态框事件绑定完成");
}

/**
 * 绑定模板相关事件
 */
function bindTemplateEvents() {
  // 模板选择事件
  if (templateSelect) {
    templateSelect.addEventListener("change", async (e) => {
      const templateId = e.target.value;
      if (!templateId) return;
      
      await loadTemplate(templateId);
    });
  }
}

/**
 * 加载模板列表
 */
export async function loadTemplates() {
  if (!templateSelect) {
    console.warn("工作流模板选择器未找到");
    return;
  }
  
  try {
    const templates = await listWorkflowTemplates();
    
    // 保存当前选中的值
    const currentValue = templateSelect.value;
    
    // 清空并重新填充选项
    templateSelect.innerHTML = '<option value="">-- 选择模板或新建 --</option>';
    
    templates.forEach(template => {
      const opt = document.createElement("option");
      opt.value = template.id;
      const displayText = template.description 
        ? `${template.name} - ${template.description}`
        : template.name;
      opt.textContent = displayText;
      opt.dataset.templateId = template.id;
      opt.dataset.templateName = template.name;
      templateSelect.appendChild(opt);
    });
    
    // 恢复之前选中的值（如果还存在）
    if (currentValue && Array.from(templateSelect.options).some(opt => opt.value === currentValue)) {
      templateSelect.value = currentValue;
    }
  } catch (e) {
    console.error("加载工作流模板列表失败:", e);
    showToast("加载模板列表失败", "error");
  }
}

/**
 * 加载指定的模板
 */
export async function loadTemplate(templateId) {
  if (!templateId) return;
  
  try {
    const data = await getWorkflowTemplate(templateId);
    
    if (data && data.workflow) {
      // 转换 gemini_generate 为 gemini_generate_model
      const normalizedWorkflow = normalizeWorkflow(data.workflow);
      
      // 更新工作流
      workflow.steps = normalizedWorkflow.steps || [];
      
      // 更新最大并发数
      if (wfMaxWorkersEl && normalizedWorkflow.max_workers) {
        wfMaxWorkersEl.value = normalizedWorkflow.max_workers;
      }
      
      // 重新渲染
      if (renderSteps) {
        renderSteps();
      }
      if (updateWorkflowPreview) {
        updateWorkflowPreview();
      }
      
      showToast(`已加载模板：${data.name}`, "success");
    } else {
      showToast("模板数据格式错误", "error");
    }
  } catch (e) {
    console.error("加载模板失败:", e);
    showToast(`加载模板失败：${e.message}`, "error");
    // 重置选择
    if (templateSelect) {
      templateSelect.value = "";
    }
  }
}

/**
 * 显示保存模板模态框
 */
function showSaveTemplateModal() {
  console.log("[WorkflowTemplates] 显示保存模板模态框");
  const overlay = document.getElementById("modal-save-template-overlay");
  const nameInput = document.getElementById("save-template-name");
  const descriptionInput = document.getElementById("save-template-description");
  const tagsInput = document.getElementById("save-template-tags");
  
  console.log("[WorkflowTemplates] 模态框元素:", { overlay, nameInput, descriptionInput, tagsInput });
  
  if (!overlay || !nameInput) {
    console.error("保存模板模态框元素未找到", { overlay, nameInput });
    showToast("UI 元素未找到，请刷新页面重试", "error");
    return;
  }
  
  // 清空表单
  nameInput.value = "";
  if (descriptionInput) descriptionInput.value = "";
  if (tagsInput) tagsInput.value = "";
  
  // 使用统一的 openModal 函数（如果可用）
  if (window.openModal && typeof window.openModal === 'function') {
    window.openModal("modal-save-template-overlay");
    console.log("[WorkflowTemplates] 模态框已通过 openModal 显示");
  } else {
    // 降级方案：直接操作 DOM
    overlay.classList.remove("hidden");
    overlay.style.display = "";
    console.log("[WorkflowTemplates] 模态框已显示，hidden 类已移除");
  }
  
  // 聚焦到名称输入框
  setTimeout(() => {
    nameInput.focus();
    console.log("[WorkflowTemplates] 输入框已聚焦");
  }, 100);
}

/**
 * 隐藏保存模板模态框
 */
function hideSaveTemplateModal() {
  // 使用统一的 closeModal 函数（如果可用）
  if (window.closeModal && typeof window.closeModal === 'function') {
    window.closeModal("modal-save-template-overlay");
  } else {
    // 降级方案：直接操作 DOM
    const overlay = document.getElementById("modal-save-template-overlay");
    if (overlay) {
      overlay.classList.add("hidden");
      overlay.style.display = "none";
    }
  }
}

/**
 * 保存当前工作流为模板
 */
export async function saveCurrentWorkflow() {
  console.log("[WorkflowTemplates] saveCurrentWorkflow 被调用", { workflow, steps: workflow?.steps });
  if (!workflow || !workflow.steps || workflow.steps.length === 0) {
    showToast("当前工作流为空，无法保存", "warning");
    return;
  }
  
  // 显示保存模态框
  showSaveTemplateModal();
}

/**
 * 执行保存模板操作（从模态框调用）
 */
export async function confirmSaveTemplate() {
  const nameInput = document.getElementById("save-template-name");
  const descriptionInput = document.getElementById("save-template-description");
  const tagsInput = document.getElementById("save-template-tags");
  
  if (!nameInput) {
    showToast("UI 元素未找到", "error");
    return;
  }
  
  const name = nameInput.value.trim();
  if (!name) {
    showToast("请输入模板名称", "warning");
    nameInput.focus();
    return;
  }
  
  const description = descriptionInput ? descriptionInput.value.trim() : "";
  const tagsInputValue = tagsInput ? tagsInput.value.trim() : "";
  const tags = tagsInputValue 
    ? tagsInputValue.split(",").map(t => t.trim()).filter(t => t)
    : null;
  
  try {
    // 构建工作流数据
    const workflowData = {
      max_workers: Number(wfMaxWorkersEl ? wfMaxWorkersEl.value : 1),
      steps: workflow.steps.map(s => {
        const base = {
          id: s.id,
          type: s.type,
          params: { ...s.params },
          uses: s.uses || []
        };
        
        // 包含可选字段
        if (s.when) base.when = s.when;
        if (s.retry !== undefined && s.retry > 0) {
          base.retry = s.retry;
          base.retry_delay = s.retry_delay || 3.0;
        }
        if (s.timeout) base.timeout = s.timeout;
        if (s.ui) base.ui = s.ui;
        
        // 处理 runninghub_app 的 bindingsJson
        if (s.type === "runninghub_app" && typeof base.params.bindingsJson === "string") {
          try {
            base.params.bindings = JSON.parse(base.params.bindingsJson || "{}");
          } catch (_) {
            base.params.bindings = {};
          }
          delete base.params.bindingsJson;
        }
        
        return base;
      })
    };
    
    // 转换 gemini_generate 为 gemini_generate_model
    const normalizedWorkflow = normalizeWorkflow(workflowData);
    
    // 保存模板
    await saveWorkflowTemplate(
      normalizedWorkflow,
      name,
      description || null,
      tags
    );
    
    // 隐藏模态框
    hideSaveTemplateModal();
    
    // 重新加载模板列表
    await loadTemplates();
    
    // 选中新保存的模板（通过名称匹配）
    if (templateSelect) {
      const options = Array.from(templateSelect.options);
      const newOption = options.find(opt => opt.textContent.includes(name));
      if (newOption) {
        templateSelect.value = newOption.value;
      }
    }
  } catch (e) {
    console.error("保存工作流模板失败:", e);
    // 错误提示已在 API 函数中处理
  }
}

/**
 * 删除工作流模板
 */
export async function deleteTemplate(templateId, templateName) {
  if (!templateId) return;
  
  const confirmed = confirm(`确定要删除模板 "${templateName || templateId}" 吗？\n此操作不可撤销。`);
  if (!confirmed) return;
  
  try {
    await deleteWorkflowTemplate(templateId);
    
    // 重新加载模板列表
    await loadTemplates();
    
    // 如果删除的是当前选中的模板，清空选择
    if (templateSelect && templateSelect.value === templateId) {
      templateSelect.value = "";
    }
  } catch (e) {
    console.error("删除工作流模板失败:", e);
    // 错误提示已在 API 函数中处理
  }
}

/**
 * 获取当前选中的模板 ID
 */
export function getSelectedTemplateId() {
  return templateSelect ? templateSelect.value : null;
}

