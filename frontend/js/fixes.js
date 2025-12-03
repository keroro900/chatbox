/**
 * 系统修复补丁
 * 修复配置目录同步和任务状态轮询问题
 */

// ========== 全局变量 ==========
let jobPollingInterval = null;
let currentPollingJobId = null;

// ========== 配置目录同步修复 ==========

/**
 * 统一的目录同步函数
 * 从主界面同步到模态框，或从模态框同步到主界面
 */
export function syncDirectoryInputs(direction = 'toModal') {
  console.log(`[目录同步] 方向: ${direction}`);
  
  // 主界面的输入框（可能在 Workflow 或 Runs 视图）
  const workflowDir1 = document.querySelector('#view-workflow input[placeholder*="图一"]');
  const workflowDir2 = document.querySelector('#view-workflow input[placeholder*="图二"]');
  const workflowDir3 = document.querySelector('#view-workflow input[placeholder*="图三"]');
  const workflowDir4 = document.querySelector('#view-workflow input[placeholder*="图四"]');
  
  const runsDir1 = document.querySelector('#view-runs input[placeholder*="图一"]');
  const runsDir2 = document.querySelector('#view-runs input[placeholder*="图二"]');
  const runsDir3 = document.querySelector('#view-runs input[placeholder*="图三"]');
  const runsDir4 = document.querySelector('#view-runs input[placeholder*="图四"]');
  
  // 模态框的输入框
  const modalDir1 = document.getElementById('input-dir-1');
  const modalDir2 = document.getElementById('input-dir-2');
  const modalDir3 = document.getElementById('input-dir-3');
  const modalDir4 = document.getElementById('input-dir-4');
  
  if (direction === 'toModal') {
    // 从主界面同步到模态框
    const activeView = document.querySelector('.view-content:not(.hidden)');
    const isWorkflowView = activeView && activeView.id === 'view-workflow';
    
    const sourceDir1 = isWorkflowView ? workflowDir1 : runsDir1;
    const sourceDir2 = isWorkflowView ? workflowDir2 : runsDir2;
    const sourceDir3 = isWorkflowView ? workflowDir3 : runsDir3;
    const sourceDir4 = isWorkflowView ? workflowDir4 : runsDir4;
    
    if (modalDir1 && sourceDir1) modalDir1.value = sourceDir1.value || '';
    if (modalDir2 && sourceDir2) modalDir2.value = sourceDir2.value || '';
    if (modalDir3 && sourceDir3) modalDir3.value = sourceDir3.value || '';
    if (modalDir4 && sourceDir4) modalDir4.value = sourceDir4.value || '';
    
    console.log('[目录同步] 已同步到模态框:', {
      dir1: modalDir1?.value,
      dir2: modalDir2?.value,
      dir3: modalDir3?.value,
      dir4: modalDir4?.value
    });
  } else if (direction === 'fromModal') {
    // 从模态框同步到主界面
    const dir1Value = modalDir1?.value?.trim() || '';
    const dir2Value = modalDir2?.value?.trim() || '';
    const dir3Value = modalDir3?.value?.trim() || '';
    const dir4Value = modalDir4?.value?.trim() || '';
    
    // 同步到两个视图
    if (workflowDir1) workflowDir1.value = dir1Value;
    if (workflowDir2) workflowDir2.value = dir2Value;
    if (workflowDir3) workflowDir3.value = dir3Value;
    if (workflowDir4) workflowDir4.value = dir4Value;
    
    if (runsDir1) runsDir1.value = dir1Value;
    if (runsDir2) runsDir2.value = dir2Value;
    if (runsDir3) runsDir3.value = dir3Value;
    if (runsDir4) runsDir4.value = dir4Value;
    
    // 更新全局引用（如果存在）
    if (window.inputDir1El) window.inputDir1El.value = dir1Value;
    if (window.inputDir2El) window.inputDir2El.value = dir2Value;
    if (window.inputDir3El) window.inputDir3El.value = dir3Value;
    if (window.inputDir4El) window.inputDir4El.value = dir4Value;
    
    console.log('[目录同步] 已同步到主界面:', {
      dir1: dir1Value,
      dir2: dir2Value,
      dir3: dir3Value,
      dir4: dir4Value
    });
    
    // 更新目录预览
    if (typeof window.syncDirPreviews === 'function') {
      window.syncDirPreviews();
    }
  }
}

// ========== 任务状态轮询修复 ==========

/**
 * 开始轮询任务状态
 * @param {string} jobId - 任务ID
 * @param {number} interval - 轮询间隔（毫秒），默认2000ms
 */
export function startJobPolling(jobId, interval = 2000) {
  if (!jobId) {
    console.warn('[任务轮询] 任务ID为空，无法开始轮询');
    return;
  }
  
  // 如果已经在轮询同一个任务，不重复启动
  if (currentPollingJobId === jobId && jobPollingInterval) {
    console.log('[任务轮询] 已在轮询任务:', jobId);
    return;
  }
  
  // 停止之前的轮询
  stopJobPolling();
  
  currentPollingJobId = jobId;
  console.log('[任务轮询] 开始轮询任务:', jobId);
  
  // 立即执行一次
  pollJobStatus(jobId);
  
  // 设置定时轮询
  jobPollingInterval = setInterval(() => {
    pollJobStatus(jobId);
  }, interval);
}

/**
 * 停止轮询任务状态
 */
export function stopJobPolling() {
  if (jobPollingInterval) {
    clearInterval(jobPollingInterval);
    jobPollingInterval = null;
    console.log('[任务轮询] 已停止轮询任务:', currentPollingJobId);
    currentPollingJobId = null;
  }
}

/**
 * 轮询任务状态（内部函数）
 * @param {string} jobId - 任务ID
 */
async function pollJobStatus(jobId) {
  try {
    // 动态导入 API 模块
    const { refreshJob } = await import('./api.js');
    const job = await refreshJob(jobId);
    
    if (!job) {
      console.warn('[任务轮询] 任务不存在，停止轮询');
      stopJobPolling();
      return;
    }
    
    // 更新UI显示
    updateJobStatusUI(job);
    
    // 如果任务已完成，停止轮询
    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      console.log('[任务轮询] 任务已完成，停止轮询:', job.status);
      stopJobPolling();
      
      // 显示完成提示
      if (typeof window.showToast === 'function') {
        const message = job.status === 'completed' 
          ? `任务完成！成功: ${job.done}, 失败: ${job.failed}`
          : `任务${job.status === 'failed' ? '失败' : '已取消'}`;
        window.showToast(message, job.status === 'completed' ? 'success' : 'warning');
      }
    }
  } catch (e) {
    console.error('[任务轮询] 查询状态失败:', e);
    // 连续失败3次后停止轮询
    if (!window.pollingFailCount) window.pollingFailCount = 0;
    window.pollingFailCount++;
    if (window.pollingFailCount >= 3) {
      console.error('[任务轮询] 连续失败3次，停止轮询');
      stopJobPolling();
      window.pollingFailCount = 0;
    }
  }
}

/**
 * 更新任务状态UI显示
 * @param {Object} job - 任务对象
 */
function updateJobStatusUI(job) {
  // 重置失败计数
  window.pollingFailCount = 0;
  
  // 更新 Workflow 视图的状态
  const workflowStatusPill = document.getElementById('job-status-pill');
  const workflowProgress = document.getElementById('job-progress-inner');
  const workflowMessage = document.getElementById('job-message');
  
  if (workflowStatusPill) {
    updateStatusPill(workflowStatusPill, job);
  }
  
  if (workflowProgress && job.total > 0) {
    const percent = Math.round((job.done / job.total) * 100);
    workflowProgress.style.width = `${percent}%`;
  }
  
  if (workflowMessage) {
    workflowMessage.textContent = job.message || '-';
  }
  
  // 更新 Runs 视图的状态
  const runsStatusPill = document.getElementById('job-status-pill-runs');
  const runsProgress = document.getElementById('job-progress-inner-runs');
  const runsMessage = document.getElementById('job-message-runs');
  const runsErrors = document.getElementById('job-errors-runs');
  
  if (runsStatusPill) {
    updateStatusPill(runsStatusPill, job);
  }
  
  if (runsProgress && job.total > 0) {
    const percent = Math.round((job.done / job.total) * 100);
    runsProgress.style.width = `${percent}%`;
  }
  
  if (runsMessage) {
    runsMessage.textContent = job.message || '-';
  }
  
  if (runsErrors) {
    if (job.error_items && Object.keys(job.error_items).length > 0) {
      runsErrors.textContent = JSON.stringify(job.error_items, null, 2);
    } else {
      runsErrors.textContent = '-';
    }
  }
}

/**
 * 更新状态标签
 * @param {HTMLElement} element - 状态标签元素
 * @param {Object} job - 任务对象
 */
function updateStatusPill(element, job) {
  if (!element) return;
  
  let statusText = getStatusText(job.status);
  
  // 如果在队列中，显示队列位置
  if (job.status === 'queued' && job.queue_position) {
    statusText = `排队中 (第 ${job.queue_position} 位)`;
  }
  
  element.textContent = statusText;
  element.className = `status-pill ${getStatusClass(job.status)}`;
}

/**
 * 获取状态文本
 * @param {string} status - 状态值
 * @returns {string} 状态文本
 */
function getStatusText(status) {
  const statusMap = {
    'queued': '排队中',
    'running': '运行中',
    'completed': '已完成',
    'failed': '失败',
    'cancelled': '已取消'
  };
  return statusMap[status] || status;
}

/**
 * 获取状态样式类
 * @param {string} status - 状态值
 * @returns {string} CSS类名
 */
function getStatusClass(status) {
  const classMap = {
    'queued': 'status-queued',
    'running': 'status-running',
    'completed': 'status-completed',
    'failed': 'status-failed',
    'cancelled': 'status-cancelled'
  };
  return classMap[status] || '';
}

// ========== 初始化修复 ==========

/**
 * 初始化所有修复
 */
export function initFixes() {
  console.log('[修复补丁] 开始初始化...');
  
  // 1. 修复目录配置按钮
  fixDirectoryConfigButtons();
  
  // 2. 修复任务开始按钮
  fixJobStartButtons();
  
  // 3. 页面卸载时停止轮询
  window.addEventListener('beforeunload', () => {
    stopJobPolling();
  });
  
  console.log('[修复补丁] 初始化完成');
}

/**
 * 修复目录配置按钮
 */
function fixDirectoryConfigButtons() {
  // 工作流视图的配置按钮
  const btnWorkflow = document.getElementById('btn-open-dirs-modal');
  if (btnWorkflow) {
    btnWorkflow.addEventListener('click', () => {
      syncDirectoryInputs('toModal');
    });
  }
  
  // Runs视图的配置按钮
  const btnRuns = document.getElementById('btn-open-dirs-modal-runs');
  if (btnRuns) {
    btnRuns.addEventListener('click', () => {
      syncDirectoryInputs('toModal');
    });
  }
  
  // 模态框的保存按钮
  const btnSave = document.getElementById('btn-save-dirs');
  if (btnSave) {
    // 移除旧的事件监听器，添加新的
    const newBtn = btnSave.cloneNode(true);
    btnSave.parentNode.replaceChild(newBtn, btnSave);
    
    newBtn.addEventListener('click', () => {
      syncDirectoryInputs('fromModal');
      if (typeof window.closeModal === 'function') {
        window.closeModal('modal-dirs-overlay');
      }
    });
  }
}

/**
 * 修复任务开始按钮 - 在任务创建后自动启动轮询
 * 注意：不替换按钮，而是在 startJob 函数执行后自动启动轮询
 */
function fixJobStartButtons() {
  // 不需要替换按钮，因为 index.html 已经处理了事件绑定
  // 我们只需要在 startJob 函数执行后自动启动轮询
  // 这个功能已经在 index.html 的 startJob 包装函数中实现了
  console.log('[修复] 任务开始按钮已由 index.html 处理，无需额外修复');
}

// ========== 导出 ==========
export default {
  syncDirectoryInputs,
  startJobPolling,
  stopJobPolling,
  initFixes
};

