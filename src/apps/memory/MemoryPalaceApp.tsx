import { useEffect, useMemo, useState } from "react";
import { vectorMemoryEngine } from "../../memory/vectorMemoryEngine";
import { aiSettingsRepository } from "../../storage/aiSettingsRepository";
import { libraryRepository } from "../../storage/libraryRepository";
import { readText, writeText } from "../../storage/localStorage";
import { memoryRepository } from "../../storage/memoryRepository";
import { memoryVectorRepository } from "../../storage/memoryVectorRepository";
import type { CharacterCard } from "../../types/library";
import type { CharacterMemory, MemoryKind } from "../../types/memory";

const ACTIVE_CHARACTER_KEY = "aether.memoryPalace.activeCharacter";

const kinds: Array<{ id: MemoryKind; label: string; icon: string }> = [
  { id: "event", label: "重要事件", icon: "✦" },
  { id: "relationship", label: "关系变化", icon: "♡" },
  { id: "preference", label: "用户偏好", icon: "♧" },
  { id: "promise", label: "承诺约定", icon: "♢" },
  { id: "unresolved", label: "未完话题", icon: "…" },
  { id: "other", label: "其他", icon: "·" },
];

function memoryLabel(kind: MemoryKind) {
  return kinds.find((item) => item.id === kind) ?? kinds[5];
}

function availableCharacters() {
  return libraryRepository
    .characters()
    .filter((character) => character.enabled && character.kind !== "user");
}

function initialCharacterId() {
  const characters = availableCharacters();
  const saved = readText(ACTIVE_CHARACTER_KEY, "");
  return characters.some((character) => character.id === saved)
    ? saved
    : characters[0]?.id ?? "";
}

export function MemoryPalaceApp() {
  const [characters, setCharacters] =
    useState<CharacterCard[]>(availableCharacters);
  const [characterId, setCharacterId] = useState(initialCharacterId);
  const [memories, setMemories] = useState(() =>
    memoryRepository.forCharacter(initialCharacterId()),
  );
  const [filter, setFilter] = useState<MemoryKind | "all">("all");
  const [draft, setDraft] = useState<CharacterMemory | null>(null);
  const [vectorStatus, setVectorStatus] = useState("");

  useEffect(() => {
    const reloadCharacters = () => {
      const next = availableCharacters();
      setCharacters(next);
      if (!next.some((character) => character.id === characterId)) {
        setCharacterId(next[0]?.id ?? "");
      }
    };
    window.addEventListener(libraryRepository.changeEvent, reloadCharacters);
    return () =>
      window.removeEventListener(
        libraryRepository.changeEvent,
        reloadCharacters,
      );
  }, [characterId]);

  useEffect(() => {
    writeText(ACTIVE_CHARACTER_KEY, characterId);
    setMemories(memoryRepository.forCharacter(characterId));
    setDraft(null);
    setFilter("all");
  }, [characterId]);

  useEffect(() => {
    const reload = () =>
      setMemories(memoryRepository.forCharacter(characterId));
    window.addEventListener(memoryRepository.changeEvent, reload);
    return () =>
      window.removeEventListener(memoryRepository.changeEvent, reload);
  }, [characterId]);

  const visibleMemories = useMemo(
    () =>
      filter === "all"
        ? memories
        : memories.filter((memory) => memory.kind === filter),
    [filter, memories],
  );
  const activeCharacter = characters.find(
    (character) => character.id === characterId,
  );
  const enabledCount = memories.filter((memory) => memory.enabled).length;
  const pinnedCount = memories.filter((memory) => memory.pinned).length;

  function save() {
    if (!draft?.title.trim() || !draft.content.trim()) return;
    const saved = memoryRepository.save(draft);
    setDraft(null);
    const settings = aiSettingsRepository.read();
    if (settings.vectorMemoryEnabled) {
      setVectorStatus("正在更新向量索引…");
      void vectorMemoryEngine
        .ensureIndexed(settings, [saved])
        .then((count) =>
          setVectorStatus(count ? "向量索引已更新" : "向量索引无需更新"),
        )
        .catch((error) =>
          setVectorStatus(
            error instanceof Error ? `向量索引失败：${error.message}` : "向量索引失败",
          ),
        );
    }
  }

  function remove(memory: CharacterMemory) {
    if (!window.confirm(`删除记忆「${memory.title}」吗？`)) return;
    memoryRepository.remove(memory.id);
    void memoryVectorRepository.remove(memory.id);
  }

  function togglePinned(memory: CharacterMemory) {
    memoryRepository.save({ ...memory, pinned: !memory.pinned });
  }

  function toggleEnabled(memory: CharacterMemory) {
    memoryRepository.save({ ...memory, enabled: !memory.enabled });
  }

  if (characters.length === 0) {
    return (
      <section className="memory-palace-app">
        <div className="connection-empty">
          <strong>记忆宫殿还没有主人</strong>
          <p>请先在角色档案创建一位 AI 角色。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="memory-palace-app">
      <header className="memory-heading">
        <div>
          <span>角色长期记忆</span>
          <h1>记忆宫殿</h1>
        </div>
        <button
          type="button"
          aria-label="新增记忆"
          onClick={() => setDraft(memoryRepository.create(characterId))}
        >
          ＋
        </button>
      </header>

      <section className="memory-owner">
        <div className="memory-owner-avatar">
          {activeCharacter?.avatar ? (
            <img src={activeCharacter.avatar} alt="" />
          ) : (
            activeCharacter?.name.slice(0, 1)
          )}
        </div>
        <label>
          当前记忆库
          <select
            value={characterId}
            onChange={(event) => setCharacterId(event.target.value)}
          >
            {characters.map((character) => (
              <option value={character.id} key={character.id}>
                {character.name}
              </option>
            ))}
          </select>
        </label>
        <div className="memory-stats">
          <span>{memories.length} 条</span>
          <span>{enabledCount} 启用</span>
          <span>{pinnedCount} 置顶</span>
        </div>
      </section>

      <nav className="memory-filters" aria-label="记忆分类">
        <button
          className={filter === "all" ? "active" : ""}
          type="button"
          onClick={() => setFilter("all")}
        >
          全部
        </button>
        {kinds.map((kind) => (
          <button
            className={filter === kind.id ? "active" : ""}
            type="button"
            key={kind.id}
            onClick={() => setFilter(kind.id)}
          >
            {kind.label}
          </button>
        ))}
      </nav>

      {vectorStatus && <p className="memory-vector-status">{vectorStatus}</p>}

      <div className="memory-list">
        {visibleMemories.length === 0 && (
          <div className="memory-empty">
            <span>◇</span>
            <strong>这里还没有记忆</strong>
            <p>点击右上角加号，为{activeCharacter?.name}保存第一段回忆。</p>
          </div>
        )}
        {visibleMemories.map((memory) => {
          const kind = memoryLabel(memory.kind);
          return (
            <article
              className={`memory-card ${memory.enabled ? "" : "disabled"}`}
              key={memory.id}
            >
              <button
                className={`memory-pin ${memory.pinned ? "active" : ""}`}
                type="button"
                aria-label={memory.pinned ? "取消置顶" : "置顶记忆"}
                onClick={() => togglePinned(memory)}
              >
                {memory.pinned ? "◆" : "◇"}
              </button>
              <button
                className="memory-card-main"
                type="button"
                onClick={() => setDraft(memory)}
              >
                <small>
                  {kind.icon} {kind.label} · 重要度 {memory.importance}
                </small>
                <strong>{memory.title}</strong>
                <p>{memory.content}</p>
                {memory.keywords.length > 0 && (
                  <div>
                    {memory.keywords.slice(0, 4).map((keyword) => (
                      <span key={keyword}>{keyword}</span>
                    ))}
                  </div>
                )}
              </button>
              <div className="memory-card-actions">
                <button
                  type="button"
                  aria-label={memory.enabled ? "停用记忆" : "启用记忆"}
                  onClick={() => toggleEnabled(memory)}
                >
                  {memory.enabled ? "◉" : "○"}
                </button>
                <button
                  type="button"
                  aria-label="删除记忆"
                  onClick={() => remove(memory)}
                >
                  ×
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {draft && (
        <div className="editor-sheet">
          <div className="editor-sheet-card memory-editor">
            <header>
              <h2>
                {memories.some((memory) => memory.id === draft.id)
                  ? "编辑记忆"
                  : "珍藏新记忆"}
              </h2>
              <button type="button" onClick={() => setDraft(null)}>
                ×
              </button>
            </header>
            <label>
              标题
              <input
                value={draft.title}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
              />
            </label>
            <label>
              分类
              <select
                value={draft.kind}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    kind: event.target.value as MemoryKind,
                  })
                }
              >
                {kinds.map((kind) => (
                  <option value={kind.id} key={kind.id}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              记忆内容
              <textarea
                rows={7}
                value={draft.content}
                onChange={(event) =>
                  setDraft({ ...draft, content: event.target.value })
                }
              />
            </label>
            <label>
              关键词（逗号分隔）
              <input
                value={draft.keywords.join("，")}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    keywords: event.target.value
                      .split(/[,，]/)
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
            <label>
              重要程度：{draft.importance}
              <input
                type="range"
                min="1"
                max="5"
                value={draft.importance}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    importance: Number(event.target.value),
                  })
                }
              />
            </label>
            <div className="memory-editor-checks">
              <label className="editor-check">
                <input
                  type="checkbox"
                  checked={draft.pinned}
                  onChange={(event) =>
                    setDraft({ ...draft, pinned: event.target.checked })
                  }
                />
                置顶
              </label>
              <label className="editor-check">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(event) =>
                    setDraft({ ...draft, enabled: event.target.checked })
                  }
                />
                允许以后读取
              </label>
            </div>
            <button className="editor-save" type="button" onClick={save}>
              保存记忆
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
