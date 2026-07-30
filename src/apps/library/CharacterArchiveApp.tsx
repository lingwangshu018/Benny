import { useEffect, useState } from "react";
import { LibraryToolbar } from "../../features/library/LibraryToolbar";
import { libraryRepository } from "../../storage/libraryRepository";
import type { CharacterCard } from "../../types/library";

export function CharacterArchiveApp() {
  const [items, setItems] = useState(() => libraryRepository.characters());
  const [draft, setDraft] = useState<CharacterCard | null>(null);
  const worldbooks = libraryRepository.worldbooks();
  const presets = libraryRepository.presets();
  const userPersonas = items.filter((item) => item.kind === "user");

  function uploadAvatar(file?: File) {
    if (!file || !draft) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        setDraft((current) =>
          current ? { ...current, avatar: String(reader.result) } : current,
        );
      }
    });
    reader.readAsDataURL(file);
  }

  useEffect(() => {
    const reload = () => setItems(libraryRepository.characters());
    window.addEventListener(libraryRepository.changeEvent, reload);
    return () => window.removeEventListener(libraryRepository.changeEvent, reload);
  }, []);

  function save() {
    if (!draft?.name.trim()) return;
    const updated = { ...draft, name: draft.name.trim(), updatedAt: Date.now() };
    libraryRepository.saveCharacters(
      items.some((item) => item.id === updated.id)
        ? items.map((item) => (item.id === updated.id ? updated : item))
        : [updated, ...items],
    );
    setDraft(null);
  }

  function remove(item: CharacterCard) {
    if (!window.confirm(`删除角色「${item.name}」吗？`)) return;
    libraryRepository.saveCharacters(items.filter((entry) => entry.id !== item.id));
  }

  return (
    <section className="library-app">
      <header className="library-app-heading">
        <div>
          <span>手机本地联系人</span>
          <h1>角色档案</h1>
        </div>
        <button type="button" onClick={() => setDraft(libraryRepository.createCharacter())}>
          ＋
        </button>
      </header>
      <LibraryToolbar />
      <div className="library-list">
        {items.length === 0 && <p className="library-empty">还没有角色，先创建第一位居民。</p>}
        {items.map((item) => (
          <article className="library-card" key={item.id}>
            <div className="library-avatar">
              {item.avatar ? <img src={item.avatar} alt="" /> : item.name.slice(0, 1)}
            </div>
            <button className="library-card-main" type="button" onClick={() => setDraft(item)}>
              <strong>{item.remark || item.name}</strong>
              <span>{item.summary || "尚未填写简介"}</span>
              <small>
                {item.kind === "user" ? "用户人设" : item.kind === "npc" ? "NPC" : "AI 角色"}
                {" · "}
                已绑定 {item.worldbookIds.length} 本世界书
                {item.tags.length ? ` · ${item.tags.slice(0, 2).join(" / ")}` : ""}
              </small>
            </button>
            <button className="library-delete" type="button" onClick={() => remove(item)}>×</button>
          </article>
        ))}
      </div>

      {draft && (
        <div className="editor-sheet">
          <div className="editor-sheet-card">
            <header><h2>{items.some((item) => item.id === draft.id) ? "编辑角色" : "新建角色"}</h2><button type="button" onClick={() => setDraft(null)}>×</button></header>
            <label>名称<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label>手机备注名<input value={draft.remark} placeholder="留空则显示角色名称" onChange={(event) => setDraft({ ...draft, remark: event.target.value })} /></label>
            <label>类型<select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as CharacterCard["kind"] })}><option value="character">AI 角色</option><option value="npc">NPC</option><option value="user">用户人设</option></select></label>
            <label>简介<input value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></label>
            <label>头像地址<input value={draft.avatar} onChange={(event) => setDraft({ ...draft, avatar: event.target.value })} /></label>
            <label className="library-file-button">或上传本地头像<input type="file" accept="image/*" onChange={(event) => uploadAvatar(event.target.files?.[0])} /></label>
            <label>标签（逗号分隔）<input value={draft.tags.join("，")} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(/[,，]/).map((value) => value.trim()).filter(Boolean) })} /></label>
            <label>{draft.kind === "user" ? "用户人设" : "角色设定"}<textarea rows={8} value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} /></label>
            {draft.kind !== "user" && (
              <>
                <label>初始情景<textarea rows={3} value={draft.scenario} placeholder="故事开始时所处的环境或关系状态" onChange={(event) => setDraft({ ...draft, scenario: event.target.value })} /></label>
                <label>开场白<textarea rows={4} value={draft.greeting} placeholder="新对话第一次打开时显示" onChange={(event) => setDraft({ ...draft, greeting: event.target.value })} /></label>
                <label>对话示例<textarea rows={5} value={draft.exampleDialogue} placeholder="用于帮助模型学习角色语气" onChange={(event) => setDraft({ ...draft, exampleDialogue: event.target.value })} /></label>
                <div className="editor-grid">
                  <label>绑定用户人设<select value={draft.userPersonaId} onChange={(event) => setDraft({ ...draft, userPersonaId: event.target.value })}><option value="">不绑定</option>{userPersonas.filter((item) => item.id !== draft.id).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
                  <label>默认预设<select value={draft.defaultPresetId} onChange={(event) => setDraft({ ...draft, defaultPresetId: event.target.value })}><option value="">跟随聊天选择</option>{presets.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
                  <label>聊天历史条数<input type="number" min="0" value={draft.contextLimit} onChange={(event) => setDraft({ ...draft, contextLimit: Math.max(0, Number(event.target.value)) })} /></label>
                  <label>语音标识<input value={draft.voice} onChange={(event) => setDraft({ ...draft, voice: event.target.value })} /></label>
                </div>
              </>
            )}
            <fieldset>
              <legend>绑定世界书</legend>
              {worldbooks.length === 0 && <span>还没有世界书</span>}
              {worldbooks.map((book) => (
                <label className="editor-check" key={book.id}>
                  <input type="checkbox" checked={draft.worldbookIds.includes(book.id)} onChange={(event) => setDraft({ ...draft, worldbookIds: event.target.checked ? [...draft.worldbookIds, book.id] : draft.worldbookIds.filter((id) => id !== book.id) })} />
                  {book.title}
                </label>
              ))}
            </fieldset>
            <label className="editor-check"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />允许在小手机中使用</label>
            <button className="editor-save" type="button" onClick={save}>保存角色</button>
          </div>
        </div>
      )}
    </section>
  );
}
