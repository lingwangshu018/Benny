import { useEffect, useState } from "react";
import { LibraryToolbar } from "../../features/library/LibraryToolbar";
import { libraryRepository } from "../../storage/libraryRepository";
import type { WorldbookEntry } from "../../types/library";

export function WorldbookApp() {
  const [items, setItems] = useState(() => libraryRepository.worldbooks());
  const [draft, setDraft] = useState<WorldbookEntry | null>(null);
  const characters = libraryRepository
    .characters()
    .filter((item) => item.kind !== "user");

  useEffect(() => {
    const reload = () => setItems(libraryRepository.worldbooks());
    window.addEventListener(libraryRepository.changeEvent, reload);
    return () => window.removeEventListener(libraryRepository.changeEvent, reload);
  }, []);

  function save() {
    if (!draft?.title.trim() || !draft.content.trim()) return;
    const updated = { ...draft, title: draft.title.trim(), content: draft.content.trim(), updatedAt: Date.now() };
    libraryRepository.saveWorldbooks(items.some((item) => item.id === updated.id) ? items.map((item) => item.id === updated.id ? updated : item) : [updated, ...items]);
    setDraft(null);
  }

  function remove(item: WorldbookEntry) {
    if (!window.confirm(`删除世界书「${item.title}」吗？`)) return;
    libraryRepository.saveWorldbooks(items.filter((entry) => entry.id !== item.id));
    libraryRepository.saveCharacters(libraryRepository.characters().map((character) => ({ ...character, worldbookIds: character.worldbookIds.filter((id) => id !== item.id) })));
  }

  async function importContent(file?: File) {
    if (!file || !draft) return;
    const content = await file.text();
    setDraft({
      ...draft,
      title: draft.title || file.name.replace(/\.[^.]+$/, ""),
      content,
    });
  }

  return (
    <section className="library-app">
      <header className="library-app-heading"><div><span>上下文藏书</span><h1>世界书</h1></div><button type="button" onClick={() => setDraft(libraryRepository.createWorldbook())}>＋</button></header>
      <LibraryToolbar />
      <div className="library-list">
        {items.length === 0 && <p className="library-empty">还没有世界书。可以新建，也可以导入旧资料。</p>}
        {[...items].sort((a, b) => a.priority - b.priority).map((item) => (
          <article className={`library-card ${item.enabled ? "" : "disabled"}`} key={item.id}>
            <span className="library-book-icon">▤</span>
            <button className="library-card-main" type="button" onClick={() => setDraft(item)}>
              <strong>{item.title}</strong><span>{item.content.slice(0, 70)}</span>
              <small>{item.category || "未分类"} · {item.triggerMode === "always" ? "始终读取" : item.triggerMode === "keyword" ? `关键词 ${item.keywords.length}` : "手动启用"} · {item.probability}% · 优先级 {item.priority}</small>
            </button>
            <button className="library-delete" type="button" onClick={() => remove(item)}>×</button>
          </article>
        ))}
      </div>

      {draft && (
        <div className="editor-sheet"><div className="editor-sheet-card">
          <header><h2>{items.some((item) => item.id === draft.id) ? "编辑世界书" : "新建世界书"}</h2><button type="button" onClick={() => setDraft(null)}>×</button></header>
          <label>标题<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
          <label>分类<input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></label>
          <label>内容<textarea rows={8} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} /></label>
          <label className="library-file-button">从 TXT / MD / CSV 导入正文<input type="file" accept=".txt,.md,.csv,text/plain,text/markdown,text/csv" onChange={(event) => void importContent(event.target.files?.[0])} /></label>
          <div className="editor-grid">
            <label>触发方式<select value={draft.triggerMode} onChange={(event) => setDraft({ ...draft, triggerMode: event.target.value as WorldbookEntry["triggerMode"] })}><option value="always">始终读取</option><option value="keyword">关键词触发</option><option value="manual">手动启用</option></select></label>
            <label>适用范围<select value={draft.scope} onChange={(event) => setDraft({ ...draft, scope: event.target.value as WorldbookEntry["scope"] })}><option value="global">全局</option><option value="character">指定角色</option><option value="module">指定模块</option></select></label>
            <label>注入位置<select value={draft.injectionPosition} onChange={(event) => setDraft({ ...draft, injectionPosition: event.target.value as WorldbookEntry["injectionPosition"] })}><option value="before-character">角色设定前</option><option value="after-character">角色设定后</option><option value="author-note">作者注释</option><option value="chat-depth">聊天记录中</option></select></label>
            <label>优先级<input type="number" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) })} /></label>
            <label>触发概率（%）<input type="number" min="0" max="100" value={draft.probability} onChange={(event) => setDraft({ ...draft, probability: Math.min(100, Math.max(0, Number(event.target.value))) })} /></label>
          </div>
          {draft.triggerMode === "keyword" && (
            <>
              <label>关键词（逗号分隔）<input value={draft.keywords.join("，")} onChange={(event) => setDraft({ ...draft, keywords: event.target.value.split(/[,，]/).map((value) => value.trim()).filter(Boolean) })} /></label>
              <div className="editor-grid">
                <label>关键词逻辑<select value={draft.keywordLogic} onChange={(event) => setDraft({ ...draft, keywordLogic: event.target.value as WorldbookEntry["keywordLogic"] })}><option value="any">命中任意一个</option><option value="all">必须全部命中</option></select></label>
                <label className="editor-check"><input type="checkbox" checked={draft.caseSensitive} onChange={(event) => setDraft({ ...draft, caseSensitive: event.target.checked })} />区分大小写</label>
              </div>
            </>
          )}
          {draft.scope === "character" && (
            <fieldset>
              <legend>适用角色</legend>
              {characters.map((character) => (
                <label className="editor-check" key={character.id}>
                  <input type="checkbox" checked={draft.scopeIds.includes(character.id)} onChange={(event) => setDraft({ ...draft, scopeIds: event.target.checked ? [...draft.scopeIds, character.id] : draft.scopeIds.filter((id) => id !== character.id) })} />
                  {character.remark || character.name}
                </label>
              ))}
            </fieldset>
          )}
          <label className="editor-check"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />启用这本世界书</label>
          <button className="editor-save" type="button" onClick={save}>保存世界书</button>
        </div></div>
      )}
    </section>
  );
}
