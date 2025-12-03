/**
 * 工作流逻辑模块
 * 管理工作流的步骤、渲染、预览等功能
 */

import { STEP_TYPES, getStepTypeOptions } from './config.js';
import { debounce } from './utils.js';
import { openModal, closeModal } from './ui.js';

// 工作流数据结构
export const workflow = {
  steps: []
};

// DOM 元素引用
let stepsContainer = null;
let wfPreviewEl = null;
let wfMaxWorkersEl = null;
let stepCardCache = new Map();
let lastRenderedStepIds = [];


export function initWorkflow(container, previewEl, maxWorkersEl) {
  stepsContainer = container;
  wfPreviewEl = previewEl;
  wfMaxWorkersEl = maxWorkersEl;
}


// 使用 debounce 优化 updateWorkflowPreview（300ms 延迟）
const updateWorkflowPreviewDebounced = debounce(() => {
  if (!wfPreviewEl || !wfMaxWorkersEl) return;
  
  const preview = {
    max_workers: Number(wfMaxWorkersEl.value || 1),
    steps: workflow.steps.map(s => {
      const base = {
        id: s.id,
        type: s.type,
        params: { ...s.params },
        uses: s.uses || []
      };
      // 包含 ui 字段（如果存在）
      if (s.ui) {
        base.ui = { ...s.ui };
      }
      // 包含其他可选字段
      if (s.when) {
        base.when = s.when;
      }
      if (s.retry !== undefined && s.retry > 0) {
        base.retry = s.retry;
        base.retry_delay = s.retry_delay || 3.0;
      }
      if (s.timeout) {
        base.timeout = s.timeout;
      }
      if (s.type === "runninghub_app" && typeof s.params.bindingsJson === "string") {
        try {
          base.params.bindings = JSON.parse(s.params.bindingsJson || "{}");
        } catch (_) {}
        delete base.params.bindingsJson;
      }
      // 保存连接关系和 UI 位置
      if (s.connections) {
        base.connections = s.connections;
      }
      if (s.ui) {
        base.ui = s.ui;
      }
      return base;
    })
  };
  wfPreviewEl.textContent = JSON.stringify(preview, null, 2);
}, 300);

export function updateWorkflowPreview() {
  updateWorkflowPreviewDebounced();
}

// 转换工作流中的 gemini_generate 为 gemini_generate_model（兼容旧版本）
export function normalizeWorkflow(wf) {
  if (!wf || !wf.steps) return wf;
  // 转换 gemini_generate 为 gemini_generate_model（后端只接受 gemini_generate_model）
  // 同时确保 ui 字段被保留
  wf.steps = wf.steps.map(step => {
    const normalizedStep = { ...step };
    if (step.type === "gemini_generate") {
      normalizedStep.type = "gemini_generate_model";
    }
    // 确保 ui 字段被保留（如果存在）
    if (step.ui) {
      normalizedStep.ui = { ...step.ui };
    }
    return normalizedStep;
  });
  return wf;
}

export function buildWorkflowPayload() {
  const steps = workflow.steps.map(s => {
    const params = { ...s.params };
    if (s.type === "runninghub_app" && typeof params.bindingsJson === "string") {
      params.bindings = JSON.parse(params.bindingsJson || "{}");
      delete params.bindingsJson;
    }
    const step = {
      id: s.id,
      type: s.type,
      params,
      uses: s.uses || []
    };
    // 包含 ui 字段（如果存在）
    if (s.ui) {
      step.ui = { ...s.ui };
    }
    // 包含其他可选字段
    if (s.when) {
      step.when = s.when;
    }
    if (s.retry !== undefined && s.retry > 0) {
      step.retry = s.retry;
      step.retry_delay = s.retry_delay || 3.0;
    }
    if (s.timeout) {
      step.timeout = s.timeout;
    }
    
    // 包含 UI 数据（如果存在）
    if (s.ui) {
      step.ui = s.ui;
    }
    
    return step;
  });
  const max_workers = Number(wfMaxWorkersEl ? wfMaxWorkersEl.value : 1);
  return { steps, max_workers };
}

export function addStep(defaultType = "qwen_prompt") {
  const id = "step_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
  const stepTypeConfig = STEP_TYPES[defaultType];
  const defaultParams = stepTypeConfig && stepTypeConfig.defaultParams 
    ? JSON.parse(JSON.stringify(stepTypeConfig.defaultParams))
    : {};
  const base = {
    id,
    type: defaultType,
    params: defaultParams,
    uses: [],
    ui: null  // 初始化为 null，画布会自动分配位置
  };
  
  // 处理特殊情况（如果配置系统未完全覆盖）
  if (defaultType === "kling_image2video") {
    base.params = {
      base_from: "",
      image_index: -1,
      model_name: "kling-v2-5",
      mode: "std",
      prompt: "把小朋友和衣服做成轻微的动作，像是在开心走路或转身展示衣服，动作自然柔和，不要夸张摇晃。",
      negative_prompt: "",
      aspect_ratio: "auto",
      duration: 5,
      cfg_scale: 0.5,
      filename_suffix: "kling_video"
    };
  }
  
  workflow.steps.push(base);
  
  // 刷新列表视图
  renderSteps();
  
  updateWorkflowPreview();
}

function getStepSummary(step) {
  const summaries = [];
  
  // 使用配置系统获取摘要
  const stepTypeConfig = STEP_TYPES[step.type];
  if (stepTypeConfig && stepTypeConfig.getSummary) {
    const summaryHtml = stepTypeConfig.getSummary(step);
    if (summaryHtml) {
      summaries.push(summaryHtml);
    }
  }
  
  // 添加条件分支和重试信息
  if (step.when) {
    summaries.push(`<span class="step-summary-item" style="background:rgba(255,165,0,0.2);border-color:rgba(255,165,0,0.5);color:#ffa500;">条件分支</span>`);
  }
  if (step.retry > 0) {
    summaries.push(`<span class="step-summary-item" style="background:rgba(74,144,226,0.2);border-color:rgba(74,144,226,0.5);color:#4a90e2;">重试${step.retry}次</span>`);
  }
  
  return summaries.length > 0 ? summaries.join("") : '<span class="step-summary-item">默认配置</span>';
}

export { getStepSummary };

// 获取图片源选项（用于下拉框）
export function getImageSourceOptions(currentStepId) {
  const options = [
    { value: "slot1", text: "Slot 1 (图一目录 - 前面上衣)" },
    { value: "slot2", text: "Slot 2 (图二目录 - 后面上衣)" },
    { value: "slot3", text: "Slot 3 (图三目录 - 前面裤子)" },
    { value: "slot4", text: "Slot 4 (图四目录 - 后面裤子)" }
  ];
  
  // 添加前面步骤的输出作为选项
  workflow.steps.forEach((step, index) => {
    if (step.id !== currentStepId) {
      const stepIndex = index + 1;
      const stepTypeConfig = STEP_TYPES[step.type];
      const stepName = stepTypeConfig ? stepTypeConfig.name : step.type;
      options.push({ 
        value: step.id, 
        text: `#${stepIndex} ${step.id} (${stepName})` 
      });
    }
  });
  
  return options;
}

// 获取提示词源选项（用于下拉框）
export function getPromptSourceOptions() {
  const options = [
    { value: "", text: "-- 不使用上游提示词 --" }
  ];
  
  workflow.steps.forEach((step, index) => {
    if (step.type === "qwen_prompt" || step.type === "vision_prompt") {
      const stepIndex = index + 1;
      const stepTypeConfig = STEP_TYPES[step.type];
      const stepName = stepTypeConfig ? stepTypeConfig.name : step.type;
      options.push({ 
        value: step.id, 
        text: `#${stepIndex} ${step.id} (${stepName})` 
      });
    }
  });
  
  return options;
}

// 渲染步骤列表（简化版，完整版需要更多代码）
export function renderSteps() {
  if (!stepsContainer) return;
  
  // 检查是否需要完全重新渲染
  const currentStepIds = workflow.steps.map(s => s.id).join(',');
  const needsFullRender = currentStepIds !== lastRenderedStepIds.join(',') || 
                         workflow.steps.length !== lastRenderedStepIds.length;
  
  if (needsFullRender) {
    // 完全重新渲染
    stepsContainer.innerHTML = "";
    stepCardCache.clear();
    lastRenderedStepIds = workflow.steps.map(s => s.id);
  }
  
  workflow.steps.forEach((step, index) => {
    if (!step.params) step.params = {};
    if (!step.uses) step.uses = [];
    
    // 如果缓存存在且不需要完全重新渲染，跳过
    if (!needsFullRender && stepCardCache.has(step.id)) {
      return;
    }
    
    const card = document.createElement("div");
    card.className = "step-card step-card-compact";
    
    const header = document.createElement("div");
    header.className = "step-header";
    
    const title = document.createElement("div");
    title.className = "step-title";
    const idxSpan = document.createElement("span");
    idxSpan.className = "step-index";
    idxSpan.textContent = "#" + (index + 1);
    const pill = document.createElement("span");
    pill.className = "step-pill";
    const stepTypeConfig = STEP_TYPES[step.type];
    const stepTypeName = stepTypeConfig ? `${stepTypeConfig.icon} ${stepTypeConfig.name}` : step.type;
    pill.textContent = stepTypeName;
    pill.title = stepTypeConfig ? stepTypeConfig.description : "未知步骤类型";
    title.appendChild(idxSpan);
    title.appendChild(pill);
    
    const actions = document.createElement("div");
    actions.className = "step-actions";
    
    const btnUp = document.createElement("button");
    btnUp.className = "icon-btn";
    btnUp.textContent = "↑";
    btnUp.title = "上移";
    btnUp.onclick = () => {
      if (index === 0) return;
      [workflow.steps[index - 1], workflow.steps[index]] = [workflow.steps[index], workflow.steps[index - 1]];
      renderSteps();
      updateWorkflowPreview();
    };
    
    const btnDown = document.createElement("button");
    btnDown.className = "icon-btn";
    btnDown.textContent = "↓";
    btnDown.title = "下移";
    btnDown.onclick = () => {
      if (index === workflow.steps.length - 1) return;
      [workflow.steps[index], workflow.steps[index + 1]] = [workflow.steps[index + 1], workflow.steps[index]];
      renderSteps();
      updateWorkflowPreview();
    };
    
    const btnDel = document.createElement("button");
    btnDel.className = "icon-btn";
    btnDel.textContent = "✕";
    btnDel.title = "删除";
    btnDel.onclick = () => {
      workflow.steps.splice(index, 1);
      renderSteps();
      updateWorkflowPreview();
    };
    
    actions.appendChild(btnUp);
    actions.appendChild(btnDown);
    actions.appendChild(btnDel);
    
    // 添加高级设置按钮
    const btnAdvanced = document.createElement("button");
    btnAdvanced.className = "step-advanced-btn";
    btnAdvanced.innerHTML = "⚙️ 高级设置";
    btnAdvanced.onclick = () => openStepAdvancedSettings(step, index);
    
    header.appendChild(title);
    header.appendChild(actions);
    card.appendChild(header);
    
    // 显示核心信息摘要
    const summary = document.createElement("div");
    summary.className = "step-summary";
    const summaryText = getStepSummary(step);
    summary.innerHTML = summaryText;
    card.appendChild(summary);
    
    card.appendChild(btnAdvanced);
    
    // 缓存卡片（用于性能优化）
    if (needsFullRender) {
      stepCardCache.set(step.id, card);
    }
    
    stepsContainer.appendChild(card);
  });
}

// 创建字段的辅助函数（用于高级设置）
export function createField(labelText, type, options, value, onChange) {
  const field = document.createElement("div");
  field.className = "field";
  const label = document.createElement("label");
  label.textContent = labelText;
  field.appendChild(label);
  
  if (type === "select") {
    const select = document.createElement("select");
    if (Array.isArray(options)) {
      // 调试日志：仅在包含 cherryin 时输出
      if (options.some(opt => (typeof opt === "object" && opt.value === "cherryin") || (typeof opt === "string" && opt === "cherryin"))) {
        console.log("[workflow.js] createField select: label=", labelText, "options=", JSON.stringify(options), "value=", value);
      }
      options.forEach(opt => {
        const option = document.createElement("option");
        if (typeof opt === "string") {
          option.value = opt;
          option.textContent = opt;
        } else {
          option.value = opt.value || "";
          option.textContent = opt.text || opt.value || "";
        }
        if (option.value === value) option.selected = true;
        select.appendChild(option);
        // 调试日志：仅在添加 cherryin 选项时输出
        if (option.value === "cherryin") {
          console.log("[workflow.js] createField: 已添加 cherryin 选项, value=", option.value, "text=", option.textContent);
        }
      });
    }
    select.value = value || "";
    select.onchange = () => onChange(select.value);
    field.appendChild(select);
  } else if (type === "input") {
    const input = document.createElement("input");
    input.type = "text";
    input.value = value || "";
    input.oninput = () => onChange(input.value);
    field.appendChild(input);
  } else if (type === "textarea") {
    const textarea = document.createElement("textarea");
    textarea.value = value || "";
    textarea.oninput = () => onChange(textarea.value);
    field.appendChild(textarea);
  }
  
  return field;
}

// 打开步骤高级设置模态框
export function openStepAdvancedSettings(step, index) {
  console.log(`[Modal] 打开高级设置: step=${step?.id}, index=${index}`);
  if (!step) {
    console.error("[Modal] 错误: step 参数为空");
    return;
  }
  openModal("modal-step-advanced-overlay");
  renderAdvancedSettings(step);
}

// 渲染高级设置内容
export function renderAdvancedSettings(step) {
  const contentEl = document.getElementById("step-advanced-content");
  if (!contentEl) {
    console.error("[Modal] 错误: 找不到 step-advanced-content 元素");
    return;
  }
  console.log("[workflow.js] renderAdvancedSettings: step.type =", step.type);
  contentEl.innerHTML = "";
  
  // 步骤类型选择
  const typeField = document.createElement("div");
  typeField.className = "field";
  const typeLabel = document.createElement("label");
  typeLabel.textContent = "步骤类型";
  const typeSelect = document.createElement("select");
  // 使用配置系统生成选项
  getStepTypeOptions().forEach(t => {
    const opt = document.createElement("option");
    opt.value = t.value;
    opt.textContent = t.text;
    if (t.value === step.type) opt.selected = true;
    typeSelect.appendChild(opt);
  });
  typeSelect.onchange = () => {
    step.type = typeSelect.value;
    step.params = step.params || {};
    // 使用配置系统的默认参数
    const stepTypeConfig = STEP_TYPES[step.type];
    if (stepTypeConfig && stepTypeConfig.defaultParams && Object.keys(step.params).length === 0) {
      step.params = JSON.parse(JSON.stringify(stepTypeConfig.defaultParams));
    }
    renderAdvancedSettings(step);
    renderSteps();
    updateWorkflowPreview();
  };
  typeField.appendChild(typeLabel);
  typeField.appendChild(typeSelect);
  contentEl.appendChild(typeField);

  // 根据步骤类型渲染对应的参数
  if (step.type === "qwen_prompt" || step.type === "vision_prompt") {
    // Provider (仅 vision_prompt)
    if (step.type === "vision_prompt") {
      const f1 = createField("Provider", "select", [
        { value: "qwen", text: "Qwen" },
        { value: "ohmygpt", text: "OhMyGPT" },
        { value: "gemini_t8star", text: "Gemini (t8star)" },
        { value: "gemini_comfly", text: "Gemini (comfly)" },
        { value: "modelscope", text: "ModelScope" },
        { value: "siliconflow", text: "SiliconFlow" },
        { value: "cherryin", text: "Cherryin.ai" }
      ], step.params.provider || "qwen", (val) => { step.params.provider = val; updateWorkflowPreview(); });
      contentEl.appendChild(f1);
    }
    
    // 年龄段预设
    const f2a = createField("年龄段预设", "select", [
      { value: "", text: "不指定（使用默认）" },
      { value: "small_kid", text: "小童 (3-7岁)" },
      { value: "big_kid", text: "大童 (8-12岁)" },
      { value: "adult", text: "成人 (18-30岁)" }
    ], step.params.age_group || "", (val) => { step.params.age_group = val || undefined; updateWorkflowPreview(); });
    contentEl.appendChild(f2a);
    
    // 性别预设
    const f2g = createField("性别预设", "select", [
      { value: "female", text: "女" },
      { value: "male", text: "男" }
    ], step.params.gender || "female", (val) => { step.params.gender = val; updateWorkflowPreview(); });
    contentEl.appendChild(f2g);
    
    // 人种预设
    const f2e = createField("人种预设", "select", [
      { value: "", text: "不指定（使用默认）" },
      { value: "caucasian", text: "欧美白人" },
      { value: "african_american", text: "欧美黑人" },
      { value: "asian", text: "亚洲人" },
      { value: "mixed", text: "欧美亚洲混血" }
    ], step.params.ethnicity_preset || "", (val) => { step.params.ethnicity_preset = val || undefined; updateWorkflowPreview(); });
    contentEl.appendChild(f2e);
    
    // 场景预设
    const f2b = createField("场景预设", "select", [
      { value: "", text: "不指定（使用默认）" },
      { value: "home", text: "室内 (home)" },
      { value: "outdoor", text: "室外 (outdoor)" }
    ], step.params.preset || step.params.scene_preset || "", (val) => { 
      step.params.preset = val || undefined;
      step.params.scene_preset = val || undefined;
      updateWorkflowPreview(); 
    });
    contentEl.appendChild(f2b);
    
    // 提示文字
    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.style.fontSize = "12px";
    hint.style.color = "#666";
    hint.style.marginTop = "-10px";
    hint.style.marginBottom = "10px";
    hint.textContent = "年龄 / 性别 / 人种 / 场景 会同时影响 Qwen 反推的系统提示词和生成的 JSON（age_years / gender / ethnicity / scene_preset / video_prompt），并传递给后续 Gemini / 视频步骤。";
    contentEl.appendChild(hint);
    
    const f3 = createField("IP 模式", "select", [
      { value: "auto", text: "自动识别 (auto)" },
      { value: "force_ip", text: "强制 IP 模式 (force_ip)" }
    ], step.params.ip_mode || "auto", (val) => { step.params.ip_mode = val; updateWorkflowPreview(); });
    contentEl.appendChild(f3);
    
    // 风格模式（日常感/商拍感）
    const f_style = createField("风格模式", "select", [
      { value: "daily", text: "日常感 (Daily Style)" },
      { value: "commercial", text: "商拍感 (Commercial Style)" }
    ], step.params.style_mode || "daily", (val) => { step.params.style_mode = val; updateWorkflowPreview(); });
    contentEl.appendChild(f_style);
    
    // 风格模式提示
    const styleHint = document.createElement("div");
    styleHint.className = "field-hint";
    styleHint.style.fontSize = "12px";
    styleHint.style.color = "#666";
    styleHint.style.marginTop = "-10px";
    styleHint.style.marginBottom = "10px";
    styleHint.textContent = "日常感：自然、真实、头发自然。商拍感：专业模特、头发整齐、商业质感。";
    contentEl.appendChild(styleHint);
    
    // 约束选项
    const constraintHint = document.createElement("div");
    constraintHint.className = "field-hint";
    constraintHint.style.fontSize = "12px";
    constraintHint.style.color = "#888";
    constraintHint.style.marginTop = "10px";
    constraintHint.style.marginBottom = "5px";
    constraintHint.style.fontWeight = "bold";
    constraintHint.textContent = "约束选项（可选，用于限制生成的提示词）：";
    contentEl.appendChild(constraintHint);
    
    // 姿势约束
    const f_pose = createField("姿势约束", "select", [
      { value: "", text: "不指定（由模型决定）" },
      { value: "standing", text: "站立 (Standing)" },
      { value: "sitting", text: "坐姿 (Sitting)" },
      { value: "walking", text: "走路 (Walking)" },
      { value: "natural", text: "自然姿势 (Natural)" }
    ], step.params.pose_constraint || "", (val) => { 
      step.params.pose_constraint = val || undefined; 
      updateWorkflowPreview(); 
    });
    contentEl.appendChild(f_pose);
    
    // 表情约束
    const f_expression = createField("表情约束", "select", [
      { value: "", text: "不指定（由模型决定）" },
      { value: "smiling", text: "微笑 (Smiling)" },
      { value: "happy", text: "开心 (Happy)" },
      { value: "natural", text: "自然表情 (Natural)" },
      { value: "gentle", text: "温和 (Gentle)" },
      { value: "serious", text: "严肃 (Serious)" }
    ], step.params.expression_constraint || "", (val) => { 
      step.params.expression_constraint = val || undefined; 
      updateWorkflowPreview(); 
    });
    contentEl.appendChild(f_expression);
    
    // 动作约束
    const f_action = createField("动作约束", "select", [
      { value: "", text: "不指定（由模型决定）" },
      { value: "static", text: "静态 (Static)" },
      { value: "walking", text: "走路 (Walking)" },
      { value: "sitting", text: "坐着 (Sitting)" },
      { value: "natural", text: "自然动作 (Natural)" }
    ], step.params.action_constraint || "", (val) => { 
      step.params.action_constraint = val || undefined; 
      updateWorkflowPreview(); 
    });
    contentEl.appendChild(f_action);
    
    // 约束选项提示
    const constraintInfo = document.createElement("div");
    constraintInfo.className = "field-hint";
    constraintInfo.style.fontSize = "12px";
    constraintInfo.style.color = "#666";
    constraintInfo.style.marginTop = "-10px";
    constraintInfo.style.marginBottom = "10px";
    constraintInfo.textContent = "这些约束将影响生成的提示词，确保模特符合指定的姿势、表情和动作要求。";
    contentEl.appendChild(constraintInfo);
    
    // 自定义约束提示词
    const customConstraintField = document.createElement("div");
    customConstraintField.className = "field";
    const customConstraintLabel = document.createElement("label");
    customConstraintLabel.textContent = "自定义约束提示词（可选）";
    customConstraintLabel.style.display = "block";
    customConstraintLabel.style.marginBottom = "5px";
    customConstraintLabel.style.fontWeight = "500";
    customConstraintLabel.style.color = "var(--keroro-text)";
    customConstraintField.appendChild(customConstraintLabel);
    
    const customConstraintTextarea = document.createElement("textarea");
    customConstraintTextarea.className = "field-input";
    customConstraintTextarea.style.width = "100%";
    customConstraintTextarea.style.minHeight = "80px";
    customConstraintTextarea.style.padding = "8px";
    customConstraintTextarea.style.border = "1px solid var(--keroro-border)";
    customConstraintTextarea.style.borderRadius = "4px";
    customConstraintTextarea.style.fontSize = "13px";
    customConstraintTextarea.style.fontFamily = "inherit";
    customConstraintTextarea.style.resize = "vertical";
    customConstraintTextarea.placeholder = "例如：双手叉腰、眼神看向镜头、背景需要有绿植等";
    customConstraintTextarea.value = step.params.custom_constraint || "";
    customConstraintTextarea.addEventListener("input", (e) => {
      step.params.custom_constraint = e.target.value.trim() || undefined;
      updateWorkflowPreview();
    });
    customConstraintField.appendChild(customConstraintTextarea);
    
    const customConstraintHint = document.createElement("div");
    customConstraintHint.className = "field-hint";
    customConstraintHint.style.fontSize = "12px";
    customConstraintHint.style.color = "#666";
    customConstraintHint.style.marginTop = "5px";
    customConstraintHint.style.marginBottom = "10px";
    customConstraintHint.textContent = "可以自由输入任何约束要求，会直接添加到系统提示词中。例如：特定姿势、表情、动作、背景元素等。";
    customConstraintField.appendChild(customConstraintHint);
    
    contentEl.appendChild(customConstraintField);
    
    // 提示文案
    const hintDiv = document.createElement("div");
    hintDiv.className = "field";
    hintDiv.style.marginTop = "12px";
    hintDiv.style.padding = "12px";
    hintDiv.style.background = "rgba(126, 211, 33, 0.1)";
    hintDiv.style.borderRadius = "8px";
    hintDiv.style.border = "1px solid rgba(126, 211, 33, 0.3)";
    hintDiv.style.fontSize = "13px";
    hintDiv.style.color = "var(--keroro-text-muted)";
    hintDiv.style.lineHeight = "1.6";
    hintDiv.innerHTML = "该步骤会同时生成静态图像提示词 <code>caption</code> 和视频提示词 <code>video_prompt</code>，视频提示词可供可灵视频步骤使用。";
    contentEl.appendChild(hintDiv);
    
    // 生成视频提示词 checkbox
    const checkboxField = document.createElement("div");
    checkboxField.className = "field";
    const checkboxLabel = document.createElement("label");
    checkboxLabel.style.display = "flex";
    checkboxLabel.style.alignItems = "center";
    checkboxLabel.style.gap = "8px";
    checkboxLabel.style.cursor = "pointer";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = step.params.enable_video_prompt !== false; // 默认 true
    checkbox.onchange = () => {
      step.params.enable_video_prompt = checkbox.checked;
      updateWorkflowPreview();
    };
    const checkboxText = document.createElement("span");
    checkboxText.textContent = "生成视频提示词（video_prompt）";
    checkboxLabel.appendChild(checkbox);
    checkboxLabel.appendChild(checkboxText);
    checkboxField.appendChild(checkboxLabel);
    contentEl.appendChild(checkboxField);
  } else if (step.type === "runninghub_app") {
    const f1 = createField("RunningHub WebApp ID", "input", null, step.params.webapp_id || "", (val) => { step.params.webapp_id = val; updateWorkflowPreview(); });
    contentEl.appendChild(f1);
    
    const f2 = createField("实例类型", "input", null, step.params.instance_type || "", (val) => { step.params.instance_type = val; updateWorkflowPreview(); });
    contentEl.appendChild(f2);
    
    const f3 = createField("保存文件后缀", "input", null, step.params.filename_suffix || step.id, (val) => { step.params.filename_suffix = val; updateWorkflowPreview(); });
    contentEl.appendChild(f3);
    
    // 上游步骤选择（可选，用于指定使用哪个步骤的输出）
    const usesOptions = [
      { value: "", text: "-- 自动查找（推荐）--" }
    ];
    // 添加所有可能有输出的步骤（包括 qwen_prompt, vision_prompt, gemini_generate_model 等）
    workflow.steps.forEach((s, index) => {
      if (s.id !== step.id) {
        const stepIndex = index + 1;
        const stepTypeConfig = STEP_TYPES[s.type];
        const stepName = stepTypeConfig ? stepTypeConfig.name : s.type;
        // 优先显示可能有 JSON 输出的步骤
        if (s.type === "qwen_prompt" || s.type === "vision_prompt" || s.type === "gemini_generate_model") {
          usesOptions.push({ 
            value: s.id, 
            text: `#${stepIndex} ${s.id} (${stepName}) ⭐` 
          });
        } else {
          usesOptions.push({ 
            value: s.id, 
            text: `#${stepIndex} ${s.id} (${stepName})` 
          });
        }
      }
    });
    const fUses = createField("上游步骤（可选）", "select", usesOptions, step.params.uses?.[0] || "", (val) => {
      if (val) {
        step.params.uses = [val];
      } else {
        step.params.uses = [];
      }
      updateWorkflowPreview();
    });
    const usesHint = document.createElement("div");
    usesHint.className = "field-hint";
    usesHint.style.fontSize = "12px";
    usesHint.style.color = "#666";
    usesHint.style.marginTop = "-10px";
    usesHint.style.marginBottom = "10px";
    usesHint.style.lineHeight = "1.5";
    usesHint.innerHTML = "选择上游步骤以指定使用哪个步骤的输出。<br/>" +
      "留空则自动查找有输出的步骤（优先使用 vision_prompt/qwen_prompt 的 JSON 输出）。<br/>" +
      "⭐ 标记的步骤通常有 JSON 输出，更适合作为 STRING 节点的输入源。";
    fUses.appendChild(usesHint);
    contentEl.appendChild(fUses);
    
    // 智能绑定选项
    const autoBindField = document.createElement("div");
    autoBindField.className = "field";
    const autoBindLabel = document.createElement("label");
    autoBindLabel.style.display = "flex";
    autoBindLabel.style.alignItems = "center";
    autoBindLabel.style.gap = "8px";
    autoBindLabel.style.cursor = "pointer";
    const autoBindCheckbox = document.createElement("input");
    autoBindCheckbox.type = "checkbox";
    // 默认启用智能绑定（如果 bindingsJson 为空或为 "{}"）
    const isBindingsEmpty = !step.params.bindingsJson || step.params.bindingsJson.trim() === "{}";
    autoBindCheckbox.checked = step.params.auto_bind !== false && isBindingsEmpty;
    let bindingsTextarea = null; // 声明为 let，稍后会被赋值
    autoBindCheckbox.onchange = () => {
      step.params.auto_bind = autoBindCheckbox.checked;
      // 如果启用智能绑定，清空 bindingsJson
      if (autoBindCheckbox.checked) {
        step.params.bindingsJson = "{}";
        if (bindingsTextarea) bindingsTextarea.value = "{}";
      }
      updateWorkflowPreview();
    };
    const autoBindText = document.createElement("span");
    autoBindText.textContent = "启用智能绑定";
    autoBindLabel.appendChild(autoBindCheckbox);
    autoBindLabel.appendChild(autoBindText);
    autoBindField.appendChild(autoBindLabel);
    
    // 智能绑定说明
    const autoBindHint = document.createElement("div");
    autoBindHint.className = "field-hint";
    autoBindHint.style.fontSize = "12px";
    autoBindHint.style.color = "#666";
    autoBindHint.style.marginTop = "4px";
    autoBindHint.style.marginBottom = "10px";
    autoBindHint.style.lineHeight = "1.5";
    autoBindHint.innerHTML = "智能绑定会自动：<br/>" +
      "• 识别 WebApp 的节点类型（STRING/IMAGE/AUDIO/VIDEO）<br/>" +
      "• 匹配上游步骤的输出（JSON 文本或图片）<br/>" +
      "• 生成绑定配置（STRING 节点使用整个 JSON 或指定字段，IMAGE 节点使用图片）<br/>" +
      "• 如果指定的上游步骤不存在，会自动查找所有可用的步骤";
    autoBindField.appendChild(autoBindHint);
    contentEl.appendChild(autoBindField);
    
    const f4 = createField("绑定配置 JSON（手动配置）", "textarea", null, step.params.bindingsJson || "{}", (val) => { 
      step.params.bindingsJson = val; 
      // 如果手动填写了 bindingsJson，取消智能绑定
      if (val && val.trim() !== "{}") {
        step.params.auto_bind = false;
        autoBindCheckbox.checked = false;
      } else {
        // 如果清空了，重新启用智能绑定
        step.params.auto_bind = true;
        autoBindCheckbox.checked = true;
      }
      updateWorkflowPreview(); 
    });
    const bindingsTextareaEl = f4.querySelector("textarea");
    if (bindingsTextareaEl) {
      bindingsTextarea = bindingsTextareaEl;
      bindingsTextarea.style.fontFamily = "monospace";
      bindingsTextarea.style.fontSize = "12px";
      bindingsTextarea.rows = 8;
    }
    const bindingsHint = document.createElement("div");
    bindingsHint.className = "field-hint";
    bindingsHint.style.fontSize = "12px";
    bindingsHint.style.color = "#666";
    bindingsHint.style.marginTop = "-10px";
    bindingsHint.style.marginBottom = "10px";
    bindingsHint.textContent = "手动填写绑定配置时会自动禁用智能绑定。留空或填写 {} 可重新启用智能绑定。";
    f4.appendChild(bindingsHint);
    contentEl.appendChild(f4);
  } else if (step.type === "gemini_edit") {
    const providerOptions = [
      { value: "t8star", text: "t8star" },
      { value: "comfly", text: "comfly" },
      { value: "cherryin", text: "cherryin" },
      { value: "aihubmix", text: "aihubmix" },
      { value: "grsai", text: "grsai" }
    ];
    console.log("[workflow.js] gemini_edit provider options:", providerOptions);
    const f1 = createField("提供商", "select", providerOptions, step.params.provider || "t8star", (val) => { step.params.provider = val; updateWorkflowPreview(); });
    contentEl.appendChild(f1);
    
    const f2 = createField("模式", "select", [
      { value: "single", text: "单件 (single)" },
      { value: "multi", text: "多件 (multi)" }
    ], step.params.mode || "multi", (val) => { step.params.mode = val; updateWorkflowPreview(); });
    contentEl.appendChild(f2);
    
    // 年龄段预设
    const f3a = createField("年龄段预设", "select", [
      { value: "", text: "不指定（使用默认）" },
      { value: "small_kid", text: "小童 (3-7岁)" },
      { value: "big_kid", text: "大童 (8-12岁)" },
      { value: "adult", text: "成人 (18-30岁)" }
    ], step.params.age_group || "", (val) => { step.params.age_group = val || undefined; updateWorkflowPreview(); });
    contentEl.appendChild(f3a);
    
    // 性别预设
    const f3g = createField("性别预设", "select", [
      { value: "", text: "跟随上游提示词步骤" },
      { value: "female", text: "女" },
      { value: "male", text: "男" }
    ], step.params.gender || "", (val) => { step.params.gender = val || undefined; updateWorkflowPreview(); });
    contentEl.appendChild(f3g);
    
    // 场景预设
    const f3b = createField("场景预设", "select", [
      { value: "", text: "不指定（使用默认）" },
      { value: "home", text: "室内 (home)" },
      { value: "outdoor", text: "室外 (outdoor)" }
    ], step.params.scene_preset || step.params.preset || "", (val) => { 
      step.params.scene_preset = val || undefined;
      step.params.preset = val || undefined;
      updateWorkflowPreview(); 
    });
    contentEl.appendChild(f3b);
    
    const f4 = createField("基础图片来源", "select", getImageSourceOptions(step.id), step.params.base_from || "", (val) => { step.params.base_from = val; updateWorkflowPreview(); });
    contentEl.appendChild(f4);
    
    const f5 = createField("换装部位", "select", [
      { value: "full", text: "整套 (full)" },
      { value: "top", text: "仅上衣 (top)" },
      { value: "bottom", text: "仅裤子 (bottom)" }
    ], step.params.target_part || "full", (val) => { step.params.target_part = val; updateWorkflowPreview(); });
    contentEl.appendChild(f5);
    
    const f6 = createField("裁切模式", "select", [
      { value: "none", text: "不裁切 (none)" },
      { value: "auto_from_part", text: "自动裁切 (auto_from_part)" }
    ], step.params.crop_mode || "none", (val) => { step.params.crop_mode = val; updateWorkflowPreview(); });
    contentEl.appendChild(f6);
    
    const f7 = createField("上装来源", "select", getImageSourceOptions(step.id), step.params.cloth_slot_top || "slot2", (val) => { step.params.cloth_slot_top = val; updateWorkflowPreview(); });
    contentEl.appendChild(f7);
    
    const f8 = createField("下装来源", "select", getImageSourceOptions(step.id), step.params.cloth_slot_bottom || "slot3", (val) => { step.params.cloth_slot_bottom = val; updateWorkflowPreview(); });
    contentEl.appendChild(f8);
    
    const f9 = createField("提示词版本", "select", [
      { value: "legacy", text: "旧版 (legacy)" },
      { value: "v1", text: "选项一：替换整套 (v1)" },
      { value: "v2", text: "选项二：仅替换上衣 (v2)" },
      { value: "v3", text: "选项三：仅替换裤子 (v3)" }
    ], step.params.prompt_version || "legacy", (val) => { step.params.prompt_version = val; updateWorkflowPreview(); });
    contentEl.appendChild(f9);
    
    const f10 = createField("输出文件名后缀", "input", null, step.params.filename_suffix || step.id, (val) => { step.params.filename_suffix = val; updateWorkflowPreview(); });
    contentEl.appendChild(f10);
    
    const f11 = createField("自定义 Gemini 提示词", "textarea", null, step.params.prompt || "", (val) => { step.params.prompt = val; updateWorkflowPreview(); });
    contentEl.appendChild(f11);
  } else if (step.type === "gemini_edit_custom") {
    const providerOptions = [
      { value: "t8star", text: "t8star" },
      { value: "comfly", text: "comfly" },
      { value: "cherryin", text: "cherryin" },
      { value: "aihubmix", text: "aihubmix" },
      { value: "grsai", text: "grsai" }
    ];
    console.log("[workflow.js] gemini_edit_custom provider options:", providerOptions);
    const f1 = createField("提供商", "select", providerOptions, step.params.provider || "t8star", (val) => { step.params.provider = val; updateWorkflowPreview(); });
    contentEl.appendChild(f1);
    
    const f2 = createField("输出图片数量", "select", [
      { value: 1, text: "1 张" },
      { value: 2, text: "2 张" },
      { value: 3, text: "3 张" },
      { value: 4, text: "4 张" }
    ], step.params.output_count || 1, (val) => { step.params.output_count = Number(val); updateWorkflowPreview(); });
    contentEl.appendChild(f2);
    
    // 图片来源列表（多选下拉框）
    const f3 = document.createElement("div");
    f3.className = "field";
    const l3 = document.createElement("label");
      l3.innerHTML = "图片来源列表（可多选）<br><small style='color: var(--keroro-text-muted);'>支持选择 slot1/slot2/slot3/slot4 或前面步骤的输出</small>";
    const selIS = document.createElement("select");
    selIS.multiple = true;
    selIS.style.minHeight = "100px";
    const sourceOptions = getImageSourceOptions(step.id);
    const currentSources = step.params.image_sources || ["slot1"];
    sourceOptions.forEach(opt => {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.text;
      if (currentSources.includes(opt.value)) option.selected = true;
      selIS.appendChild(option);
    });
    selIS.onchange = () => {
      step.params.image_sources = Array.from(selIS.selectedOptions).map(opt => opt.value);
      // 图片来源列表直接更新步骤参数，不需要更新工作流预览
      // 工作流预览会在关闭模态框或保存时更新
    };
    f3.appendChild(l3);
    f3.appendChild(selIS);
    contentEl.appendChild(f3);
    
    const f4 = createField("输出文件名后缀", "input", null, step.params.filename_suffix || step.id, (val) => { step.params.filename_suffix = val; updateWorkflowPreview(); });
    contentEl.appendChild(f4);
    
    // 提示词来源选择器
    const promptSourceOptions = getPromptSourceOptions();
    // 添加所有可能有 JSON 输出的步骤（不仅仅是 qwen_prompt 和 vision_prompt）
    workflow.steps.forEach((s, idx) => {
      if (s.id !== step.id && (s.type === "qwen_prompt" || s.type === "vision_prompt" || s.type === "gemini_generate_model")) {
        const stepIndex = idx + 1;
        const stepTypeConfig = STEP_TYPES[s.type];
        const stepName = stepTypeConfig ? stepTypeConfig.name : s.type;
        // 检查是否已存在
        if (!promptSourceOptions.find(opt => opt.value === s.id)) {
          promptSourceOptions.push({ 
            value: s.id, 
            text: `⭐ #${stepIndex} ${s.id} (${stepName})` 
          });
        }
      }
    });
    
    const f5 = createField("提示词来源（可选）", "select", promptSourceOptions, step.params.prompt_from_step || "", (val) => { 
      step.params.prompt_from_step = val || undefined; 
      updateWorkflowPreview(); 
    });
    contentEl.appendChild(f5);
    
    // JSON 字段选择器（仅在选择了提示词来源时显示）
    const f5b = createField("JSON 字段", "select", [
      { value: "caption", text: "caption (标题/描述)" },
      { value: "video_prompt", text: "video_prompt (视频提示词)" },
      { value: "appearance", text: "appearance (外观描述)" },
      { value: "subject", text: "subject (主体描述)" },
      { value: "foreground", text: "foreground (前景)" },
      { value: "midground", text: "midground (中景)" },
      { value: "background", text: "background (背景)" },
      { value: "composition", text: "composition (构图)" },
      { value: "visual_guidance", text: "visual_guidance (视觉指导)" },
      { value: "color_tone", text: "color_tone (色调)" },
      { value: "lighting_mood", text: "lighting_mood (光影氛围)" },
      { value: "*", text: "* (整个 JSON 对象，转为字符串)" }
    ], step.params.prompt_json_key || "caption", (val) => { 
      step.params.prompt_json_key = val || "caption"; 
      updateWorkflowPreview(); 
    });
    // 如果未选择提示词来源，禁用 JSON 字段选择器
    if (!step.params.prompt_from_step) {
      f5b.querySelector("select").disabled = true;
      f5b.querySelector("select").style.opacity = "0.5";
    }
    // 监听提示词来源变化，动态启用/禁用 JSON 字段选择器
    f5.querySelector("select").onchange = () => {
      const promptFromStep = f5.querySelector("select").value;
      step.params.prompt_from_step = promptFromStep || undefined;
      const jsonKeySelect = f5b.querySelector("select");
      if (promptFromStep) {
        jsonKeySelect.disabled = false;
        jsonKeySelect.style.opacity = "1";
      } else {
        jsonKeySelect.disabled = true;
        jsonKeySelect.style.opacity = "0.5";
      }
      updateWorkflowPreview();
    };
    contentEl.appendChild(f5b);
    
    const f5c = createField("自定义 Gemini 提示词（必填，如果已选择提示词来源则作为补充）", "textarea", null, step.params.prompt || "", (val) => { step.params.prompt = val; updateWorkflowPreview(); });
    contentEl.appendChild(f5c);
    
    // 输入图是否传递到下一步
    const f6 = document.createElement("div");
    f6.className = "field";
    const l6 = document.createElement("label");
    l6.textContent = "将输入图传递到下一步";
    const checkbox6 = document.createElement("input");
    checkbox6.type = "checkbox";
    checkbox6.checked = step.params.pass_input_images !== false; // 默认 true
    checkbox6.onchange = () => {
      step.params.pass_input_images = checkbox6.checked;
      updateWorkflowPreview();
    };
    const label6 = document.createElement("label");
    label6.style.display = "flex";
    label6.style.alignItems = "center";
    label6.style.gap = "8px";
    label6.appendChild(checkbox6);
    label6.appendChild(document.createTextNode("启用后将输入图也传递到下一步（默认启用）"));
    f6.appendChild(label6);
    contentEl.appendChild(f6);
  } else if (step.type === "gemini_generate") {
    // Gemini Provider
    const providerOptions = [
      { value: "t8star", text: "t8star" },
      { value: "comfly", text: "comfly" },
      { value: "cherryin", text: "cherryin" },
      { value: "aihubmix", text: "aihubmix" },
      { value: "grsai", text: "grsai" }
    ];
    console.log("[workflow.js] gemini_generate provider options:", providerOptions);
    const f1 = createField("Gemini Provider", "select", providerOptions, step.params.provider || "t8star", (val) => { step.params.provider = val; updateWorkflowPreview(); });
    contentEl.appendChild(f1);
    
    // 上游打标步骤
    const f2 = createField("上游打标步骤", "select", getPromptSourceOptions(), step.params.base_prompt_from || "", (val) => { step.params.base_prompt_from = val || undefined; updateWorkflowPreview(); });
    contentEl.appendChild(f2);
    
    // 自定义 prompt 模板
    const f3 = document.createElement("div");
    f3.className = "field";
    const l3 = document.createElement("label");
    l3.textContent = "自定义 prompt 模板（可选）";
    f3.appendChild(l3);
    const ta3 = document.createElement("textarea");
    ta3.value = step.params.prompt_template || "";
    ta3.placeholder = "可以用 {caption} / {style_mood} / {scene_preset} / {ip_brand} 这些占位符";
    ta3.rows = 4;
    ta3.oninput = () => { step.params.prompt_template = ta3.value || undefined; updateWorkflowPreview(); };
    f3.appendChild(ta3);
    contentEl.appendChild(f3);
    
    // Prompt（必填）- 支持从上游步骤获取或手动输入
    const f4 = document.createElement("div");
    f4.className = "field";
    const l4 = document.createElement("label");
    l4.textContent = "Prompt（必填）";
    f4.appendChild(l4);
    
    // Prompt 来源选择
    const promptSourceSelect = document.createElement("select");
    promptSourceSelect.style.marginBottom = "8px";
    const promptSourceOptions = [
      { value: "manual", text: "手动输入" },
      { value: "from_step", text: "从生成提示词节点获取" }
    ];
    // 判断当前是手动输入还是从步骤获取（使用 base_prompt_from 保持与后端一致）
    const currentPromptSource = step.params.base_prompt_from ? "from_step" : "manual";
    promptSourceOptions.forEach(opt => {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.text;
      if (opt.value === currentPromptSource) option.selected = true;
      promptSourceSelect.appendChild(option);
    });
    f4.appendChild(promptSourceSelect);
    
    // 上游步骤选择（当选择"从生成提示词节点获取"时显示）
    const promptStepSelectWrapper = document.createElement("div");
    promptStepSelectWrapper.style.display = currentPromptSource === "from_step" ? "block" : "none";
    promptStepSelectWrapper.style.marginBottom = "8px";
    const promptStepSelect = document.createElement("select");
    const promptStepOptions = [
      { value: "", text: "-- 选择生成提示词步骤 --" },
      ...workflow.steps
        .filter(s => s.id !== step.id && (s.type === "qwen_prompt" || s.type === "vision_prompt"))
        .map(s => ({ value: s.id, text: `${s.id} (${s.type === "qwen_prompt" ? "Qwen 提示词生成" : "视觉提示词"})` }))
    ];
    promptStepOptions.forEach(opt => {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.text;
      if (opt.value === (step.params.base_prompt_from || "")) option.selected = true;
      promptStepSelect.appendChild(option);
    });
    promptStepSelectWrapper.appendChild(promptStepSelect);
    f4.appendChild(promptStepSelectWrapper);
    
    // 手动输入框（当选择"手动输入"时显示）
    const ta4 = document.createElement("textarea");
    ta4.value = step.params.prompt || "";
    ta4.placeholder = "输入生成图片的提示词";
    ta4.rows = 4;
    ta4.style.display = currentPromptSource === "manual" ? "block" : "none";
    ta4.oninput = () => { 
      step.params.prompt = ta4.value; 
      // 如果手动输入，清除 base_prompt_from
      if (promptSourceSelect.value === "manual") {
        step.params.base_prompt_from = undefined;
      }
      updateWorkflowPreview(); 
    };
    f4.appendChild(ta4);
    
    // 切换来源时的处理
    promptSourceSelect.onchange = () => {
      if (promptSourceSelect.value === "from_step") {
        promptStepSelectWrapper.style.display = "block";
        ta4.style.display = "none";
        step.params.base_prompt_from = promptStepSelect.value || undefined;
        step.params.prompt = undefined; // 清除手动输入的 prompt
      } else {
        promptStepSelectWrapper.style.display = "none";
        ta4.style.display = "block";
        step.params.base_prompt_from = undefined;
        step.params.prompt = ta4.value || "";
      }
      updateWorkflowPreview();
    };
    
    // 上游步骤选择变化时的处理
    promptStepSelect.onchange = () => {
      step.params.base_prompt_from = promptStepSelect.value || undefined;
      step.params.prompt = undefined; // 清除手动输入的 prompt
      updateWorkflowPreview();
    };
    
    contentEl.appendChild(f4);
    
    // 宽高比
    const f5 = createField("宽高比", "select", [
      { value: "1:1", text: "1:1 (正方形)" },
      { value: "3:4", text: "3:4 (竖图)" },
      { value: "4:3", text: "4:3 (横图)" },
      { value: "16:9", text: "16:9 (宽屏)" },
      { value: "9:16", text: "9:16 (竖屏)" }
    ], step.params.aspect_ratio || "3:4", (val) => { step.params.aspect_ratio = val; updateWorkflowPreview(); });
    contentEl.appendChild(f5);
    
    // 图片尺寸
    const f6 = createField("图片尺寸", "select", [
      { value: "1K", text: "1K" },
      { value: "2K", text: "2K" },
      { value: "4K", text: "4K" }
    ], step.params.image_size || "2K", (val) => { step.params.image_size = val; updateWorkflowPreview(); });
    contentEl.appendChild(f6);
    
    // Temperature 和 Top P
    const f7Row = document.createElement("div");
    f7Row.className = "field-row";
    const f7a = document.createElement("div");
    f7a.className = "field";
    const l7a = document.createElement("label");
    l7a.textContent = "Temperature (0.0~2.0)";
    const inp7a = document.createElement("input");
    inp7a.type = "number";
    inp7a.min = "0.0";
    inp7a.max = "2.0";
    inp7a.step = "0.1";
    inp7a.value = step.params.temperature !== undefined ? step.params.temperature : 0.8;
    inp7a.oninput = () => { step.params.temperature = parseFloat(inp7a.value) || 0.8; updateWorkflowPreview(); };
    f7a.appendChild(l7a);
    f7a.appendChild(inp7a);
    const f7b = document.createElement("div");
    f7b.className = "field";
    const l7b = document.createElement("label");
    l7b.textContent = "Top P (0.5~1.0)";
    const inp7b = document.createElement("input");
    inp7b.type = "number";
    inp7b.min = "0.5";
    inp7b.max = "1.0";
    inp7b.step = "0.05";
    inp7b.value = step.params.top_p !== undefined ? step.params.top_p : 0.95;
    inp7b.oninput = () => { step.params.top_p = parseFloat(inp7b.value) || 0.95; updateWorkflowPreview(); };
    f7b.appendChild(l7b);
    f7b.appendChild(inp7b);
    f7Row.appendChild(f7a);
    f7Row.appendChild(f7b);
    contentEl.appendChild(f7Row);
    
    // Max Tokens
    const f8 = createField("Max Tokens", "input", null, step.params.max_tokens || 4096, (val) => { step.params.max_tokens = Number(val) || 4096; updateWorkflowPreview(); });
    f8.querySelector("input").type = "number";
    f8.querySelector("input").min = "1";
    contentEl.appendChild(f8);
    
    // 模型名称（可选）
    const f9 = createField("模型名称（可选）", "input", null, step.params.model || "", (val) => { step.params.model = val || undefined; updateWorkflowPreview(); });
    contentEl.appendChild(f9);
    
    // 保存文件名后缀
    const f10 = createField("保存文件名后缀", "input", null, step.params.filename_suffix || "gemini_generate", (val) => { step.params.filename_suffix = val; updateWorkflowPreview(); });
    contentEl.appendChild(f10);
  } else if (step.type === "compare_image") {
    const f1 = createField("原图来源", "select", getImageSourceOptions(step.id), step.params.original_source || "slot1", (val) => { step.params.original_source = val; updateWorkflowPreview(); });
    contentEl.appendChild(f1);
    
    const f2 = createField("新图来源", "select", getImageSourceOptions(step.id), step.params.new_source || "", (val) => { step.params.new_source = val; updateWorkflowPreview(); });
    contentEl.appendChild(f2);
    
    const f3 = createField("输出文件名后缀", "input", null, step.params.filename_suffix || step.id, (val) => { step.params.filename_suffix = val; updateWorkflowPreview(); });
    contentEl.appendChild(f3);
  } else if (step.type === "gemini_generate_model") {
    // Gemini Provider
    const providerOptions = [
      { value: "t8star", text: "t8star" },
      { value: "comfly", text: "comfly" },
      { value: "cherryin", text: "cherryin" },
      { value: "aihubmix", text: "aihubmix" },
      { value: "grsai", text: "grsai" }
    ];
    console.log("[workflow.js] gemini_generate_model provider options:", providerOptions);
    const f1 = createField("Gemini Provider", "select", providerOptions, step.params.provider || "t8star", (val) => { step.params.provider = val; updateWorkflowPreview(); });
    contentEl.appendChild(f1);
    
    // 上游打标步骤
    const f2 = createField("上游打标步骤", "select", getPromptSourceOptions(), step.params.base_prompt_from || "", (val) => { step.params.base_prompt_from = val || undefined; updateWorkflowPreview(); });
    contentEl.appendChild(f2);
    
    // 年龄段预设
    const f2a = createField("年龄段预设", "select", [
      { value: "", text: "不指定（使用默认）" },
      { value: "small_kid", text: "小童 (3-7岁)" },
      { value: "big_kid", text: "大童 (8-12岁)" },
      { value: "adult", text: "成人 (18-30岁)" }
    ], step.params.age_group || "", (val) => { step.params.age_group = val || undefined; updateWorkflowPreview(); });
    contentEl.appendChild(f2a);
    
    // 场景预设
    const f2b = createField("场景预设", "select", [
      { value: "", text: "不指定（使用默认）" },
      { value: "outdoor_park", text: "户外公园" },
      { value: "outdoor_street", text: "户外街道" },
      { value: "indoor_home", text: "室内家居" },
      { value: "indoor_studio", text: "室内影棚" },
      { value: "indoor_classroom", text: "室内教室" },
      { value: "indoor_playground", text: "室内游乐场" },
      { value: "outdoor_beach", text: "户外海滩" },
      { value: "outdoor_mountain", text: "户外山景" },
      { value: "outdoor_garden", text: "户外花园" },
      { value: "indoor_mall", text: "室内商场" }
    ], step.params.scene_preset || "", (val) => { step.params.scene_preset = val || undefined; updateWorkflowPreview(); });
    contentEl.appendChild(f2b);
    
    // 服装参考图片（多选 checkbox）
    const f3 = document.createElement("div");
    f3.className = "field";
    const l3 = document.createElement("label");
    l3.textContent = "服装参考图片（多选）";
    f3.appendChild(l3);
    const checkboxContainer = document.createElement("div");
    checkboxContainer.style.display = "flex";
    checkboxContainer.style.gap = "12px";
    checkboxContainer.style.marginTop = "8px";
    ["slot1", "slot2", "slot3", "slot4"].forEach(slot => {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `cloth_${step.id}_${slot}`;
      checkbox.checked = (step.params.cloth_slots || ["slot1", "slot2", "slot3"]).includes(slot);
      checkbox.onchange = () => {
        const slots = step.params.cloth_slots || ["slot1", "slot2", "slot3"];
        if (checkbox.checked && !slots.includes(slot)) {
          slots.push(slot);
        } else if (!checkbox.checked && slots.includes(slot)) {
          slots.splice(slots.indexOf(slot), 1);
        }
        step.params.cloth_slots = slots;
        updateWorkflowPreview();
      };
      const label = document.createElement("label");
      label.htmlFor = `cloth_${step.id}_${slot}`;
      label.textContent = slot === "slot1" ? "图一 (slot1)" : slot === "slot2" ? "图二 (slot2)" : "图三 (slot3)";
      label.style.marginLeft = "4px";
      const wrapper = document.createElement("div");
      wrapper.appendChild(checkbox);
      wrapper.appendChild(label);
      checkboxContainer.appendChild(wrapper);
    });
    f3.appendChild(checkboxContainer);
    contentEl.appendChild(f3);
    
    // 附加参考图（多选下拉）
    const f4 = document.createElement("div");
    f4.className = "field";
    const l4 = document.createElement("label");
    l4.textContent = "附加参考图（来自其它步骤，可选）";
    f4.appendChild(l4);
    const multiSelect = document.createElement("select");
    multiSelect.multiple = true;
    multiSelect.style.minHeight = "80px";
    const allSteps = workflow.steps.filter(s => s.id !== step.id && (s.type === "runninghub_app" || s.type === "gemini_edit" || s.type === "gemini_generate" || s.type === "gemini_generate_model"));
    allSteps.forEach(s => {
      const option = document.createElement("option");
      option.value = s.id;
      option.textContent = `${s.id} (${s.type})`;
      if ((step.params.extra_images_from_steps || []).includes(s.id)) {
        option.selected = true;
      }
      multiSelect.appendChild(option);
    });
    multiSelect.onchange = () => {
      step.params.extra_images_from_steps = Array.from(multiSelect.selectedOptions).map(opt => opt.value);
      updateWorkflowPreview();
    };
    f4.appendChild(multiSelect);
    contentEl.appendChild(f4);
    
    // 输出比例
    const f5 = createField("输出比例", "select", [
      { value: "3:4", text: "3:4" },
      { value: "4:3", text: "4:3" },
      { value: "1:1", text: "1:1" },
      { value: "9:16", text: "9:16" }
    ], step.params.aspect_ratio || "3:4", (val) => { step.params.aspect_ratio = val; updateWorkflowPreview(); });
    contentEl.appendChild(f5);
    
    // 分辨率
    const f6 = createField("分辨率", "select", [
      { value: "1K", text: "1K" },
      { value: "2K", text: "2K" },
      { value: "4K", text: "4K" }
    ], step.params.image_size || "2K", (val) => { step.params.image_size = val; updateWorkflowPreview(); });
    contentEl.appendChild(f6);
    
    // 生成随机性（temperature 和 top_p）
    const f7Row = document.createElement("div");
    f7Row.className = "field-row";
    const f7a = document.createElement("div");
    f7a.className = "field";
    const l7a = document.createElement("label");
    l7a.textContent = "Temperature (0.1~1.2)";
    const inp7a = document.createElement("input");
    inp7a.type = "number";
    inp7a.min = "0.1";
    inp7a.max = "1.2";
    inp7a.step = "0.1";
    inp7a.value = step.params.temperature !== undefined ? step.params.temperature : 0.8;
    inp7a.oninput = () => { step.params.temperature = parseFloat(inp7a.value) || 0.8; updateWorkflowPreview(); };
    f7a.appendChild(l7a);
    f7a.appendChild(inp7a);
    const f7b = document.createElement("div");
    f7b.className = "field";
    const l7b = document.createElement("label");
    l7b.textContent = "Top P (0.5~1.0)";
    const inp7b = document.createElement("input");
    inp7b.type = "number";
    inp7b.min = "0.5";
    inp7b.max = "1.0";
    inp7b.step = "0.05";
    inp7b.value = step.params.top_p !== undefined ? step.params.top_p : 0.95;
    inp7b.oninput = () => { step.params.top_p = parseFloat(inp7b.value) || 0.95; updateWorkflowPreview(); };
    f7b.appendChild(l7b);
    f7b.appendChild(inp7b);
    f7Row.appendChild(f7a);
    f7Row.appendChild(f7b);
    contentEl.appendChild(f7Row);
    
    // 默认 prompt 模式
    const f8 = createField("默认 prompt 模式", "select", [
      { value: "auto", text: "auto" },
      { value: "simple", text: "simple" }
    ], step.params.prompt_version || "auto", (val) => { step.params.prompt_version = val; updateWorkflowPreview(); });
    contentEl.appendChild(f8);
    
    // 自定义 prompt 模板
    const f9 = document.createElement("div");
    f9.className = "field";
    const l9 = document.createElement("label");
    l9.textContent = "自定义 prompt 模板（可选）";
    f9.appendChild(l9);
    const ta9 = document.createElement("textarea");
    ta9.value = step.params.prompt_template || "";
    ta9.placeholder = "可以用 {caption} / {style_mood} / {scene_preset} / {ip_brand} 这些占位符";
    ta9.rows = 4;
    ta9.oninput = () => { step.params.prompt_template = ta9.value || undefined; updateWorkflowPreview(); };
    f9.appendChild(ta9);
    contentEl.appendChild(f9);
    
    // 保存文件名后缀
    const f10 = createField("保存文件名后缀", "input", null, step.params.filename_suffix || "gemini_model", (val) => { step.params.filename_suffix = val; updateWorkflowPreview(); });
    contentEl.appendChild(f10);
  } else if (step.type === "kling_image2video") {
    // base_from：图片来源下拉
    const f1 = createField("图片来源", "select", getImageSourceOptions(step.id), step.params.base_from || "", (val) => { step.params.base_from = val; updateWorkflowPreview(); });
    contentEl.appendChild(f1);
    
    // image_index：图片索引
    const f2 = createField("图片索引（-1表示最后一张）", "input", null, step.params.image_index !== undefined ? step.params.image_index : -1, (val) => { step.params.image_index = Number(val) || -1; updateWorkflowPreview(); });
    f2.querySelector("input").type = "number";
    f2.querySelector("input").min = "-1";
    contentEl.appendChild(f2);
    
    // model_name：模型名称
    const f3 = createField("模型名称", "input", null, step.params.model_name || "kling-v2-5", (val) => { step.params.model_name = val; updateWorkflowPreview(); });
    contentEl.appendChild(f3);
    
    // mode：模式
    const f4 = createField("模式", "select", [
      { value: "std", text: "标准 (std)" },
      { value: "pro", text: "Pro (pro)" }
    ], step.params.mode || "std", (val) => { step.params.mode = val; updateWorkflowPreview(); });
    contentEl.appendChild(f4);
    
    // prompt_from_step：视频提示词来源
    const promptSourceOptions = [
      { value: "", text: "不使用上游提示词（手动输入）" }
    ];
    workflow.steps.forEach(s => {
      if (s.type === "vision_prompt" || s.type === "qwen_prompt") {
        const stepIndex = workflow.steps.findIndex(st => st.id === s.id) + 1;
        promptSourceOptions.push({ 
          value: s.id, 
          text: `#${stepIndex} ${s.type} (${s.id})` 
        });
      }
    });
    const f5 = createField("视频提示词来源（可选）", "select", promptSourceOptions, step.params.prompt_from_step || "", (val) => { 
      step.params.prompt_from_step = val; 
      updateWorkflowPreview(); 
    });
    contentEl.appendChild(f5);
    
    // 提示文字
    const hint2 = document.createElement("div");
    hint2.className = "field-hint";
    hint2.style.fontSize = "12px";
    hint2.style.color = "#666";
    hint2.style.marginTop = "-10px";
    hint2.style.marginBottom = "10px";
    hint2.textContent = "如果不填写自定义 prompt，则会优先使用此步骤的 video_prompt；同时会自动基于该步骤的 age_group / gender / scene_preset 构造适合的儿童/成人视频描述。";
    contentEl.appendChild(hint2);
    
    // prompt：提示词
    const f6 = createField("提示词（儿童动效描述，留空则使用上游 video_prompt）", "textarea", null, step.params.prompt || "", (val) => { step.params.prompt = val; updateWorkflowPreview(); });
    f6.querySelector("textarea").placeholder = "留空则自动从上游 vision_prompt/qwen_prompt 步骤的 video_prompt 字段获取。如需手动输入，请填写儿童动效描述，例如：把小朋友和衣服做成轻微的动作，像是在开心走路或转身展示衣服，动作自然柔和，不要夸张摇晃。";
    f6.querySelector("textarea").rows = 3;
    contentEl.appendChild(f6);
    
    // negative_prompt：负向提示词
    const f7 = createField("负向提示词（可选）", "textarea", null, step.params.negative_prompt || "", (val) => { step.params.negative_prompt = val; updateWorkflowPreview(); });
    f7.querySelector("textarea").rows = 2;
    contentEl.appendChild(f7);
    
    // aspect_ratio：宽高比
    const f8 = createField("宽高比", "select", [
      { value: "auto", text: "根据输入图尺寸比例" },
      { value: "16:9", text: "16:9" },
      { value: "9:16", text: "9:16" },
      { value: "1:1", text: "1:1" },
      { value: "3:4", text: "3:4" }
    ], step.params.aspect_ratio || "auto", (val) => { step.params.aspect_ratio = val; updateWorkflowPreview(); });
    contentEl.appendChild(f8);
    
    // duration：时长
    const f9 = createField("视频时长（秒）", "input", null, step.params.duration || 5, (val) => { step.params.duration = Number(val) || 5; updateWorkflowPreview(); });
    f9.querySelector("input").type = "number";
    f9.querySelector("input").min = "1";
    f9.querySelector("input").max = "10";
    contentEl.appendChild(f9);
    
    // cfg_scale：CFG 引导强度
    const f10 = createField("CFG 引导强度", "input", null, step.params.cfg_scale !== undefined ? step.params.cfg_scale : 0.5, (val) => { step.params.cfg_scale = Number(val) || 0.5; updateWorkflowPreview(); });
    f10.querySelector("input").type = "number";
    f10.querySelector("input").min = "0";
    f10.querySelector("input").max = "1";
    f10.querySelector("input").step = "0.1";
    contentEl.appendChild(f10);
    
    // filename_suffix：文件名后缀
    const f11 = createField("输出文件名后缀", "input", null, step.params.filename_suffix || "kling_video", (val) => { step.params.filename_suffix = val; updateWorkflowPreview(); });
    contentEl.appendChild(f11);
  } else if (step.type === "gemini_model_from_clothes") {
    // Gemini 生模特（服装图）步骤
    const providerOptions = [
      { value: "t8star", text: "t8star" },
      { value: "comfly", text: "comfly" },
      { value: "cherryin", text: "cherryin" },
      { value: "aihubmix", text: "aihubmix" },
      { value: "grsai", text: "grsai" }
    ];
    const f1 = createField("Gemini Provider", "select", providerOptions, step.params.provider || "t8star", (val) => { step.params.provider = val; updateWorkflowPreview(); });
    contentEl.appendChild(f1);
    
    // 正面图来源（多选）
    const frontSourcesField = document.createElement("div");
    frontSourcesField.className = "field";
    const frontSourcesLabel = document.createElement("label");
    frontSourcesLabel.textContent = "正面图来源（多选）";
    frontSourcesField.appendChild(frontSourcesLabel);
    const frontSourcesSelect = document.createElement("select");
    frontSourcesSelect.multiple = true;
    frontSourcesSelect.style.minHeight = "80px";
    const sourceOptions = getImageSourceOptions(step.id);
    // 兼容旧版本：如果有front_source，转换为数组
    const currentFrontSources = step.params.front_sources || (step.params.front_source ? [step.params.front_source] : ["slot1"]);
    sourceOptions.forEach(opt => {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.text;
      if (currentFrontSources.includes(opt.value)) option.selected = true;
      frontSourcesSelect.appendChild(option);
    });
    frontSourcesSelect.onchange = () => {
      step.params.front_sources = Array.from(frontSourcesSelect.selectedOptions).map(opt => opt.value);
      // 移除旧版本的单个字段
      delete step.params.front_source;
      updateWorkflowPreview();
    };
    frontSourcesField.appendChild(frontSourcesSelect);
    contentEl.appendChild(frontSourcesField);
    
    // 背面图来源（多选，可选）
    const backSourcesField = document.createElement("div");
    backSourcesField.className = "field";
    const backSourcesLabel = document.createElement("label");
    backSourcesLabel.textContent = "背面图来源（可选，多选）";
    backSourcesField.appendChild(backSourcesLabel);
    const backSourcesSelect = document.createElement("select");
    backSourcesSelect.multiple = true;
    backSourcesSelect.style.minHeight = "80px";
    // 兼容旧版本：如果有back_source，转换为数组
    const currentBackSources = step.params.back_sources || (step.params.back_source ? [step.params.back_source].filter(s => s) : []);
    sourceOptions.forEach(opt => {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.text;
      if (currentBackSources.includes(opt.value)) option.selected = true;
      backSourcesSelect.appendChild(option);
    });
    backSourcesSelect.onchange = () => {
      step.params.back_sources = Array.from(backSourcesSelect.selectedOptions).map(opt => opt.value);
      // 移除旧版本的单个字段
      delete step.params.back_source;
      updateWorkflowPreview();
    };
    backSourcesField.appendChild(backSourcesSelect);
    contentEl.appendChild(backSourcesField);
    
    // 提示词来源选择
    const promptSourceField = document.createElement("div");
    promptSourceField.className = "field";
    const promptSourceLabel = document.createElement("label");
    promptSourceLabel.textContent = "提示词来源（可选）";
    promptSourceField.appendChild(promptSourceLabel);
    const promptSourceSelect = document.createElement("select");
    const promptSourceOptions = getPromptSourceOptions();
    promptSourceOptions.forEach(opt => {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.text;
      if (opt.value === (step.params.prompt_from_step || "")) option.selected = true;
      promptSourceSelect.appendChild(option);
    });
    promptSourceSelect.onchange = () => {
      step.params.prompt_from_step = promptSourceSelect.value || undefined;
      updateWorkflowPreview();
    };
    promptSourceField.appendChild(promptSourceSelect);
    contentEl.appendChild(promptSourceField);
    
    // JSON字段选择（仅在选择了提示词来源时显示）
    if (step.params.prompt_from_step) {
      const jsonKeyField = createField("JSON字段名", "input", null, step.params.prompt_json_key || "subject", (val) => { step.params.prompt_json_key = val || "subject"; updateWorkflowPreview(); });
      jsonKeyField.querySelector("input").placeholder = "subject（默认）或 *（使用整个JSON）";
      contentEl.appendChild(jsonKeyField);
    }
    
    const f4 = createField("服装描述", "input", null, step.params.garment_desc || "儿童服装套装", (val) => { step.params.garment_desc = val; updateWorkflowPreview(); });
    contentEl.appendChild(f4);
    
    const f5 = createField("场景风格", "select", [
      { value: "lifestyle", text: "lifestyle（生活场景）" },
      { value: "studio", text: "studio（摄影棚）" },
      { value: "outdoor", text: "outdoor（户外）" }
    ], step.params.scene_style || "lifestyle", (val) => { step.params.scene_style = val; updateWorkflowPreview(); });
    contentEl.appendChild(f5);
    
    const f6 = createField("模特姿态", "select", [
      { value: "natural", text: "natural（自然站立）" },
      { value: "sitting", text: "sitting（坐着）" },
      { value: "playing", text: "playing（玩耍）" }
    ], step.params.model_pose || "natural", (val) => { step.params.model_pose = val; updateWorkflowPreview(); });
    contentEl.appendChild(f6);
    
    const f7 = createField("宽高比", "select", [
      { value: "3:4", text: "3:4" },
      { value: "4:3", text: "4:3" },
      { value: "1:1", text: "1:1" }
    ], step.params.aspect_ratio || "3:4", (val) => { step.params.aspect_ratio = val; updateWorkflowPreview(); });
    contentEl.appendChild(f7);
    
    const f8 = createField("图片尺寸", "select", [
      { value: "1K", text: "1K" },
      { value: "2K", text: "2K" },
      { value: "4K", text: "4K" }
    ], step.params.image_size || "2K", (val) => { step.params.image_size = val; updateWorkflowPreview(); });
    contentEl.appendChild(f8);
    
    const f9 = createField("输出文件名后缀", "input", null, step.params.filename_suffix || "model", (val) => { step.params.filename_suffix = val; updateWorkflowPreview(); });
    contentEl.appendChild(f9);
  } else if (step.type === "gemini_ecom") {
    // Gemini 电商图步骤
    const providerOptions = [
      { value: "t8star", text: "t8star" },
      { value: "comfly", text: "comfly" },
      { value: "cherryin", text: "cherryin" },
      { value: "aihubmix", text: "aihubmix" },
      { value: "grsai", text: "grsai" }
    ];
    const f1 = createField("Gemini Provider", "select", providerOptions, step.params.provider || "t8star", (val) => { step.params.provider = val; updateWorkflowPreview(); });
    contentEl.appendChild(f1);
    
    // 输出类型改为复选框（类似原始脚本）
    const outputTypeField = document.createElement("div");
    outputTypeField.className = "field";
    const outputTypeLabel = document.createElement("label");
    outputTypeLabel.textContent = "生成选项：";
    outputTypeField.appendChild(outputTypeLabel);
    
    const checkboxesContainer = document.createElement("div");
    checkboxesContainer.style.display = "flex";
    checkboxesContainer.style.flexDirection = "column";
    checkboxesContainer.style.gap = "8px";
    checkboxesContainer.style.marginTop = "8px";
    
    // 生成主图复选框
    const mainCheckboxContainer = document.createElement("label");
    mainCheckboxContainer.style.display = "flex";
    mainCheckboxContainer.style.alignItems = "center";
    mainCheckboxContainer.style.gap = "8px";
    mainCheckboxContainer.style.cursor = "pointer";
    const mainCheckbox = document.createElement("input");
    mainCheckbox.type = "checkbox";
    mainCheckbox.checked = step.params.enable_main !== false; // 默认true
    mainCheckbox.onchange = () => {
      step.params.enable_main = mainCheckbox.checked;
      updateWorkflowPreview();
    };
    const mainCheckboxText = document.createElement("span");
    mainCheckboxText.textContent = "生成主图";
    mainCheckboxContainer.appendChild(mainCheckbox);
    mainCheckboxContainer.appendChild(mainCheckboxText);
    checkboxesContainer.appendChild(mainCheckboxContainer);
    
    // 生成背面图复选框
    const backCheckboxContainer = document.createElement("label");
    backCheckboxContainer.style.display = "flex";
    backCheckboxContainer.style.alignItems = "center";
    backCheckboxContainer.style.gap = "8px";
    backCheckboxContainer.style.cursor = "pointer";
    const backCheckbox = document.createElement("input");
    backCheckbox.type = "checkbox";
    backCheckbox.checked = step.params.enable_back === true;
    backCheckbox.onchange = () => {
      step.params.enable_back = backCheckbox.checked;
      updateWorkflowPreview();
    };
    const backCheckboxText = document.createElement("span");
    backCheckboxText.textContent = "生成背面图";
    backCheckboxContainer.appendChild(backCheckbox);
    backCheckboxContainer.appendChild(backCheckboxText);
    checkboxesContainer.appendChild(backCheckboxContainer);
    
    // 生成细节图复选框
    const detailCheckboxContainer = document.createElement("label");
    detailCheckboxContainer.style.display = "flex";
    detailCheckboxContainer.style.alignItems = "center";
    detailCheckboxContainer.style.gap = "8px";
    detailCheckboxContainer.style.cursor = "pointer";
    const detailCheckbox = document.createElement("input");
    detailCheckbox.type = "checkbox";
    detailCheckbox.checked = step.params.enable_detail === true;
    detailCheckbox.onchange = () => {
      step.params.enable_detail = detailCheckbox.checked;
      // 动态显示/隐藏细节图相关选项
      const detailOptionsField = document.getElementById("detail-options-field");
      if (detailOptionsField) {
        detailOptionsField.style.display = detailCheckbox.checked ? "block" : "none";
      }
      updateWorkflowPreview();
    };
    const detailCheckboxText = document.createElement("span");
    detailCheckboxText.textContent = "生成细节图";
    detailCheckboxContainer.appendChild(detailCheckbox);
    detailCheckboxContainer.appendChild(detailCheckboxText);
    checkboxesContainer.appendChild(detailCheckboxContainer);
    
    outputTypeField.appendChild(checkboxesContainer);
    contentEl.appendChild(outputTypeField);
    
    const f3 = createField("服装描述", "input", null, step.params.garment_desc || "儿童服装套装（上衣 + 下装）", (val) => { step.params.garment_desc = val; updateWorkflowPreview(); });
    contentEl.appendChild(f3);
    
    const f4 = createField("布局方式", "select", [
      { value: "平铺图", text: "平铺图" },
      { value: "挂拍图", text: "挂拍图" }
    ], step.params.layout || "平铺图", (val) => { step.params.layout = val; updateWorkflowPreview(); });
    contentEl.appendChild(f4);
    
    const f5 = createField("填充模式", "select", [
      { value: "有填充", text: "有填充（衣服鼓起来）" },
      { value: "无填充", text: "无填充（自然平铺）" }
    ], step.params.fill_mode || "有填充", (val) => { step.params.fill_mode = val; updateWorkflowPreview(); });
    contentEl.appendChild(f5);
    
    const f6 = document.createElement("div");
    f6.className = "field";
    const l6 = document.createElement("label");
    l6.textContent = "图片来源（多选）";
    f6.appendChild(l6);
    const sel6 = document.createElement("select");
    sel6.multiple = true;
    sel6.style.minHeight = "80px";
    const sourceOptions = getImageSourceOptions(step.id);
    const currentSources = step.params.image_sources || ["slot1", "slot2"];
    sourceOptions.forEach(opt => {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.text;
      if (currentSources.includes(opt.value)) option.selected = true;
      sel6.appendChild(option);
    });
    sel6.onchange = () => {
      step.params.image_sources = Array.from(sel6.selectedOptions).map(opt => opt.value);
      updateWorkflowPreview();
    };
    f6.appendChild(sel6);
    contentEl.appendChild(f6);
    
    // 细节图选项（仅在启用细节图时显示）
    const detailOptionsField = document.createElement("div");
    detailOptionsField.id = "detail-options-field";
    detailOptionsField.className = "field";
    detailOptionsField.style.display = step.params.enable_detail ? "block" : "none";
    
    const detailTypesLabel = document.createElement("label");
    detailTypesLabel.textContent = "细节类型（多选）";
    detailOptionsField.appendChild(detailTypesLabel);
    const detailTypesSelect = document.createElement("select");
    detailTypesSelect.multiple = true;
    detailTypesSelect.style.minHeight = "100px";
    const detailTypeOptions = [
      { value: "collar", text: "领口细节" },
      { value: "sleeve", text: "袖口细节" },
      { value: "hem", text: "下摆细节" },
      { value: "print", text: "印花/图案细节" },
      { value: "waistband", text: "裤腰细节" },
      { value: "fabric", text: "面料纹理" },
      { value: "ankle", text: "裤脚/袜口细节" },
      { value: "backneck", text: "后领与肩线细节" }
    ];
    const currentDetailTypes = step.params.detail_types || ["collar"];
    detailTypeOptions.forEach(opt => {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.text;
      if (currentDetailTypes.includes(opt.value)) option.selected = true;
      detailTypesSelect.appendChild(option);
    });
    detailTypesSelect.onchange = () => {
      step.params.detail_types = Array.from(detailTypesSelect.selectedOptions).map(opt => opt.value);
      if (step.params.detail_types.length === 0) {
        step.params.detail_types = ["collar"]; // 至少保留一个
        detailTypesSelect.options[0].selected = true;
      }
      updateWorkflowPreview();
    };
    detailOptionsField.appendChild(detailTypesSelect);
    
    const detailCountField = createField("每种细节图数量", "input", null, step.params.detail_count || 1, (val) => { step.params.detail_count = Number(val) || 1; updateWorkflowPreview(); });
    detailCountField.querySelector("input").type = "number";
    detailCountField.querySelector("input").min = "1";
    detailCountField.querySelector("input").max = "5";
    detailOptionsField.appendChild(detailCountField);
    
    contentEl.appendChild(detailOptionsField);
    
    const f9 = createField("宽高比", "select", [
      { value: "3:4", text: "3:4" },
      { value: "4:3", text: "4:3" },
      { value: "1:1", text: "1:1" }
    ], step.params.aspect_ratio || "3:4", (val) => { step.params.aspect_ratio = val; updateWorkflowPreview(); });
    contentEl.appendChild(f9);
    
    const f10 = createField("图片尺寸", "select", [
      { value: "1K", text: "1K" },
      { value: "2K", text: "2K" },
      { value: "4K", text: "4K" }
    ], step.params.image_size || "2K", (val) => { step.params.image_size = val; updateWorkflowPreview(); });
    contentEl.appendChild(f10);
    
    const f11 = createField("输出文件名后缀", "input", null, step.params.filename_suffix || "ecom", (val) => { step.params.filename_suffix = val; updateWorkflowPreview(); });
    contentEl.appendChild(f11);
  } else if (step.type === "gemini_pattern") {
    // Gemini 图案生成步骤
    const providerOptions = [
      { value: "t8star", text: "t8star" },
      { value: "comfly", text: "comfly" },
      { value: "cherryin", text: "cherryin" },
      { value: "aihubmix", text: "aihubmix" },
      { value: "grsai", text: "grsai" }
    ];
    const f1 = createField("Gemini Provider", "select", providerOptions, step.params.provider || "t8star", (val) => { step.params.provider = val; updateWorkflowPreview(); });
    contentEl.appendChild(f1);
    
    const f2 = createField("图案模式", "select", [
      { value: "graphic", text: "图形 (graphic)" },
      { value: "seamless", text: "无缝图案 (seamless)" },
      { value: "mockup_set", text: "套装Mockup (mockup_set)" },
      { value: "mockup_single", text: "单件Mockup (mockup_single)" }
    ], step.params.pattern_mode || "graphic", (val) => { step.params.pattern_mode = val; updateWorkflowPreview(); });
    contentEl.appendChild(f2);
    
    if (step.params.pattern_mode === "graphic" || step.params.pattern_mode === "seamless") {
      const f3 = createField("生成模式", "select", [
        { value: "Mode A", text: "Mode A: 元素重组 (参考图+提示词)" },
        { value: "Mode B", text: "Mode B: 直接处理 (参考图)" },
        { value: "Mode C", text: "Mode C: 纯文字生成" }
      ], step.params.generation_mode || "Mode A", (val) => { step.params.generation_mode = val; updateWorkflowPreview(); });
      contentEl.appendChild(f3);
      
      // 风格预设列表（从图案.py完整复制）
      const stylePresetOptions = [
        { value: "默认 (根据提示词)", text: "默认 (根据提示词)" },
        { value: "Y2K 千禧辣妹 (酸性/散点/重叠)", text: "Y2K 千禧辣妹 (酸性/散点/重叠)" },
        { value: "Boho 波西米亚 (自然/碎花/错落)", text: "Boho 波西米亚 (自然/碎花/错落)" },
        { value: "Retro 70s 复古 (流动/波浪/紧凑)", text: "Retro 70s 复古 (流动/波浪/紧凑)" },
        { value: "Streetwear 街头 (涂鸦/堆叠/硬朗)", text: "Streetwear 街头 (涂鸦/堆叠/硬朗)" },
        { value: "Cute Cartoon 童趣 (跳跃/大小对比)", text: "Cute Cartoon 童趣 (跳跃/大小对比)" },
        { value: "Minimalist Geometry (极简/非对齐)", text: "Minimalist Geometry (极简/非对齐)" },
        { value: "Dino Party 恐龙派对 (恐龙/足迹/岩石)", text: "Dino Party 恐龙派对" },
        { value: "Unicorn Dream 独角兽梦境 (独角兽/彩虹/公主)", text: "Unicorn Dream 独角兽梦境" },
        { value: "Space Explorer 太空冒险 (宇航员/星球/飞船)", text: "Space Explorer 太空冒险" },
        { value: "Candy Shop 糖果屋 (糖果/棒棒糖/棋盘格)", text: "Candy Shop 糖果屋" },
        { value: "Kawaii Animal Parade 软萌动物乐园", text: "Kawaii Animal Parade 软萌动物乐园" },
        { value: "Racing Car 赛道赛车 (赛车/闪电/格纹)", text: "Racing Car 赛道赛车" },
        { value: "Sport Varsity 校园运动 (球类/字母/徽章)", text: "Sport Varsity 校园运动" },
        { value: "Mermaid Ocean 人鱼海底 (美人鱼/贝壳/波纹)", text: "Mermaid Ocean 人鱼海底" },
        { value: "Jungle Safari 丛林探险 (动物/树叶/脚印)", text: "Jungle Safari 丛林探险" },
        { value: "Fairy Forest 仙子花园 (精灵/花朵/蘑菇)", text: "Fairy Forest 仙子花园" },
        { value: "Rainbow Hearts 彩虹小爱心", text: "Rainbow Hearts 彩虹小爱心" },
        { value: "Fruit Crush 多巴胺水果 (草莓/樱桃/柠檬)", text: "Fruit Crush 多巴胺水果" },
        { value: "Pixel Gamer 像素游戏 (像素/手柄/文字块)", text: "Pixel Gamer 像素游戏" },
        { value: "Comic Pop 漫画格子 (对话框/爆炸/网点)", text: "Comic Pop 漫画格子" },
        { value: "Spider Hero 蜘蛛英雄 (蛛网/城市/英雄剪影)", text: "Spider Hero 蜘蛛英雄" },
        { value: "Anime Girl 可爱二次元 (大眼女主/蝴蝶结)", text: "Anime Girl 可爱二次元" },
        { value: "Pastel Dream 淡彩梦境 (渐变/云朵/星星)", text: "Pastel Dream 淡彩梦境" },
        { value: "Minimal Line Doodle 极简线描 (线稿/单色)", text: "Minimal Line Doodle 极简线描" },
        { value: "Patchwork Quilt 拼布被子 (块状/格子/拼接)", text: "Patchwork Quilt 拼布被子" },
        { value: "Holiday Xmas 圣诞节日 (圣诞树/驯鹿/礼物)", text: "Holiday Xmas 圣诞节日" },
        { value: "Halloween Spooky Cute 万圣节萌鬼", text: "Halloween Spooky Cute 万圣节萌鬼" },
        { value: "Ocean Sailor 航海小水手 (条纹/锚/船)", text: "Ocean Sailor 航海小水手" },
        { value: "Construction Vehicles 工程车队 (挖掘机/卡车)", text: "Construction Vehicles 工程车队" },
        { value: "Farm Friends 农场伙伴 (奶牛/小鸡/稻草人)", text: "Farm Friends 农场伙伴" },
        { value: "Arctic Friends 北极伙伴 (企鹅/海豹/雪花)", text: "Arctic Friends 北极伙伴" },
        { value: "Pet Pals 宠物伙伴 (小狗/小猫)", text: "Pet Pals 宠物伙伴" },
        { value: "Bug Explorer 小虫探险 (瓢虫/蜻蜓/甲虫)", text: "Bug Explorer 小虫探险" },
        { value: "Forest Friends 森林伙伴 (狐狸/鹿/松鼠)", text: "Forest Friends 森林伙伴" },
        { value: "Space Robots 太空机器人", text: "Space Robots 太空机器人" },
        { value: "Pirate Adventure 海盗冒险", text: "Pirate Adventure 海盗冒险" },
        { value: "Knight Castle 骑士城堡", text: "Knight Castle 骑士城堡" },
        { value: "Princess Garden 公主花园", text: "Princess Garden 公主花园" },
        { value: "Super Minis 迷你英雄", text: "Super Minis 迷你英雄" },
        { value: "Fire Rescue 消防救援", text: "Fire Rescue 消防救援" },
        { value: "Police Patrol 警察巡逻", text: "Police Patrol 警察巡逻" },
        { value: "Airplane Sky 飞机天空", text: "Airplane Sky 飞机天空" },
        { value: "Train Station 火车站", text: "Train Station 火车站" },
        { value: "Boat Harbor 船港", text: "Boat Harbor 船港" },
        { value: "Hot Air Balloon 热气球", text: "Hot Air Balloon 热气球" },
        { value: "Fruit Garden 果园", text: "Fruit Garden 果园" },
        { value: "Veggie Crew 蔬菜乐队", text: "Veggie Crew 蔬菜乐队" },
        { value: "Sweet Bakery 甜品面包房", text: "Sweet Bakery 甜品面包房" },
        { value: "Ice Cream Land 冰淇淋王国", text: "Ice Cream Land 冰淇淋王国" },
        { value: "Rainbow Cloud 彩虹云朵", text: "Rainbow Cloud 彩虹云朵" },
        { value: "Sunshine Smile 阳光笑脸", text: "Sunshine Smile 阳光笑脸" },
        { value: "Moon & Stars 月亮星星", text: "Moon & Stars 月亮星星" },
        { value: "Weather Icons 天气图标", text: "Weather Icons 天气图标" },
        { value: "Numbers & Letters 数字字母", text: "Numbers & Letters 数字字母" },
        { value: "Math Shapes 数学图形", text: "Math Shapes 数学图形" },
        { value: "Geometric Checks 几何棋盘", text: "Geometric Checks 几何棋盘" },
        { value: "Stripe Parade 条纹游行", text: "Stripe Parade 条纹游行" },
        { value: "Polka Dots 圆点乐园", text: "Polka Dots 圆点乐园" },
        { value: "Chevron Waves 人字波", text: "Chevron Waves 人字波" },
        { value: "Galaxy Gradient 星系渐变", text: "Galaxy Gradient 星系渐变" },
        { value: "Neon Pop 霓虹流行", text: "Neon Pop 霓虹流行" },
        { value: "Pastel Candy 淡彩糖果", text: "Pastel Candy 淡彩糖果" },
        { value: "Vintage Toys 复古玩具", text: "Vintage Toys 复古玩具" },
        { value: "Retro Arcade 复古街机", text: "Retro Arcade 复古街机" },
        { value: "Pixel Pets 像素宠物", text: "Pixel Pets 像素宠物" },
        { value: "Emoji Party 表情派对", text: "Emoji Party 表情派对" },
        { value: "Sticker Collage 贴纸拼贴", text: "Sticker Collage 贴纸拼贴" },
        { value: "Badge Parade 徽章游行", text: "Badge Parade 徽章游行" },
        { value: "Patch Icons 布贴图标", text: "Patch Icons 布贴图标" },
        { value: "Handdrawn Doodles 手绘涂鸦", text: "Handdrawn Doodles 手绘涂鸦" },
        { value: "Marker Scribble 马克笔涂鸦", text: "Marker Scribble 马克笔涂鸦" },
        { value: "Crayon Fun 蜡笔趣味", text: "Crayon Fun 蜡笔趣味" },
        { value: "Watercolor Soft 水彩柔和", text: "Watercolor Soft 水彩柔和" },
        { value: "Paper Cut 纸艺剪影", text: "Paper Cut 纸艺剪影" },
        { value: "Clay Friends 黏土朋友", text: "Clay Friends 黏土朋友" },
        { value: "3D Bubble 3D气泡", text: "3D Bubble 3D气泡" },
        { value: "Chrome Pop 铬金属流行", text: "Chrome Pop 铬金属流行" },
        { value: "Hologram Dream 全息梦境", text: "Hologram Dream 全息梦境" },
        { value: "Iridescent Shine 珠光闪耀", text: "Iridescent Shine 珠光闪耀" },
        { value: "Glitter Sparkle 闪粉亮片", text: "Glitter Sparkle 闪粉亮片" },
        { value: "Tie-dye Kids 扎染童趣", text: "Tie-dye Kids 扎染童趣" },
        { value: "Marble Swirl 大理石旋涡", text: "Marble Swirl 大理石旋涡" },
        { value: "Checker Warp 棋盘扭曲", text: "Checker Warp 棋盘扭曲" },
        { value: "Zigzag Fun 之字趣味", text: "Zigzag Fun 之字趣味" },
        { value: "Wavy Stripes 波浪条纹", text: "Wavy Stripes 波浪条纹" },
        { value: "Spiral Candy 旋转糖果", text: "Spiral Candy 旋转糖果" },
        { value: "Star Shower 流星雨", text: "Star Shower 流星雨" },
        { value: "Cloud Puff 棉花云", text: "Cloud Puff 棉花云" },
        { value: "Butterfly Garden 蝴蝶花园", text: "Butterfly Garden 蝴蝶花园" },
        { value: "Ladybug Field 瓢虫田野", text: "Ladybug Field 瓢虫田野" },
        { value: "Bee Buzz 小蜜蜂", text: "Bee Buzz 小蜜蜂" },
        { value: "Dragon Tales 小龙故事", text: "Dragon Tales 小龙故事" },
        { value: "Dinosaur Bones 恐龙骨骼", text: "Dinosaur Bones 恐龙骨骼" },
        { value: "Robot Lab 机器人实验室", text: "Robot Lab 机器人实验室" },
        { value: "Science Lab 科学实验室", text: "Science Lab 科学实验室" },
        { value: "Sports Mix 运动混搭", text: "Sports Mix 运动混搭" },
        { value: "Basketball Court 篮球场", text: "Basketball Court 篮球场" },
        { value: "Soccer Field 足球场", text: "Soccer Field 足球场" },
        { value: "Baseball Fun 棒球乐趣", text: "Baseball Fun 棒球乐趣" },
        { value: "Skate Park 滑板公园", text: "Skate Park 滑板公园" },
        { value: "Scooter Ride 滑板车", text: "Scooter Ride 滑板车" },
        { value: "BMX Kids 小BMX", text: "BMX Kids 小BMX" },
        { value: "Music Band 音乐乐队", text: "Music Band 音乐乐队" },
        { value: "Piano Keys 钢琴键", text: "Piano Keys 钢琴键" },
        { value: "Guitar Pop 吉他流行", text: "Guitar Pop 吉他流行" },
        { value: "Headphone Beat 耳机节拍", text: "Headphone Beat 耳机节拍" },
        { value: "Party Confetti 派对纸屑", text: "Party Confetti 派对纸屑" },
        { value: "Birthday Fun 生日乐趣", text: "Birthday Fun 生日乐趣" },
        { value: "Animal Masks 动物面具", text: "Animal Masks 动物面具" },
        { value: "Camouflage Kids 童趣迷彩", text: "Camouflage Kids 童趣迷彩" },
        { value: "Astronaut Patch 宇航徽章", text: "Astronaut Patch 宇航徽章" },
        { value: "UFO Parade UFO游行", text: "UFO Parade UFO游行" },
        { value: "Mermaid Scales 美人鱼鳞片", text: "Mermaid Scales 美人鱼鳞片" },
        { value: "Shark Teeth 鲨鱼齿", text: "Shark Teeth 鲨鱼齿" },
        { value: "Octopus Dance 章鱼舞", text: "Octopus Dance 章鱼舞" },
        { value: "Seahorse Garden 海马花园", text: "Seahorse Garden 海马花园" },
        { value: "Treasure Map 宝藏地图", text: "Treasure Map 宝藏地图" },
        { value: "Desert Cactus 沙漠仙人掌", text: "Desert Cactus 沙漠仙人掌" },
        { value: "Volcano Land 火山之地", text: "Volcano Land 火山之地" },
        { value: "Mountain Hike 登山之旅", text: "Mountain Hike 登山之旅" },
        { value: "City Blocks 城市方块", text: "City Blocks 城市方块" },
        { value: "Street Signs 路牌", text: "Street Signs 路牌" },
        { value: "Taxi Town 出租车城", text: "Taxi Town 出租车城" },
        { value: "Bus Parade 公交游行", text: "Bus Parade 公交游行" },
        { value: "Airport Runway 机场跑道", text: "Airport Runway 机场跑道" },
        { value: "Rocket Launch 火箭发射", text: "Rocket Launch 火箭发射" },
        { value: "Planet Rings 行星光环", text: "Planet Rings 行星光环" },
        { value: "Comet Trails 彗星尾迹", text: "Comet Trails 彗星尾迹" },
        { value: "Emoji Hearts 表情爱心", text: "Emoji Hearts 表情爱心" },
        { value: "Rainbow Stars 彩虹星星", text: "Rainbow Stars 彩虹星星" },
        { value: "Play Blocks 积木方块", text: "Play Blocks 积木方块" },
        { value: "Building Bricks 砖块世界", text: "Building Bricks 砖块世界" },
        { value: "Safari Mini 小型野生动物", text: "Safari Mini 小型野生动物" },
        { value: "Ocean Friends 海洋伙伴", text: "Ocean Friends 海洋伙伴" },
        { value: "Jellyfish Glow 水母荧光", text: "Jellyfish Glow 水母荧光" },
        { value: "Trex Kids 霸王龙童趣", text: "Trex Kids 霸王龙童趣" },
        { value: "Ice Age 冰河探索", text: "Ice Age 冰河探索" },
        { value: "Candy Checker 糖果棋盘", text: "Candy Checker 糖果棋盘" },
        { value: "Retro Badges 复古徽章", text: "Retro Badges 复古徽章" },
        { value: "Game Icons 游戏图标", text: "Game Icons 游戏图标" },
        { value: "Puzzle Pieces 拼图碎片", text: "Puzzle Pieces 拼图碎片" },
        { value: "Camping Night 露营之夜", text: "Camping Night 露营之夜" },
        { value: "Safari Leaves 热带大叶", text: "Safari Leaves 热带大叶" },
        { value: "Palm Paradise 棕榈乐园", text: "Palm Paradise 棕榈乐园" },
        { value: "Snow Day 下雪啦", text: "Snow Day 下雪啦" },
        { value: "Autumn Leaves 秋叶", text: "Autumn Leaves 秋叶" },
        { value: "Spring Bloom 春日花开", text: "Spring Bloom 春日花开" },
        { value: "Summer Splash 夏日飞溅", text: "Summer Splash 夏日飞溅" },
        { value: "Star Alphabet 星星字母", text: "Star Alphabet 星星字母" },
        { value: "Number Parade 数字游行", text: "Number Parade 数字游行" },
        { value: "Space Grid 太空网格", text: "Space Grid 太空网格" },
        { value: "Dot Hearts 点点爱心", text: "Dot Hearts 点点爱心" },
        { value: "Mini Fruits 迷你水果", text: "Mini Fruits 迷你水果" },
        { value: "Tiny Animals 迷你动物", text: "Tiny Animals 迷你动物" },
        { value: "Baby Icons 婴童图标", text: "Baby Icons 婴童图标" },
        { value: "Nursery Dream 婴室梦境", text: "Nursery Dream 婴室梦境" },
        { value: "Fairground 嘉年华", text: "Fairground 嘉年华" },
        { value: "Origami Animals 折纸动物", text: "Origami Animals 折纸动物" },
        { value: "Line Faces 线条小脸", text: "Line Faces 线条小脸" },
        { value: "Comic Burst 漫画爆炸", text: "Comic Burst 漫画爆炸" },
        { value: "Retro Halftone 复古网点", text: "Retro Halftone 复古网点" },
        { value: "Kite Sky 风筝天空", text: "Kite Sky 风筝天空" },
        { value: "Paper Plane 纸飞机", text: "Paper Plane 纸飞机" },
        { value: "Treasure Chest 宝箱", text: "Treasure Chest 宝箱" },
        { value: "Snowflake Lace 雪花蕾丝", text: "Snowflake Lace 雪花蕾丝" },
        { value: "Candy Ribbons 糖果飘带", text: "Candy Ribbons 糖果飘带" },
        { value: "Star Stripes 星星条纹", text: "Star Stripes 星星条纹" },
        { value: "Hearts & Bows 爱心与蝴蝶结", text: "Hearts & Bows 爱心与蝴蝶结" },
        { value: "Doodle Letters 涂鸦字母", text: "Doodle Letters 涂鸦字母" },
        { value: "Mini Vehicles 迷你交通工具", text: "Mini Vehicles 迷你交通工具" },
        { value: "Rocket Badges 火箭徽章", text: "Rocket Badges 火箭徽章" },
        { value: "Sea Badges 海洋徽章", text: "Sea Badges 海洋徽章" },
        { value: "Toy Cars 玩具小车", text: "Toy Cars 玩具小车" },
        { value: "Racing Numbers 赛道数字", text: "Racing Numbers 赛道数字" },
        { value: "Space Badges 太空徽章", text: "Space Badges 太空徽章" },
        { value: "Animal Spots 动物花斑", text: "Animal Spots 动物花斑" },
        { value: "Zebra Lines 斑马线", text: "Zebra Lines 斑马线" },
        { value: "Giraffe Patches 长颈鹿斑块", text: "Giraffe Patches 长颈鹿斑块" },
        { value: "Leopard Mini 豹纹童趣", text: "Leopard Mini 豹纹童趣" }
      ];
      const f4 = createField("风格预设", "select", stylePresetOptions, step.params.style_preset || "默认 (根据提示词)", (val) => { step.params.style_preset = val; updateWorkflowPreview(); });
      contentEl.appendChild(f4);
      
      const f5 = createField("自定义提示词", "textarea", null, step.params.user_prompt || "", (val) => { step.params.user_prompt = val; updateWorkflowPreview(); });
      f5.querySelector("textarea").rows = 3;
      contentEl.appendChild(f5);
      
      // 图片来源（多选）
      const imageSourcesField = document.createElement("div");
      imageSourcesField.className = "field";
      const imageSourcesLabel = document.createElement("label");
      imageSourcesLabel.textContent = "图片来源（多选）";
      imageSourcesField.appendChild(imageSourcesLabel);
      const imageSourcesSelect = document.createElement("select");
      imageSourcesSelect.multiple = true;
      imageSourcesSelect.style.minHeight = "80px";
      const sourceOptions = getImageSourceOptions(step.id);
      // 兼容旧版本：如果有image_source，转换为数组
      const currentImageSources = step.params.image_sources || (step.params.image_source ? [step.params.image_source] : ["slot1"]);
      sourceOptions.forEach(opt => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.text;
        if (currentImageSources.includes(opt.value)) option.selected = true;
        imageSourcesSelect.appendChild(option);
      });
      imageSourcesSelect.onchange = () => {
        step.params.image_sources = Array.from(imageSourcesSelect.selectedOptions).map(opt => opt.value);
        // 移除旧版本的单个字段
        delete step.params.image_source;
        updateWorkflowPreview();
      };
      imageSourcesField.appendChild(imageSourcesSelect);
      contentEl.appendChild(imageSourcesField);
      
      if (step.params.pattern_mode === "seamless") {
        const f7 = document.createElement("div");
        f7.className = "field";
        const l7 = document.createElement("label");
        l7.textContent = "是否从图形步骤派生";
        const checkbox7 = document.createElement("input");
        checkbox7.type = "checkbox";
        checkbox7.checked = step.params.is_derived || false;
        checkbox7.onchange = () => {
          step.params.is_derived = checkbox7.checked;
          updateWorkflowPreview();
        };
        const label7 = document.createElement("label");
        label7.style.display = "flex";
        label7.style.alignItems = "center";
        label7.style.gap = "8px";
        label7.appendChild(checkbox7);
        label7.appendChild(document.createTextNode("启用后从图形步骤获取图案元素"));
        f7.appendChild(label7);
        contentEl.appendChild(f7);
        
        if (step.params.is_derived) {
          const f8 = createField("图形步骤ID", "select", workflow.steps.filter(s => s.type === "gemini_pattern" && s.params.pattern_mode === "graphic").map(s => ({value: s.id, text: s.id})), step.params.graphic_step_id || "", (val) => { step.params.graphic_step_id = val; updateWorkflowPreview(); });
          contentEl.appendChild(f8);
        }
      }
      
      const f9 = createField("宽高比", "select", [
        { value: "1:1", text: "1:1" },
        { value: "3:4", text: "3:4" },
        { value: "4:3", text: "4:3" }
      ], step.params.aspect_ratio || "1:1", (val) => { step.params.aspect_ratio = val; updateWorkflowPreview(); });
      contentEl.appendChild(f9);
    }
    
    if (step.params.pattern_mode === "mockup_set") {
      const f3 = createField("底图来源", "select", getImageSourceOptions(step.id), step.params.base_source || "slot1", (val) => { step.params.base_source = val; updateWorkflowPreview(); });
      contentEl.appendChild(f3);
      
      const f4 = createField("图形来源", "select", getImageSourceOptions(step.id), step.params.graphic_source || "", (val) => { step.params.graphic_source = val; updateWorkflowPreview(); });
      contentEl.appendChild(f4);
      
      const f5 = createField("图案来源", "select", getImageSourceOptions(step.id), step.params.pattern_source || "", (val) => { step.params.pattern_source = val; updateWorkflowPreview(); });
      contentEl.appendChild(f5);
    }
    
    if (step.params.pattern_mode === "mockup_single") {
      const f3 = createField("底图来源", "select", getImageSourceOptions(step.id), step.params.base_source || "slot1", (val) => { step.params.base_source = val; updateWorkflowPreview(); });
      contentEl.appendChild(f3);
      
      const f4 = createField("图案来源", "select", getImageSourceOptions(step.id), step.params.pattern_source || "slot1", (val) => { step.params.pattern_source = val; updateWorkflowPreview(); });
      contentEl.appendChild(f4);
    }
    
    const f10 = createField("图片尺寸", "select", [
      { value: "1K", text: "1K" },
      { value: "2K", text: "2K" },
      { value: "4K", text: "4K" }
    ], step.params.image_size || "2K", (val) => { step.params.image_size = val; updateWorkflowPreview(); });
    contentEl.appendChild(f10);
    
    const f11 = createField("输出文件名后缀", "input", null, step.params.filename_suffix || "pattern", (val) => { step.params.filename_suffix = val; updateWorkflowPreview(); });
    contentEl.appendChild(f11);
  }
  
  // 条件分支设置
  const whenSection = document.createElement("div");
  whenSection.style.marginTop = "20px";
  whenSection.style.paddingTop = "20px";
  whenSection.style.borderTop = "1px solid var(--keroro-border)";
  const whenTitle = document.createElement("h4");
  whenTitle.textContent = "条件分支 (when)";
  whenTitle.style.color = "var(--keroro-green)";
  whenTitle.style.fontSize = "14px";
  whenTitle.style.marginBottom = "12px";
  whenSection.appendChild(whenTitle);
  
  const whenEnabled = document.createElement("div");
  whenEnabled.className = "field";
  const whenCheckbox = document.createElement("input");
  whenCheckbox.type = "checkbox";
  whenCheckbox.checked = !!step.when;
  whenCheckbox.onchange = () => {
    if (whenCheckbox.checked) {
      // 支持新旧两种格式，优先使用新格式（中文变量名）
      if (step.when && (step.when["检查哪个步骤"] || step.when["from_step"])) {
        // 已有配置，保持不变
      } else {
        // 新建配置，使用新格式（中文变量名）
        step.when = {
          "检查哪个步骤": step.when?.from_step || step.when?.["检查哪个步骤"] || "",
          "检查什么": step.when?.field || step.when?.["检查什么"] || "",
          "怎么比较": step.when?.op || step.when?.["怎么比较"] || "contains",
          "期望值": step.when?.value || step.when?.["期望值"] || ""
        };
      }
    } else {
      step.when = null;
    }
    renderAdvancedSettings(step);
    renderSteps();
    updateWorkflowPreview();
  };
  const whenLabel = document.createElement("label");
  whenLabel.style.display = "flex";
  whenLabel.style.alignItems = "center";
  whenLabel.style.gap = "8px";
  whenLabel.appendChild(whenCheckbox);
  whenLabel.appendChild(document.createTextNode("启用条件分支"));
  whenEnabled.appendChild(whenLabel);
  whenSection.appendChild(whenEnabled);
  
  if (step.when) {
    // 支持新旧两种格式，统一转换为新格式（中文变量名）
    const whenFromStep = step.when["检查哪个步骤"] || step.when.from_step || step.when["来源步骤"] || "";
    const whenField = step.when["检查什么"] || step.when.field || step.when["字段名"] || "";
    const whenOp = step.when["怎么比较"] || step.when.op || step.when["操作符"] || "contains";
    const whenValue = step.when["期望值"] || step.when.value || step.when["比较值"] || "";
    
    // 统一使用新格式
    step.when = {
      "检查哪个步骤": whenFromStep,
      "检查什么": whenField,
      "怎么比较": whenOp,
      "期望值": whenValue
    };
    
    const whenFromStepOptions = [
      { value: "", text: "-- 选择步骤 --" },
      ...workflow.steps.filter(s => s.id !== step.id).map(s => ({ value: s.id, text: s.id }))
    ];
    const whenFromStepField = createField(
      "检查哪个步骤",
      "select",
      whenFromStepOptions,
      step.when["检查哪个步骤"] || "",
      (val) => { step.when["检查哪个步骤"] = val; updateWorkflowPreview(); }
    );
    whenSection.appendChild(whenFromStepField);
    
    const whenFieldField = createField("检查什么（字段名）", "input", null, step.when["检查什么"] || "", (val) => { step.when["检查什么"] = val; updateWorkflowPreview(); });
    whenSection.appendChild(whenFieldField);
    
    const whenOpField = createField("怎么比较（操作符）", "select", [
      { value: "contains", text: "包含 (contains)" },
      { value: "equals", text: "等于 (equals)" },
      { value: "starts_with", text: "开头是 (starts_with)" },
      { value: "ends_with", text: "结尾是 (ends_with)" },
      { value: "not_contains", text: "不包含 (not_contains)" },
      { value: "not_equals", text: "不等于 (not_equals)" },
      { value: "exists", text: "存在 (exists)" },
      { value: "not_exists", text: "不存在 (not_exists)" }
    ], step.when["怎么比较"] || "contains", (val) => { step.when["怎么比较"] = val; updateWorkflowPreview(); });
    whenSection.appendChild(whenOpField);
    
    const whenValueField = createField("期望值（比较值）", "input", null, step.when["期望值"] || "", (val) => { step.when["期望值"] = val; updateWorkflowPreview(); });
    whenSection.appendChild(whenValueField);
  }
  contentEl.appendChild(whenSection);
  
  // 重试设置
  const retrySection = document.createElement("div");
  retrySection.style.marginTop = "20px";
  retrySection.style.paddingTop = "20px";
  retrySection.style.borderTop = "1px solid var(--keroro-border)";
  const retryTitle = document.createElement("h4");
  retryTitle.textContent = "重试与容错";
  retryTitle.style.color = "var(--keroro-green)";
  retryTitle.style.fontSize = "14px";
  retryTitle.style.marginBottom = "12px";
  retrySection.appendChild(retryTitle);
  
  const retryCount = createField("重试次数", "input", null, step.retry || 0, (val) => { step.retry = Number(val) || 0; renderSteps(); updateWorkflowPreview(); });
  retryCount.querySelector("input").type = "number";
  retryCount.querySelector("input").min = "0";
  retryCount.querySelector("input").max = "10";
  retrySection.appendChild(retryCount);
  
  const retryDelay = createField("重试延迟（秒）", "input", null, step.retry_delay || 3.0, (val) => { step.retry_delay = Number(val) || 3.0; updateWorkflowPreview(); });
  retryDelay.querySelector("input").type = "number";
  retryDelay.querySelector("input").min = "0";
  retryDelay.querySelector("input").step = "0.5";
  retrySection.appendChild(retryDelay);
  
  const timeout = createField("超时时间（秒，可选）", "input", null, step.timeout || "", (val) => { step.timeout = val ? Number(val) : null; updateWorkflowPreview(); });
  timeout.querySelector("input").type = "number";
  timeout.querySelector("input").min = "0";
  retrySection.appendChild(timeout);
  contentEl.appendChild(retrySection);
  
  // 保存按钮
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn";
  saveBtn.textContent = "💾 保存设置";
  saveBtn.style.marginTop = "20px";
  saveBtn.onclick = () => {
    renderSteps();
    updateWorkflowPreview();
    closeModal("modal-step-advanced-overlay");
  };
  contentEl.appendChild(saveBtn);
}

