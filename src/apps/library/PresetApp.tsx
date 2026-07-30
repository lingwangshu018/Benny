import { useEffect, useState } from "react";
import { LibraryToolbar } from "../../features/library/LibraryToolbar";
import { libraryRepository } from "../../storage/libraryRepository";
import type { PromptPreset } from "../../types/library";

export function PresetApp() {
  const [items, setItems] = useState(() => libraryRepository.presets());
  const [draft, setDraft] = useState<PromptPreset | null>(null);
  const characters = libraryRepository
    .characters()
    .filter((item) => item.kind !== "user");

  useEffect(() => {
    const reload = () => setItems(libraryRepository.presets());
    window.addEventListener(libraryRepository.changeEvent, reload);
    return () => window.removeEventListener(libraryRepository.changeEvent, reload);
  }, []);

  function save() {
    if (!draft?.title.trim() || !draft.content.trim()) return;
    const updated = { ...draft, title: draft.title.trim(), content: draft.content.trim(), updatedAt: Date.now() };
    libraryRepository.savePresets(items.some((item) => item.id === updated.id) ? items.map((item) => item.id === updated.id ? updated : item) : [updated, ...items]);
    setDraft(null);
  }

  return (
    <section className="library-app">
      <header className="library-app-heading"><div><span>模型行为规则</span><h1>预设</h1></div><button type="button" onClick={() => setDraft(libraryRepository.createPreset())}>＋</button></header>
      <LibraryToolbar />
      <div className="library-list">
        {items.length === 0 && <p className="library-empty">还没有预设。预设用于控制回复风格和规则。</p>}
        {items.map((item) => (
          <article className={`library-card ${item.enabled ? "" : "disabled"}`} key={item.id}>
            <span className="library-book-icon">☷</span>
            <button className="library-card-main" type="button" onClick={() => setDraft(item)}><strong>{item.title}</strong><span>{item.description || item.content.slice(0, 80)}</span><small>{item.category || "未分类"} · {item.scope === "global" ? "全局使用" : item.scope === "character" ? "指定角色" : "指定模块"}{item.temperature !== null ? ` · 温度 ${item.temperature}` : ""}</small></button>
            <button className="library-delete" type="button" onClick={() => { if (window.confirm(`删除预设「${item.title}」吗？`)) libraryRepository.savePresets(items.filter((entry) => entry.id !== item.id)); }}>×</button>
          </article>
        ))}
      </div>
      {draft && <div className="editor-sheet"><div className="editor-sheet-card">
        <header><h2>{items.some((item) => item.id === draft.id) ? "编辑预设" : "新建预设"}</h2><button type="button" onClick={() => setDraft(null)}>×</button></header>
        <label>名称<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label>说明<input value={draft.description} placeholder="这套预设适合什么样的对话" onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <label>分类<input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></label>
        <label>预设内容<textarea rows={12} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} /></label>
        <label>适用范围<select value={draft.scope} onChange={(event) => setDraft({ ...draft, scope: event.target.value as PromptPreset["scope"] })}><option value="global">全局</option><option value="character">指定角色</option><option value="module">指定模块</option></select></label>
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
        <fieldset>
          <legend>可选生成参数（留空则跟随 AI 设置）</legend>
          <div className="editor-grid">
            <label>温度<input type="number" min="0" max="2" step="0.1" value={draft.temperature ?? ""} onChange={(event) => setDraft({ ...draft, temperature: event.target.value === "" ? null : Number(event.target.value) })} /></label>
            <label>Top P<input type="number" min="0" max="1" step="0.05" value={draft.topP ?? ""} onChange={(event) => setDraft({ ...draft, topP: event.target.value === "" ? null : Number(event.target.value) })} /></label>
            <label>最大输出<input type="number" min="1" value={draft.maxTokens ?? ""} onChange={(event) => setDraft({ ...draft, maxTokens: event.target.value === "" ? null : Number(event.target.value) })} /></label>
            <label>聊天历史条数<input type="number" min="0" value={draft.historyLimit} onChange={(event) => setDraft({ ...draft, historyLimit: Math.max(0, Number(event.target.value)) })} /></label>
            <label>每次读取记忆<input type="number" min="0" value={draft.memoryLimit} onChange={(event) => setDraft({ ...draft, memoryLimit: Math.max(0, Number(event.target.value)) })} /></label>
          </div>
        </fieldset>
        <label className="editor-check"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />启用这条预设</label>
        <button className="editor-save" type="button" onClick={save}>保存预设</button>
      </div></div>}
    </section>
  );
}
