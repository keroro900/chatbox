/**
 * 配置管理模块
 * 包含步骤类型定义、配置常量等
 */

// ========== 步骤类型配置系统 ==========
// 统一的步骤类型定义，便于维护和扩展
export const STEP_TYPES = {
  qwen_prompt: {
    name: "Qwen 提示词",
    icon: "💬",
    category: "输入",
    description: "使用 Qwen 模型分析图片并生成描述提示词",
    defaultParams: {
      preset: "home",
      ip_mode: "auto",
      age_group: "big_kid",
      gender: "female"
    },
    getSummary: (step) => {
      const parts = [];
      parts.push(`<span class="step-summary-item">${step.params.preset || "home"}</span>`);
      parts.push(`<span class="step-summary-item">${step.params.ip_mode || "auto"}</span>`);
      return parts.join("");
    }
  },
  vision_prompt: {
    name: "视觉提示词",
    icon: "👁️",
    category: "输入",
    description: "使用 AI 模型（Qwen/Gemini）分析图片并生成描述提示词，支持多个提供商",
    defaultParams: {
      provider: "qwen",
      preset: "home",
      ip_mode: "auto",
      age_group: "big_kid",
      gender: "female"
    },
    getSummary: (step) => {
      const parts = [];
      parts.push(`<span class="step-summary-item">${step.params.provider || "qwen"}</span>`);
      parts.push(`<span class="step-summary-item">${step.params.preset || "home"}</span>`);
      parts.push(`<span class="step-summary-item">${step.params.ip_mode || "auto"}</span>`);
      return parts.join("");
    }
  },
  runninghub_app: {
    name: "RunningHub 应用",
    icon: "🔄",
    category: "处理",
    description: "调用 RunningHub 应用（如试衣、换装等）",
    defaultParams: {
      webapp_id: "1991820192487460866",
      instance_type: "plus",
      filename_suffix: "tongmo_home",
      auto_bind: true,  // 默认启用智能绑定
      bindingsJson: "{}"  // 智能绑定时会自动生成
    },
    getSummary: (step) => {
      const parts = [];
      const webappId = step.params.webapp_id || "";
      parts.push(`<span class="step-summary-item">WebApp: ${webappId.substring(0, 8)}...</span>`);
      if (step.params.instance_type) {
        parts.push(`<span class="step-summary-item">${step.params.instance_type}</span>`);
      }
      return parts.join("");
    }
  },
  gemini_edit: {
    name: "Gemini 换装",
    icon: "👔",
    category: "处理",
    description: "使用 Gemini 进行换装（预设模式，自动生成提示词）",
    defaultParams: {
      provider: "t8star",
      mode: "multi",
      preset: "home",
      base_from: "slot1",
      cloth_slot_top: "slot2",
      cloth_slot_bottom: "slot3",
      target_part: "full",
      crop_mode: "none",
      prompt_version: "legacy",
      filename_suffix: "tryon",
      prompt: ""
    },
    getSummary: (step) => {
      const parts = [];
      parts.push(`<span class="step-summary-item">${step.params.provider || "t8star"}</span>`);
      parts.push(`<span class="step-summary-item">${step.params.mode || "multi"}</span>`);
      parts.push(`<span class="step-summary-item">${step.params.target_part || "full"}</span>`);
      if (step.params.crop_mode === "auto_from_part") {
        parts.push(`<span class="step-summary-item">自动裁切</span>`);
      }
      return parts.join("");
    }
  },
  gemini_edit_custom: {
    name: "Gemini 自定义编辑",
    icon: "🎨",
    category: "处理",
    description: "使用 Gemini 进行自定义图片编辑（需要手动输入提示词）",
    defaultParams: {
      provider: "t8star",
      image_sources: ["slot1"],
      output_count: 1,
      filename_suffix: "custom_edit",
      prompt: ""
    },
    getSummary: (step) => {
      const parts = [];
      parts.push(`<span class="step-summary-item">${step.params.provider || "t8star"}</span>`);
      parts.push(`<span class="step-summary-item">输出${step.params.output_count || 1}张</span>`);
      // 显示图片来源列表
      if (step.params.image_sources && step.params.image_sources.length > 0) {
        const sourcesText = step.params.image_sources.join(", ");
        parts.push(`<span class="step-summary-item">来源: ${sourcesText}</span>`);
      }
      return parts.join("");
    }
  },
  gemini_generate: {
    name: "Gemini 文生图",
    icon: "🖼️",
    category: "生成",
    description: "使用 Gemini 从文本提示词生成图片",
    defaultParams: {
      provider: "t8star",
      aspect_ratio: "3:4",
      prompt: ""
    },
    getSummary: (step) => {
      const parts = [];
      parts.push(`<span class="step-summary-item">${step.params.provider || "t8star"}</span>`);
      parts.push(`<span class="step-summary-item">${step.params.aspect_ratio || "3:4"}</span>`);
      if (step.params.base_prompt_from) {
        parts.push(`<span class="step-summary-item">Prompt来自${step.params.base_prompt_from}</span>`);
      } else if (step.params.prompt) {
        const promptPreview = step.params.prompt.length > 20 
          ? step.params.prompt.substring(0, 20) + "..." 
          : step.params.prompt;
        parts.push(`<span class="step-summary-item">Prompt: ${promptPreview}</span>`);
      }
      return parts.join("");
    }
  },
  gemini_generate_model: {
    name: "Gemini 生模特",
    icon: "👤",
    category: "生成",
    description: "使用 Gemini 生成模特图片（基于提示词）",
    defaultParams: {
      provider: "t8star",
      aspect_ratio: "3:4",
      prompt_template: ""
    },
    getSummary: (step) => {
      const parts = [];
      parts.push(`<span class="step-summary-item">${step.params.provider || "t8star"}</span>`);
      parts.push(`<span class="step-summary-item">${step.params.aspect_ratio || "3:4"}</span>`);
      if (step.params.base_prompt_from) {
        parts.push(`<span class="step-summary-item">来自${step.params.base_prompt_from}</span>`);
      }
      return parts.join("");
    }
  },
  compare_image: {
    name: "对比图生成",
    icon: "🔄",
    category: "处理",
    description: "将原图和新图拼接在一起生成对比图",
    defaultParams: {
      original_source: "slot1",
      new_source: ""
    },
    getSummary: (step) => {
      const parts = [];
      parts.push(`<span class="step-summary-item">原图: ${step.params.original_source || "slot1"}</span>`);
      if (step.params.new_source) {
        parts.push(`<span class="step-summary-item">新图: ${step.params.new_source}</span>`);
      }
      return parts.join("");
    }
  },
  kling_image2video: {
    name: "可灵图生视频",
    icon: "🎬",
    category: "生成",
    description: "使用 Kling AI 将图片转换为视频",
    defaultParams: {
      model_name: "kling-v2-5",
      mode: "std",
      aspect_ratio: "auto",
      base_from: ""
    },
    getSummary: (step) => {
      const parts = [];
      parts.push(`<span class="step-summary-item">${step.params.model_name || "kling-v2-5"}</span>`);
      parts.push(`<span class="step-summary-item">${step.params.mode || "std"}</span>`);
      const aspectRatio = step.params.aspect_ratio || "auto";
      const aspectRatioText = aspectRatio === "auto" ? "根据输入图" : aspectRatio;
      parts.push(`<span class="step-summary-item">${aspectRatioText}</span>`);
      if (step.params.base_from) {
        parts.push(`<span class="step-summary-item">来自${step.params.base_from}</span>`);
      }
      return parts.join("");
    }
  },
  gemini_model_from_clothes: {
    name: "Gemini 生模特（服装图）",
    icon: "👗",
    category: "生成",
    description: "根据服装正面背面图生成模特展示图",
    defaultParams: {
      provider: "t8star",
      aspect_ratio: "3:4",
      image_size: "2K",
      garment_desc: "儿童服装套装",
      scene_style: "lifestyle",
      model_pose: "natural",
      front_sources: ["slot1"],
      back_sources: [],
      prompt_from_step: "",
      prompt_json_key: "subject",
      filename_suffix: "model"
    },
    getSummary: (step) => {
      const parts = [];
      parts.push(`<span class="step-summary-item">${step.params.provider || "t8star"}</span>`);
      parts.push(`<span class="step-summary-item">${step.params.scene_style || "lifestyle"}</span>`);
      const frontSources = step.params.front_sources || (step.params.front_source ? [step.params.front_source] : ["slot1"]);
      parts.push(`<span class="step-summary-item">正面: ${frontSources.join(", ")}</span>`);
      const backSources = step.params.back_sources || (step.params.back_source ? [step.params.back_source] : []);
      if (backSources.length > 0) {
        parts.push(`<span class="step-summary-item">背面: ${backSources.join(", ")}</span>`);
      }
      return parts.join("");
    }
  },
  gemini_ecom: {
    name: "Gemini 电商图",
    icon: "🛍️",
    category: "生成",
    description: "生成电商图（主图/背面/细节）",
    defaultParams: {
      provider: "t8star",
      enable_main: true,
      enable_back: false,
      enable_detail: false,
      garment_desc: "儿童服装套装（上衣 + 下装）",
      layout: "平铺图",
      fill_mode: "有填充",
      image_sources: ["slot1", "slot2"],
      detail_types: ["collar"],
      detail_count: 1,
      aspect_ratio: "3:4",
      image_size: "2K",
      filename_suffix: "ecom"
    },
    getSummary: (step) => {
      const parts = [];
      const outputTypes = [];
      if (step.params.enable_main !== false) outputTypes.push("主图");
      if (step.params.enable_back) outputTypes.push("背面");
      if (step.params.enable_detail) outputTypes.push("细节");
      parts.push(`<span class="step-summary-item">${outputTypes.join("/") || "主图"}</span>`);
      parts.push(`<span class="step-summary-item">${step.params.provider || "t8star"}</span>`);
      parts.push(`<span class="step-summary-item">${step.params.layout || "平铺图"}</span>`);
      return parts.join("");
    }
  },
  gemini_pattern: {
    name: "Gemini 图案生成",
    icon: "🎨",
    category: "生成",
    description: "生成图案（图形/无缝/Mockup）",
    defaultParams: {
      provider: "t8star",
      pattern_mode: "graphic",
      generation_mode: "Mode A",
      style_preset: "默认 (根据提示词)",
      user_prompt: "",
      image_sources: ["slot1"],
      aspect_ratio: "1:1",
      image_size: "2K",
      filename_suffix: "pattern"
    },
    getSummary: (step) => {
      const parts = [];
      const patternMode = step.params.pattern_mode || "graphic";
      const patternModeNames = {
        "graphic": "图形",
        "seamless": "无缝",
        "mockup_set": "套装Mockup",
        "mockup_single": "单件Mockup"
      };
      parts.push(`<span class="step-summary-item">${patternModeNames[patternMode] || patternMode}</span>`);
      parts.push(`<span class="step-summary-item">${step.params.provider || "t8star"}</span>`);
      parts.push(`<span class="step-summary-item">${step.params.generation_mode || "Mode A"}</span>`);
      const imageSources = step.params.image_sources || (step.params.image_source ? [step.params.image_source] : ["slot1"]);
      if (imageSources.length > 0) {
        parts.push(`<span class="step-summary-item">来源: ${imageSources.join(", ")}</span>`);
      }
      return parts.join("");
    }
  }
};

// 获取步骤类型的显示名称
export function getStepTypeName(stepType) {
  return STEP_TYPES[stepType]?.name || stepType;
}

// 获取步骤类型的图标
export function getStepTypeIcon(stepType) {
  return STEP_TYPES[stepType]?.icon || "📦";
}

// 获取步骤类型的描述
export function getStepTypeDescription(stepType) {
  return STEP_TYPES[stepType]?.description || "未知步骤类型";
}

// 获取所有步骤类型选项（用于下拉框）
export function getStepTypeOptions() {
  return Object.entries(STEP_TYPES).map(([value, config]) => ({
    value,
    text: `${config.icon} ${config.name} - ${config.description}`
  }));
}

// Keroro 角色对话配置
export const keroroLines = {
  keroro: { name: "Keroro 军曹", color: "var(--keroro-keroro)", emoji: "🐸" },
  tamama: { name: "Tamama 二等兵", color: "var(--keroro-tamama)", emoji: "😊" },
  giroro: { name: "Giroro 下士", color: "var(--keroro-giroro)", emoji: "😠" },
  kururu: { name: "Kururu 曹长", color: "var(--keroro-kururu)", emoji: "😎" },
  dororo: { name: "Dororo 兵长", color: "var(--keroro-dororo)", emoji: "🥷" },
  start: { character: "tamama", text: "Tamama：准备作战啦！数据正在排队进场～" },
  completed: { character: "giroro", text: "Giroro：任务完成！检查成果吧。" },
  failed: { character: "giroro", text: "Giroro：错误警告！快查看错误样本！" },
  cancelled: { character: "giroro", text: "Giroro：任务已中断！" },
  errors: { character: "kururu", text: "Kururu：嘿嘿，有些样本出错了，点右侧查看详情。" }
};

