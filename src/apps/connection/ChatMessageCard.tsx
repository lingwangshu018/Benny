import { useEffect, useState } from "react";
import type { ChatMessage } from "../../types/ai";

interface ChatMessageCardProps {
  message: ChatMessage;
  isLatestUser: boolean;
  canRegenerate: boolean;
  busy: boolean;
  generating: boolean;
  highlighted: boolean;
  onEdit: (content: string) => void;
  onDelete: () => void;
  onRegenerate: () => void;
  onChangeVersion: (direction: -1 | 1) => void;
}

export function ChatMessageCard({
  message,
  isLatestUser,
  canRegenerate,
  busy,
  generating,
  highlighted,
  onEdit,
  onDelete,
  onRegenerate,
  onChangeVersion,
}: ChatMessageCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const versions = message.versions ?? [];
  const activeVersion = Math.min(
    versions.length,
    (message.activeVersion ?? 0) + 1,
  );

  useEffect(() => {
    if (!editing) setDraft(message.content);
  }, [editing, message.content]);

  function saveEdit() {
    const content = draft.trim();
    if (!content) return;
    onEdit(content);
    setEditing(false);
  }

  return (
    <article
      className={`chat-message ${message.role}${highlighted ? " highlighted" : ""}`}
      data-message-id={message.id}
    >
      {editing ? (
        <div className="chat-message-editor">
          <textarea
            aria-label="编辑上一条消息"
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div>
            <button type="button" onClick={() => setEditing(false)}>
              取消
            </button>
            <button type="button" disabled={!draft.trim()} onClick={saveEdit}>
              保存
            </button>
          </div>
        </div>
      ) : (
        <p>
          {message.content ||
            (message.role === "assistant" && generating ? "…" : "")}
        </p>
      )}

      <div className="chat-message-footer">
        <time>
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
        {!editing && (
          <div className="chat-message-actions">
            {message.role === "user" && isLatestUser && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(true)}
              >
                编辑
              </button>
            )}
            {message.role === "assistant" && (
              <>
                {versions.length > 1 && (
                  <span className="chat-version-switcher">
                    <button
                      type="button"
                      disabled={busy}
                      aria-label="上一个回复版本"
                      onClick={() => onChangeVersion(-1)}
                    >
                      ‹
                    </button>
                    <b>
                      {activeVersion}/{versions.length}
                    </b>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label="下一个回复版本"
                      onClick={() => onChangeVersion(1)}
                    >
                      ›
                    </button>
                  </span>
                )}
                {canRegenerate && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onRegenerate}
                  >
                    重新生成
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              disabled={busy}
              aria-label="删除这条消息"
              onClick={onDelete}
            >
              删除
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
