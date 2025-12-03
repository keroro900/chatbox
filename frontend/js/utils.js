/**
 * 工具函数模块
 * 提供通用的工具函数，如 Toast 通知、防抖、按钮状态管理等
 */

// ========== Toast 通知系统（现代化版本） ==========
export function showToast(message, type = 'info', duration = 3000) {
  // 确保 toast 容器存在
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:10000;display:flex;flex-direction:column;gap:12px;pointer-events:none;';
    document.body.appendChild(container);
  }

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  const titles = {
    success: '成功',
    error: '错误',
    warning: '警告',
    info: '提示'
  };

  const toast = document.createElement('div');
  toast.className = `toast-modern ${type}`;
  toast.style.pointerEvents = 'all';
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-content">
      <div class="toast-title">${titles[type] || titles.info}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" aria-label="关闭" style="background:none;border:none;color:var(--keroro-text-muted);cursor:pointer;font-size:20px;padding:0;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:4px;transition:all 0.2s;">×</button>
  `;

  const closeBtn = toast.querySelector('.toast-close');
  const closeToast = () => {
    toast.style.animation = 'toast-slide-out 0.3s ease forwards';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 300);
  };

  closeBtn.addEventListener('click', closeToast);
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
    closeBtn.style.color = 'var(--keroro-text)';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.background = 'none';
    closeBtn.style.color = 'var(--keroro-text-muted)';
  });

  container.appendChild(toast);

  // 自动关闭
  if (duration > 0) {
    setTimeout(closeToast, duration);
  }

  return toast;
}

// ========== 按钮加载状态管理 ==========
export function setButtonLoading(button, loading) {
  if (!button) return;
  if (loading) {
    button.classList.add('loading');
    button.disabled = true;
  } else {
    button.classList.remove('loading');
    button.disabled = false;
  }
}

// ========== 防抖函数 ==========
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ========== API Base URL 配置 ==========
export function getApiBase() {
  // 尝试从 window.location 获取（如果前端和后端在同一服务器）
  if (window.location.port) {
    return `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;
  }
  // 尝试从环境变量或配置获取
  const envApiBase = window.API_BASE_URL || localStorage.getItem('apiBaseUrl');
  if (envApiBase) {
    return envApiBase;
  }
  // 默认使用当前协议和主机，端口由后端自动分配
  return `${window.location.protocol}//${window.location.hostname}`;
}

