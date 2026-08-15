// Lobby内部的Match相关工具函数
import { api } from '@qame/shared-utils';

/** 进行中不可删；等人房创建者/管理员可删；已结束/已取消仅管理员可删（留存治理） */
export const canDeleteMatch = (match, { userId, isAdmin } = {}) => {
  const status = match?.status;
  if (status === 'playing') return false;
  if (status === 'waiting') return Boolean(isAdmin || (userId != null && match.creator_id === userId));
  if (status === 'finished' || status === 'cancelled') return Boolean(isAdmin);
  return false;
};

/**
 * 删除Match的通用函数（Lobby内部使用）
 * @param {string} matchId - Match ID
 * @param {Object} options - 配置选项
 * @param {Function} options.confirm - 确认对话框函数
 * @param {Object} options.toast - Toast消息对象 {success, error}
 * @param {Function} options.onSuccess - 成功回调
 * @param {Function} options.onError - 错误回调
 */
export const deleteMatchWithConfirm = async (matchId, options = {}) => {
  const {
    confirm = (message) => window.confirm(message),
    toast = { success: (msg) => console.log(msg), error: (msg) => console.error(msg) },
    onSuccess,
    onError
  } = options;

  const confirmed = await confirm('确定要删除这个对局吗？此操作不可撤销。');
  if (!confirmed) return;

  try {
    const response = await api.deleteMatch(matchId);
    if (response.code === 200) {
      toast.success('对局删除成功！');
      onSuccess?.();
      return { success: true, data: response.data };
    } else {
      const errorMsg = response.message || '未知错误';
      toast.error(`删除失败：${errorMsg}`);
      onError?.(errorMsg);
      return { success: false, error: errorMsg };
    }
  } catch (error) {
    console.error('删除对局失败:', error);
    const errorMsg = '网络错误';
    toast.error(`删除失败：${errorMsg}`);
    onError?.(error);
    return { success: false, error: errorMsg };
  }
};