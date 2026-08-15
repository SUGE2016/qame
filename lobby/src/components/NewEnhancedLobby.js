import React, { useState, useEffect } from 'react';
import { api } from '@qame/shared-utils';
import { canDeleteMatch, deleteMatchWithConfirm } from '../utils/matchUtils';
import { useDialog, DialogRenderer, useToast } from '@qame/shared-ui';
import { Icon } from '../icons';

const NewEnhancedLobby = ({ onGameStart, onReplay, onSpectate }) => {
  // Toast消息系统
  const { success, error, info, warning, ToastContainer } = useToast();
  const { dialogs, confirm } = useDialog();

  // 状态管理
  const [matches, setMatches] = useState([]);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedGame, setSelectedGame] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [batching, setBatching] = useState(false);
  const [listFilter, setListFilter] = useState('live');

  // 获取数据
  useEffect(() => {
    fetchData();
  }, [selectedGame]);

  // 专门检查match状态并自动进入游戏
  const checkMatchStatus = async () => {
    try {
      if (!currentUser) return;
      
      const matchesResponse = await api.getMatches({ gameId: selectedGame });
      console.debug('🎮 轮询获取matches', matchesResponse);
      
      if (matchesResponse.code === 200) {
        // 检查是否需要自动进入游戏  
        const userMatch = matchesResponse.data.find(match => 
          match.players?.some(p => p.playerName === currentUser.player?.player_name) && 
          match.status === 'playing'
        );
        
        if (userMatch) {
          const playerInMatch = userMatch.players.find(p => p.playerName === currentUser.player?.player_name);
          const matchId = /*userMatch.bgio_match_id || */userMatch.id;
          const seatIndex = playerInMatch.seatIndex.toString();
          
          console.log('🎮 准备进入游戏:', {
            userMatch,
            playerInMatch,
            matchId,
            seatIndex,
            selectedGame,
            onGameStart: typeof onGameStart
          });
          
          info('游戏已开始，正在进入...');
          onGameStart(matchId, seatIndex, currentUser.username, selectedGame);
        }
      }
    } catch (error) {
      console.error('检查match状态失败:', error);
    }
  };

  // 智能轮询effect
  useEffect(() => {
    if (!currentUser) return;
    console.debug('🎮 轮询开始', matches, currentUser);
    
    // 检查当前用户是否参与了某个活跃的match
    const userInActiveMatch = matches.some(match => 
      ['waiting', 'ready', 'playing'].includes(match.status) && 
      match.players?.some(p => p.playerName === currentUser.player?.player_name)
    );
    
    // 智能轮询：参与match时高频(1秒)，否则低频(30秒)
    const pollInterval = userInActiveMatch ? 1000 : 30000;
    console.debug('🎮 轮询间隔:', pollInterval);
    
    const interval = setInterval(checkMatchStatus, pollInterval);
    
    return () => clearInterval(interval);
  }, [matches, currentUser, selectedGame]);

  // 检查playing状态的match是否已结束
  const checkPlayingMatches = async (playingMatches) => {
    try {
      let hasFinishedGames = false;
      for (const match of playingMatches) {
        try {
          const response = await api.checkGameStatus(match.id);
          if (response.code === 200 && response.data?.status === 'finished') {
            console.log(`Match ${match.id} 已结束:`, response.data.gameResult);
            info(`游戏 ${match.id.substring(0, 8)}... 已结束！`);
            hasFinishedGames = true;
          }
        } catch (error) {
          // 单个match检查失败不影响其他的
          console.error(`检查match ${match.id} 状态失败:`, error);
        }
      }
      
      // 如果有游戏结束，延迟1秒后重新获取数据以显示最新状态
      if (hasFinishedGames) {
        setTimeout(() => {
          console.log('检测到游戏结束，重新获取match列表');
          fetchData();
        }, 1000);
      }
    } catch (error) {
      console.error('检查playing matches失败:', error);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // 获取当前用户信息
      const userData = sessionStorage.getItem('user');
      if (userData) {
        setCurrentUser(JSON.parse(userData));
      }

      // 并行获取数据
      const [gamesResponse, matchesResponse] = await Promise.all([
        api.getGames(),
        api.getMatches({ gameId: selectedGame })
      ]);

      if (gamesResponse.code === 200) {
        const gamesList = gamesResponse.data.games || [];
        setGames(gamesList);
        // 如果没有选择游戏且有可用游戏，选择第一个
        if (gamesList.length > 0 && !selectedGame) {
          setSelectedGame(gamesList[0].id);
        }
        // 如果当前选择的游戏不在新获取的游戏列表中，重置选择
        if (selectedGame && !gamesList.some(game => game.id === selectedGame)) {
          setSelectedGame(gamesList.length > 0 ? gamesList[0].id : '');
        }
      }

      if (matchesResponse.code === 200) {
        setMatches(matchesResponse.data);
        
        // 自动检查所有playing状态的match，看是否需要更新为finished状态
        const playingMatches = matchesResponse.data.filter(match => match.status === 'playing');
        if (playingMatches.length > 0) {
          checkPlayingMatches(playingMatches);
        }
      }
    } catch (error) {
      console.error('获取数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 创建新Match
  const createMatch = async () => {
    try {
      setCreating(true);

      const response = await api.createMatch({
        gameId: selectedGame,
        gameConfig: {
        }
      });

      if (response.code === 200) {
        console.log('Match创建成功:', response.data);
        // 刷新match列表
        await fetchData();
        success('Match创建成功！');
      } else {
        error(`创建失败: ${response.message}`);
      }
    } catch (error) {
      console.error('创建match失败:', error);
      error('创建match失败，请检查网络连接');
    } finally {
      setCreating(false);
    }
  };

  // 离开Match
  const leaveMatch = async (matchId, playerId) => {
    try {
      const response = await api.removePlayerFromMatch(matchId, playerId);

      if (response.code === 200) {
        console.log('离开成功');
        success('成功离开Match！');
        // 刷新match列表
        await fetchData();
      } else {
        error(`离开失败: ${response.message}`);
      }
    } catch (error) {
      console.error('离开match失败:', error);
      error('离开match失败');
    }
  };

  // 删除Match
  const deleteMatch = async (matchId) => {
    const toast = { success, error };
    deleteMatchWithConfirm(matchId, {
      confirm,
      toast,
      onSuccess: async () => {
        // 刷新match列表
        await fetchData();
      }
    });
  };

  // 开始Match（创建者）
  const startMatch = async (matchId) => {
    try {
      const response = await api.startMatch(matchId);

      if (response.code === 200) {
        success('游戏开始！所有玩家正在自动进入游戏...');
        await fetchData();
      } else {
        error(`开始失败: ${response.message}`);
      }
    } catch (error) {
      console.error('开始游戏失败:', error);
      error('开始游戏失败');
    }
  };

  // 获取玩家在match中的信息
  const getPlayerInMatch = (match) => {
    if (!currentUser?.player) return null;
    return match.players?.find(p => p.playerId === currentUser.player.id);
  };

  const userId = currentUser?.id ?? currentUser?.user?.id;
  const userRole = currentUser?.role ?? currentUser?.user?.role;
  const isAdmin = userRole === 'admin';

  // 检查是否是创建者
  const isCreator = (match) => {
    return userId != null && match.creator_id === userId;
  };

  const deletable = (match) => canDeleteMatch(match, { userId, isAdmin });

  const toggleSelect = (matchId) => {
    setSelectedIds((prev) => (
      prev.includes(matchId) ? prev.filter((id) => id !== matchId) : [...prev, matchId]
    ));
  };

  const selectDeletableOnPage = () => {
    setSelectedIds(visibleMatches.filter(deletable).map((m) => m.id));
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0) {
      warning('请先勾选要对局');
      return;
    }
    const ok = await confirm(`确定删除选中的 ${selectedIds.length} 场对局？此操作不可撤销。`);
    if (!ok) return;
    try {
      setBatching(true);
      const response = await api.deleteMatches(selectedIds);
      if (response.code === 200) {
        const n = response.data?.deletedCount ?? 0;
        const skipped = response.data?.skipped?.length ?? 0;
        success(skipped ? `已删除 ${n} 场，跳过 ${skipped} 场` : `已删除 ${n} 场`);
        setSelectedIds([]);
        await fetchData();
      } else {
        error(response.message || '批量删除失败');
      }
    } catch (e) {
      error('批量删除失败');
    } finally {
      setBatching(false);
    }
  };

  // 处理点击空座位
  const handleSeatClick = async (matchId, seatIndex) => {
    const match = matches.find(m => m.id === matchId);
    if (!match || match.status !== 'waiting') return;

    if (getPlayerInMatch(match)) {
      warning('您已经在此比赛中了，无法再次加入');
      return;
    }
    await joinAsHuman(matchId, seatIndex);
  };

  // 加入指定座位作为人类玩家
  const joinAsHuman = async (matchId, seatIndex) => {
    try {
      // 使用已缓存的player信息，避免重复API调用
      if (!currentUser?.player?.id) {
        throw new Error('用户玩家信息不可用，请重新登录');
      }
      
      const response = await api.addPlayerToMatch(matchId, {
        playerId: currentUser.player.id,
        seatIndex: seatIndex
      });

      if (response.code === 200) {
        console.log('加入成功:', response.data);
        success(`成功加入座位 ${seatIndex + 1}！`);
        await fetchData();
      } else {
        error(`加入失败: ${response.message}`);
      }
    } catch (error) {
      console.error('加入match失败:', error);
      error('加入失败，请检查网络连接');
    }
  };

  const statusLabel = (status) => (
    status === 'waiting' ? '等人' :
    status === 'playing' ? '进行中' :
    status === 'finished' ? '已结束' : '已取消'
  );

  const statusClass = (status) => (
    status === 'waiting' ? 'q-badge-wait' :
    status === 'playing' ? 'q-badge-play' :
    status === 'cancelled' ? 'q-badge-cancel' : 'q-badge-done'
  );

  const visibleMatches = matches.filter((m) => {
    if (listFilter === 'live') return m.status === 'waiting' || m.status === 'playing';
    if (listFilter === 'done') return m.status === 'finished' || m.status === 'cancelled';
    return true;
  });

  // 渲染Match卡片
  const renderMatchCard = (match) => {
    const playerInMatch = getPlayerInMatch(match);
    const isMatchCreator = isCreator(match);
    
    // 检查是否可以开始游戏
    const canStart = isMatchCreator &&
      match.status === 'waiting' &&
      match.currentPlayerCount >= match.min_players &&
      match.currentPlayerCount <= match.max_players;

    return (
      <article
        key={match.id}
        className={`q-match${playerInMatch ? ' is-mine' : ''}`}
      >
        <div className="q-match-head">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <span className={`q-badge ${statusClass(match.status)}`}>{statusLabel(match.status)}</span>
              {playerInMatch && <span className="q-badge q-badge-play">我在这桌</span>}
              <span className="q-match-id">#{match.id.substring(0, 8)}</span>
            </div>
            <div className="q-match-meta">
              <span>房主 {match.creator_name || '—'} · {match.currentPlayerCount}/{match.max_players} 座</span>
            </div>
          </div>
          <div className="q-actions">
            {isAdmin && deletable(match) && (
              <label className="q-btn q-btn-sm q-btn-ghost" htmlFor={`sel-${match.id}`}>
                <input
                  id={`sel-${match.id}`}
                  type="checkbox"
                  checked={selectedIds.includes(match.id)}
                  onChange={() => toggleSelect(match.id)}
                />
                选择
              </label>
            )}
            {match.status === 'playing' && !playerInMatch && onSpectate && (
              <button type="button" className="q-btn q-btn-sm q-btn-cta" onClick={() => onSpectate(match.id, match.game_id)}>观看</button>
            )}
            {match.status === 'finished' && onReplay && (
              <button type="button" className="q-btn q-btn-sm q-btn-cta" onClick={() => onReplay(match.id, match.game_id)}>回放</button>
            )}
            {isMatchCreator && canStart && (
              <button type="button" className="q-btn q-btn-sm q-btn-primary" onClick={() => startMatch(match.id)}>开局</button>
            )}
            {deletable(match) && (
              <button type="button" className="q-btn q-btn-sm q-btn-danger" onClick={() => deleteMatch(match.id)}>删除</button>
            )}
          </div>
        </div>
        <div className="q-seats">
          {(() => {
            const seats = Array(match.max_players).fill(null);
            if (match.players) {
              match.players.forEach((player) => {
                if (player.seatIndex !== undefined && player.seatIndex !== null) {
                  seats[player.seatIndex] = player;
                }
              });
            }
            return seats.map((player, seatIndex) => (
              <div
                key={seatIndex}
                className={`q-seat${!player && match.status === 'waiting' ? ' is-empty' : ''}`}
                onClick={() => {
                  if (!player && match.status === 'waiting') handleSeatClick(match.id, seatIndex);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !player && match.status === 'waiting') handleSeatClick(match.id, seatIndex);
                }}
                role={!player && match.status === 'waiting' ? 'button' : undefined}
                tabIndex={!player && match.status === 'waiting' ? 0 : undefined}
              >
                {player ? (
                  <>
                    <Icon name="user" size={14} />
                    {player.playerName}
                    {match.status === 'waiting' && (player.playerId === currentUser.player?.id || isMatchCreator) && (
                      <button
                        type="button"
                        className="q-btn q-btn-sm q-btn-danger"
                        onClick={(e) => { e.stopPropagation(); leaveMatch(match.id, player.id); }}
                        aria-label={player.playerId === currentUser.player?.id ? '离开' : `移除 ${player.playerName}`}
                      >
                        移出
                      </button>
                    )}
                  </>
                ) : (
                  match.status === 'waiting' ? '加入空位' : '空'
                )}
              </div>
            ));
          })()}
        </div>
      </article>
    );
  };

  if (loading) {
    return <div className="q-empty">加载大厅…</div>;
  }

  const mineMatches = visibleMatches.filter((m) => getPlayerInMatch(m) || isCreator(m));
  const otherMatches = visibleMatches.filter((m) => !getPlayerInMatch(m) && !isCreator(m));
  const selectedGameMeta = games.find((g) => g.id === selectedGame);

  return (
    <div>
      <div className="q-lobby">
        <div className="q-hero">
          <div>
            <h1>游戏大厅</h1>
            <p className="q-hint">选一款游戏，开房或点空位坐下</p>
          </div>
        </div>

        <div className="q-game-row">
          {Array.isArray(games) && games.length > 0 ? games.map((game) => (
            <button
              key={game.id}
              type="button"
              className={`q-game-card${selectedGame === game.id ? ' is-on' : ''}`}
              onClick={() => setSelectedGame(game.id)}
            >
              <strong>{game.displayName || game.name}</strong>
              <span>{game.min_players || 2}–{game.max_players || 2} 人{game.description ? ` · ${game.description}` : ''}</span>
            </button>
          )) : (
            <p className="q-hint">暂无游戏</p>
          )}
        </div>

        <section className="q-panel">
          <div className="q-toolbar">
            <div>
              <h2 style={{ marginBottom: 8 }}>{selectedGameMeta?.name || '房间'} 的桌子</h2>
              <div className="q-tabs" role="tablist">
                {[
                  ['live', '进行中'],
                  ['done', '已结束'],
                  ['all', '全部'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={listFilter === key}
                    className={`q-tab${listFilter === key ? ' is-on' : ''}`}
                    onClick={() => setListFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="q-actions">
              <button type="button" className="q-btn q-btn-sm q-btn-ghost" onClick={fetchData} aria-label="刷新">
                <Icon name="refresh" size={16} />
              </button>
              <button type="button" className="q-btn q-btn-primary" onClick={createMatch} disabled={!selectedGame || creating}>
                <Icon name="plus" size={16} />
                {creating ? '开房中…' : '开一间房'}
              </button>
            </div>
          </div>

          {isAdmin && (
            <div className="q-admin-tools">
              <button type="button" className="q-btn q-btn-sm q-btn-ghost" onClick={selectDeletableOnPage}>
                全选可删
              </button>
              <button type="button" className="q-btn q-btn-sm q-btn-danger" onClick={deleteSelected} disabled={batching || selectedIds.length === 0}>
                {batching ? '删除中…' : `删除选中 ${selectedIds.length}`}
              </button>
            </div>
          )}

          {visibleMatches.length === 0 ? (
            <div className="q-empty">
              <p>这款游戏还没有桌子</p>
              <p className="q-hint">点右上角「开一间房」，或切到「已结束」看历史</p>
            </div>
          ) : (
            <>
              {mineMatches.length > 0 && (
                <>
                  <h3 className="q-section-label">我的桌子</h3>
                  {mineMatches.map((match) => renderMatchCard(match))}
                </>
              )}
              {otherMatches.length > 0 && (
                <>
                  <h3 className="q-section-label">{mineMatches.length ? '其他桌子' : '可加入'}</h3>
                  {otherMatches.map((match) => renderMatchCard(match))}
                </>
              )}
            </>
          )}
        </section>
      </div>
      <ToastContainer />
      <DialogRenderer dialogs={dialogs} />
    </div>
  );
};

export default NewEnhancedLobby