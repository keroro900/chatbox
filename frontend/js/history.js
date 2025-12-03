/**
 * 任务历史记录模块
 * 管理任务历史记录的显示和交互
 */

import { getApiBase } from './utils.js';
import { showToast } from './utils.js';
import { listJobs, refreshJob, loadJobResults } from './api.js';
import { switchView } from './ui.js';

const apiBase = getApiBase();

// 当前选中的任务 ID
let currentSelectedJobId = null;

/**
 * 加载并显示任务历史列表
 */
export async function loadJobHistory() {
  try {
    const historyContainer = document.getElementById('job-history-list');
    if (!historyContainer) {
      console.warn('找不到任务历史列表容器');
      return;
    }

    // 显示加载状态
    historyContainer.innerHTML = '<div class="small-text" style="color: var(--keroro-text-muted); text-align: center; padding: 40px 20px;">⏳ 加载中...</div>';

    const jobs = await listJobs();
    
    if (!jobs || jobs.length === 0) {
      historyContainer.innerHTML = '<div class="small-text" style="color: var(--keroro-text-muted); text-align: center; padding: 40px 20px; background: rgba(10, 20, 10, 0.3); border-radius: 12px; border: 1px dashed var(--keroro-border);">📋 暂无任务记录</div>';
      return;
    }

    // 清空容器
    historyContainer.innerHTML = '';

    // 渲染任务列表
    jobs.forEach(job => {
      const jobCard = createJobCard(job);
      historyContainer.appendChild(jobCard);
    });

    console.log(`已加载 ${jobs.length} 个任务历史记录`);
  } catch (e) {
    console.error("加载任务历史失败:", e);
    const historyContainer = document.getElementById('job-history-list');
    if (historyContainer) {
      historyContainer.innerHTML = `<div class="small-text" style="color:var(--keroro-danger);">加载失败：${e.message || String(e)}</div>`;
    }
    showToast("加载任务历史失败", "error");
  }
}

/**
 * 创建任务卡片
 */
function createJobCard(job) {
  const card = document.createElement("div");
  card.className = `job-history-card ${job.job_id === currentSelectedJobId ? 'active' : ''}`;
  card.dataset.jobId = job.job_id;

  // 格式化时间
  const createdTime = job.created_at ? new Date(job.created_at * 1000).toLocaleString('zh-CN') : '-';
  const updatedTime = job.updated_at ? new Date(job.updated_at * 1000).toLocaleString('zh-CN') : '-';

  // 状态样式
  const statusClass = getStatusClass(job.status);
  let statusText = getStatusText(job.status);
  
  // 如果任务在队列中，显示队列位置
  if (job.status === 'queued' && job.queue_position) {
    statusText = `排队中 (第 ${job.queue_position} 位)`;
  }

  // 进度百分比
  const progressPercent = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;

  card.innerHTML = `
    <div class="job-history-header">
      <div class="job-history-id">
        <strong>任务 ID:</strong> ${job.job_id}
      </div>
      <div class="job-history-status ${statusClass}">
        ${statusText}
      </div>
    </div>
    <div class="job-history-body">
      <div class="job-history-progress">
        <div class="progress-bar">
          <div class="progress-inner" style="width: ${progressPercent}%"></div>
        </div>
        <div class="progress-text">
          ${job.done || 0}/${job.total || 0} (${progressPercent}%)
        </div>
      </div>
      <div class="job-history-message">
        ${job.message || '-'}
      </div>
      <div class="job-history-meta">
        <div class="job-history-time">
          <strong>创建:</strong> ${createdTime}
        </div>
        <div class="job-history-time">
          <strong>更新:</strong> ${updatedTime}
        </div>
      </div>
      ${job.error_items && Object.keys(job.error_items).length > 0 ? `
        <div class="job-history-errors">
          <strong>错误项:</strong> ${Object.keys(job.error_items).length} 个
        </div>
      ` : ''}
    </div>
    <div class="job-history-actions">
      <button class="btn btn-sm btn-primary" data-action="view">查看详情</button>
      <button class="btn btn-sm btn-secondary" data-action="results">查看结果</button>
    </div>
  `;

  // 绑定点击事件
  card.addEventListener('click', (e) => {
    if (e.target.dataset.action) {
      handleJobAction(job.job_id, e.target.dataset.action);
    } else {
      // 点击卡片本身，选中任务
      selectJob(job.job_id);
    }
  });

  return card;
}

/**
 * 获取状态样式类
 */
function getStatusClass(status) {
  switch (status) {
    case 'completed':
      return 'status-completed';
    case 'running':
      return 'status-running';
    case 'queued':
    case 'pending':
      return 'status-pending';
    case 'partial':
      return 'status-partial';
    case 'failed':
    case 'cancelled':
      return 'status-failed';
    default:
      return 'status-pending';
  }
}

/**
 * 获取状态文本
 */
function getStatusText(status) {
  const statusMap = {
    'pending': '等待中',
    'queued': '排队中',
    'running': '运行中',
    'completed': '已完成',
    'partial': '部分完成',
    'failed': '失败',
    'cancelled': '已取消'
  };
  return statusMap[status] || status;
}

/**
 * 选中任务
 */
function selectJob(jobId) {
  currentSelectedJobId = jobId;
  
  // 更新选中状态
  document.querySelectorAll('.job-history-card').forEach(card => {
    card.classList.remove('active');
    if (card.dataset.jobId === jobId) {
      card.classList.add('active');
    }
  });
}

/**
 * 处理任务操作
 */
async function handleJobAction(jobId, action) {
  switch (action) {
    case 'view':
      await viewJobDetail(jobId);
      break;
    case 'results':
      await viewJobResults(jobId);
      break;
    default:
      console.warn(`未知操作: ${action}`);
  }
}

/**
 * 查看任务详情
 */
async function viewJobDetail(jobId) {
  try {
    // 切换到 Runs 视图
    switchView('runs');
    
    // 设置任务 ID
    const jobIdEl = document.getElementById('job-id-runs');
    if (jobIdEl) {
      jobIdEl.value = jobId;
    }
    
    // 刷新任务状态
    await refreshJobStatus(jobId);
    
    // 滚动到任务详情区域
    const runsView = document.querySelector('.view-container[data-view="runs"]');
    if (runsView) {
      runsView.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    showToast(`已切换到任务 ${jobId}`, "success");
  } catch (e) {
    console.error("查看任务详情失败:", e);
    showToast("查看任务详情失败", "error");
  }
}

/**
 * 查看任务结果
 */
async function viewJobResults(jobId) {
  try {
    // 加载任务结果
    const results = await loadJobResults(jobId);
    
    // 切换到 Results 视图或打开结果模态框
    // 这里可以根据实际需求实现
    showToast(`已加载任务 ${jobId} 的结果`, "success");
  } catch (e) {
    console.error("查看任务结果失败:", e);
    showToast("查看任务结果失败", "error");
  }
}

/**
 * 刷新任务状态（供其他模块调用）
 */
export async function refreshJobStatus(jobId) {
  try {
    const job = await refreshJob(jobId);
    if (!job) {
      showToast("任务不存在", "warning");
      return;
    }

    // 更新任务状态显示
    updateJobStatusDisplay(job);
    
    return job;
  } catch (e) {
    console.error("刷新任务状态失败:", e);
    throw e;
  }
}

/**
 * 更新任务状态显示
 */
function updateJobStatusDisplay(job) {
  // 更新 Runs 视图中的任务状态
  const statusPill = document.getElementById('job-status-pill-runs');
  const progressInner = document.getElementById('job-progress-inner-runs');
  const messageEl = document.getElementById('job-message-runs');
  const errorsEl = document.getElementById('job-errors-runs');

  if (statusPill) {
    let statusText = getStatusText(job.status);
    // 如果任务在队列中，显示队列位置
    if (job.status === 'queued' && job.queue_position) {
      statusText = `排队中 (第 ${job.queue_position} 位)`;
    }
    statusPill.textContent = statusText;
    statusPill.className = `status-pill ${getStatusClass(job.status)}`;
  }

  if (progressInner) {
    const progressPercent = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
    progressInner.style.width = `${progressPercent}%`;
  }

  if (messageEl) {
    messageEl.textContent = job.message || '-';
  }

  if (errorsEl && job.error_items && Object.keys(job.error_items).length > 0) {
    errorsEl.textContent = JSON.stringify(job.error_items, null, 2);
  } else if (errorsEl) {
    errorsEl.textContent = '-';
  }
}

/**
 * 初始化任务历史记录模块
 */
export function initHistory() {
  // 如果存在历史记录视图，加载历史记录
  const historyContainer = document.getElementById('job-history-list');
  if (historyContainer) {
    loadJobHistory();
  }
}

// 导出当前选中的任务 ID
export { currentSelectedJobId };

