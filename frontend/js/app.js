/**
 * 主入口模块
 * 初始化应用并连接所有模块
 */

import { showToast, getApiBase } from './utils.js';
import { initApi, loadConfig } from './api.js';
import { initWorkflow, addStep, renderSteps, updateWorkflowPreview, buildWorkflowPayload, normalizeWorkflow, workflow } from './workflow.js';
import { switchView, showKeroroDialog, hideKeroroDialog, setStatusPill } from './ui.js';
import { STEP_TYPES, getStepTypeOptions, keroroLines } from './config.js';
import { initHistory, loadJobHistory } from './history.js';
import { initModelPickerDemo } from './model-picker-demo.js';
// Canvas module has been removed - import removed
import { initWorkflowTemplates, saveCurrentWorkflow, deleteTemplate, getSelectedTemplateId } from './workflow-templates.js';

// DOM 元素缓存
let cfgEls = null;
let stepsContainer = null;
let wfPreviewEl = null;
let wfMaxWorkersEl = null;
let inputDir1El = null;
let inputDir2El = null;
let inputDir3El = null;
let inputDir4El = null;
let jobIdEl = null;
let jobStatusPill = null;
let jobProgressInner = null;
let jobMessageEl = null;
let jobErrorsEl = null;

// 应用状态
let currentJobId = null;
let pollTimer = null;
let lastJobStatus = null;

// 初始化 DOM 元素
function initDOMElements() {
  cfgEls = {
    qwenKey: document.getElementById("cfg-qwen-key"),
    qwenBase: document.getElementById("cfg-qwen-base"),
    qwenModel: document.getElementById("cfg-qwen-model"),
    rhKey: document.getElementById("cfg-rh-key"),
    rhBase: document.getElementById("cfg-rh-base"),
    t8Key: document.getElementById("cfg-gemini-t8-key"),
    t8Base: document.getElementById("cfg-gemini-t8-base"),
    comKey: document.getElementById("cfg-gemini-com-key"),
    comBase: document.getElementById("cfg-gemini-com-base"),
    klingAccessKey: document.getElementById("cfg-kling-access-key"),
    klingSecretKey: document.getElementById("cfg-kling-secret-key"),
    klingKey: document.getElementById("cfg-kling-key"),
    klingBase: document.getElementById("cfg-kling-base"),
    klingModel: document.getElementById("cfg-kling-model"),
    ohmygptKey: document.getElementById("cfg-ohmygpt-key"),
    ohmygptBase: document.getElementById("cfg-ohmygpt-base"),
    ohmygptModel: document.getElementById("cfg-ohmygpt-model"),
    modelscopeKey: document.getElementById("cfg-modelscope-key"),
    modelscopeBase: document.getElementById("cfg-modelscope-base"),
    modelscopeModel: document.getElementById("cfg-modelscope-model"),
    siliconflowKey: document.getElementById("cfg-siliconflow-key"),
    siliconflowBase: document.getElementById("cfg-siliconflow-base"),
    siliconflowModel: document.getElementById("cfg-siliconflow-model"),
    cherryinKey: document.getElementById("cfg-cherryin-key"),
    cherryinBase: document.getElementById("cfg-cherryin-base"),
    cherryinModel: document.getElementById("cfg-cherryin-model"),
    maxWorkers: document.getElementById("cfg-max-workers"),
  };
  
  stepsContainer = document.getElementById("steps-container");
  wfPreviewEl = document.getElementById("wf-json-preview");
  wfMaxWorkersEl = document.getElementById("wf-max-workers");
  inputDir1El = document.getElementById("input-dir-1");
  inputDir2El = document.getElementById("input-dir-2");
  inputDir3El = document.getElementById("input-dir-3");
  inputDir4El = document.getElementById("input-dir-4");
  
  jobIdEl = document.getElementById("job-id-runs") || (() => {
    const el = document.createElement("input");
    el.id = "job-id";
    el.style.display = "none";
    document.body.appendChild(el);
    return el;
  })();
  jobStatusPill = document.getElementById("job-status-pill-runs") || document.createElement("div");
  jobProgressInner = document.getElementById("job-progress-inner-runs") || document.createElement("div");
  jobMessageEl = document.getElementById("job-message-runs") || document.createElement("div");
  jobErrorsEl = document.getElementById("job-errors-runs") || document.createElement("div");
}

// 初始化应用
(async function init() {
  try {
    console.log("开始初始化 Keroro 作战室...");
    
    // 初始化 DOM 元素
    initDOMElements();
    
    // 检查必要的 DOM 元素
    if (!stepsContainer) {
      throw new Error("找不到 steps-container 元素");
    }
    if (!wfPreviewEl) {
      throw new Error("找不到 wf-json-preview 元素");
    }
    if (!wfMaxWorkersEl) {
      throw new Error("找不到 wf-max-workers 元素");
    }
    console.log("DOM 元素检查通过");
    
    // 初始化模块
    initApi(cfgEls);
    initWorkflow(stepsContainer, wfPreviewEl, wfMaxWorkersEl);
    initModelPickerDemo();  // 初始化模型选择器演示
    
    // 初始化工作流模板管理
    const templateSelect = document.getElementById("workflow-template-select");
    const btnSaveWorkflow = document.getElementById("btn-save-workflow");
    const btnDeleteWorkflow = document.getElementById("btn-delete-workflow");
    
    if (templateSelect && wfMaxWorkersEl) {
      initWorkflowTemplates(
        templateSelect,
        wfMaxWorkersEl,
        workflow,
        renderSteps,
        updateWorkflowPreview
      );
      
      // 绑定保存按钮（防止重复绑定）
      if (btnSaveWorkflow && !btnSaveWorkflow.dataset.bound) {
        console.log("[App] 绑定保存按钮事件");
        btnSaveWorkflow.addEventListener("click", async () => {
          console.log("[App] 保存按钮被点击");
          await saveCurrentWorkflow();
        });
        btnSaveWorkflow.dataset.bound = "true";
      } else if (btnSaveWorkflow) {
        console.log("[App] 保存按钮已绑定，跳过重复绑定");
      } else {
        console.warn("[App] 保存按钮未找到");
      }
      
      // 绑定删除按钮
      if (btnDeleteWorkflow) {
        btnDeleteWorkflow.addEventListener("click", async () => {
          const templateId = getSelectedTemplateId();
          if (!templateId) {
            showToast("请先选择一个模板", "warning");
            return;
          }
          
          // 获取模板名称用于确认对话框
          const selectedOption = templateSelect.options[templateSelect.selectedIndex];
          const templateName = selectedOption ? selectedOption.textContent : templateId;
          
          await deleteTemplate(templateId, templateName);
        });
      }
    }
    
    // 画布功能已移除，相关代码已注释
    // 如果需要画布功能，请重新实现 canvas.js 模块
    // setTimeout(() => {
    //   const canvasView = document.getElementById('workflow-canvas-view');
    //   const canvasContainer = canvasView?.querySelector('.canvas-container');
    //   
    //   if (canvasContainer) {
    //     console.log("找到画布容器，开始初始化...");
    //     initCanvas(canvasContainer);
    //     setCanvasRenderer(renderCanvas);
    //     
    //     // 监听节点位置变化事件
    //     canvasContainer.addEventListener('node-position-changed', (e) => {
    //       const { stepId, x, y } = e.detail;
    //       updateStepPosition(stepId, x, y);
    //     });
    //     
    //     console.log("画布模块初始化完成");
    //   } else {
    //     console.warn("画布容器未找到（可能因为视图被隐藏），将在视图切换时重新尝试初始化");
    //   }
    // }, 200);
    
    // 视图切换按钮初始化已移至 index.html 中的 initViewSwitching 函数
    // 这里不再重复初始化，避免事件监听器冲突
    
    console.log("模块初始化完成");
    
    // 初始化步骤类型选择器
    const stepTypeSelector = document.getElementById("step-type-selector");
    if (stepTypeSelector) {
      getStepTypeOptions().forEach(option => {
        const opt = document.createElement("option");
        opt.value = option.value;
        opt.textContent = option.text;
        stepTypeSelector.appendChild(opt);
      });
    }
    
    // 初始化第一个步骤
    wfMaxWorkersEl.value = 3;
    addStep("qwen_prompt");
    console.log("第一个步骤已添加");
    
    // 初始化任务历史记录
    initHistory();
    console.log("任务历史记录已初始化");
    
    console.log("Keroro 作战室初始化完成！");
  } catch (e) {
    console.error("初始化失败:", e);
    console.error("错误堆栈:", e.stack);
    const errorMsg = `初始化失败: ${e.message}\n\n请检查：\n1. 浏览器控制台是否有其他错误\n2. 后端服务是否在运行\n3. 网络连接是否正常`;
    alert(errorMsg);
    // 在页面上显示错误信息
    const errorDiv = document.createElement("div");
    errorDiv.style.cssText = "position:fixed;top:20px;right:20px;background:#ff6b6b;color:white;padding:20px;border-radius:8px;z-index:10000;max-width:400px;";
    errorDiv.innerHTML = `<strong>初始化错误</strong><br>${e.message}<br><small>查看控制台获取详细信息</small>`;
    document.body.appendChild(errorDiv);
  }
})();

// 导出必要的函数供全局使用（临时方案，后续可以改进）
window.app = {
  switchView,
  showKeroroDialog,
  hideKeroroDialog,
  setStatusPill,
  addStep,
  renderSteps,
  updateWorkflowPreview,
  buildWorkflowPayload,
  normalizeWorkflow,
  loadConfig,
  loadJobHistory
};

