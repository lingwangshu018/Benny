import type {
  CharacterChatState,
  ChatSearchHit,
} from "../../types/ai";

interface ChatSessionToolsProps {
  state: CharacterChatState;
  busy: boolean;
  searchOpen: boolean;
  searchQuery: string;
  searchHits: ChatSearchHit[];
  onToggleSearch: () => void;
  onSearch: (query: string) => void;
  onNewSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onSelectHit: (hit: ChatSearchHit) => void;
  onExport: () => void;
}

export function ChatSessionTools({
  state,
  busy,
  searchOpen,
  searchQuery,
  searchHits,
  onToggleSearch,
  onSearch,
  onNewSession,
  onSelectSession,
  onSelectHit,
  onExport,
}: ChatSessionToolsProps) {
  return (
    <section className="chat-session-tools">
      <div className="chat-session-row">
        <label>
          会话
          <select
            value={state.activeSessionId}
            disabled={busy}
            onChange={(event) => onSelectSession(event.target.value)}
          >
            {state.sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={busy} onClick={onNewSession}>
          ＋ 新会话
        </button>
        <button type="button" onClick={onToggleSearch}>
          ⌕ 搜索
        </button>
        <button type="button" disabled={busy} onClick={onExport}>
          ⇩ 导出
        </button>
      </div>
      {searchOpen && (
        <div className="chat-search-panel">
          <input
            aria-label="搜索聊天记录"
            value={searchQuery}
            placeholder="搜索当前角色的所有会话"
            onChange={(event) => onSearch(event.target.value)}
          />
          {searchQuery.trim() && searchHits.length === 0 && (
            <p>没有找到相关聊天。</p>
          )}
          {searchHits.length > 0 && (
            <div>
              {searchHits.map((hit) => (
                <button
                  type="button"
                  disabled={busy}
                  key={`${hit.sessionId}-${hit.messageId}`}
                  onClick={() => onSelectHit(hit)}
                >
                  <span>
                    {hit.role === "user" ? "我" : "角色"} ·{" "}
                    {hit.sessionTitle}
                  </span>
                  <strong>{hit.content}</strong>
                  <small>
                    {new Date(hit.createdAt).toLocaleDateString()}
                  </small>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
