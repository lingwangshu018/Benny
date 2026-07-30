import { useEffect, useMemo, useState } from "react";
import {
  roleConnectionWorkbench,
  type RoleConnectionDraft,
} from "../../features/connection/roleConnectionWorkbench";
import { aiSettingsRepository } from "../../storage/aiSettingsRepository";
import { contextSessionRepository } from "../../storage/contextSessionRepository";
import { libraryRepository } from "../../storage/libraryRepository";
import { memoryRepository } from "../../storage/memoryRepository";
import type { AppId } from "../../types/phone";

interface RoleConnectionWorkbenchAppProps {
  onOpen: (appId: AppId) => void;
}

function firstCharacterId() {
  return (
    roleConnectionWorkbench.list(libraryRepository.exportSnapshot())[0]
      ?.character.id ?? ""
  );
}

export function RoleConnectionWorkbenchApp({
  onOpen,
}: RoleConnectionWorkbenchAppProps) {
  const [snapshot, setSnapshot] = useState(() =>
    libraryRepository.exportSnapshot(),
  );
  const [characterId, setCharacterId] = useState(firstCharacterId);
  const [draft, setDraft] = useState<RoleConnectionDraft>(() =>
    roleConnectionWorkbench.draft(
      libraryRepository.exportSnapshot(),
      firstCharacterId(),
    ),
  );
  const [testMessage, setTestMessage] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const reload = () => {
      const next = libraryRepository.exportSnapshot();
      setSnapshot(next);
      setCharacterId((current) => {
        const exists = roleConnectionWorkbench
          .list(next)
          .some((item) => item.character.id === current);
        return exists
          ? current
          : roleConnectionWorkbench.list(next)[0]?.character.id ?? "";
      });
    };
    window.addEventListener(libraryRepository.changeEvent, reload);
    return () =>
      window.removeEventListener(libraryRepository.changeEvent, reload);
  }, []);

  useEffect(() => {
    setDraft(roleConnectionWorkbench.draft(snapshot, characterId));
    setNotice("");
  }, [snapshot, characterId]);

  const summaries = useMemo(
    () => roleConnectionWorkbench.list(snapshot),
    [snapshot],
  );
  const inspection = useMemo(
    () =>
      roleConnectionWorkbench.inspect(
        snapshot,
        draft,
        testMessage,
        memoryRepository.forCharacter(draft.characterId),
      ),
    [snapshot, draft, testMessage],
  );
  const personas = snapshot.characters.filter(
    (character) => character.kind === "user" && character.enabled,
  );
  const presets = roleConnectionWorkbench.presets(snapshot, characterId);
  const worldbooks = snapshot.worldbooks.filter(
    (worldbook) => worldbook.enabled,
  );
  const aiSettings = aiSettingsRepository.read();
  const aiReady = Boolean(aiSettings.baseUrl && aiSettings.model);

  function toggleWorldbook(worldbookId: string) {
    setDraft((current) => ({
      ...current,
      worldbookIds: current.worldbookIds.includes(worldbookId)
        ? current.worldbookIds.filter((id) => id !== worldbookId)
        : [...current.worldbookIds, worldbookId],
    }));
  }

  function saveConnection() {
    try {
      const result = roleConnectionWorkbench.apply(snapshot, draft);
      libraryRepository.saveCharacters(result.characters);
      contextSessionRepository.save(result.session);
      setNotice(`已保存 ${result.character.remark || result.character.name} 的连接`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存连接失败");
    }
  }

  function startChat() {
    try {
      const result = roleConnectionWorkbench.apply(snapshot, draft);
      libraryRepository.saveCharacters(result.characters);
      contextSessionRepository.save(result.session);
      onOpen("微信");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法开始聊天");
    }
  }

  if (summaries.length === 0) {
    return (
      <section className="connection-workbench">
        <header className="workbench-heading">
          <span>角色连接</span>
          <h1>连接工作台</h1>
          <p>先准备一位 AI 角色，再把世界书和预设带到这里。</p>
        </header>
        <div className="workbench-empty">
          <span>◇</span>
          <strong>还没有可以连接的角色</strong>
          <p>导入资料包，或者在角色档案里创建第一位角色。</p>
          <div>
            <button type="button" onClick={() => onOpen("资料库")}>
              导入资料
            </button>
            <button type="button" onClick={() => onOpen("角色档案")}>
              打开角色档案
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="connection-workbench">
      <header className="workbench-heading">
        <span>资料 → 连接 → 聊天</span>
        <h1>角色连接工作台</h1>
        <p>把角色、人设、世界书和预设整理成一次可以检查的连接。</p>
      </header>

      <section className="workbench-character-picker">
        <label>
          当前角色
          <select
            value={characterId}
            onChange={(event) => setCharacterId(event.target.value)}
          >
            {summaries.map((item) => (
              <option key={item.character.id} value={item.character.id}>
                {item.character.remark || item.character.name} · {item.score}%
              </option>
            ))}
          </select>
        </label>
        {inspection && (
          <div className="workbench-character-summary">
            <div className="workbench-avatar">
              {inspection.character.avatar ? (
                <img src={inspection.character.avatar} alt="" />
              ) : (
                inspection.character.name.slice(0, 1)
              )}
            </div>
            <div>
              <strong>
                {inspection.character.remark || inspection.character.name}
              </strong>
              <span>{inspection.status}</span>
            </div>
            <b>{inspection.score}%</b>
          </div>
        )}
      </section>

      {inspection && (
        <>
          <section className="workbench-checklist">
            {inspection.checks.map((check) => (
              <article className={check.complete ? "complete" : ""} key={check.id}>
                <b>{check.complete ? "✓" : check.required ? "!" : "○"}</b>
                <div>
                  <strong>
                    {check.label}
                    {check.required && <small>必要</small>}
                  </strong>
                  <p>{check.description}</p>
                </div>
              </article>
            ))}
          </section>

          <section className="workbench-bindings">
            <header>
              <strong>连接资料</strong>
              <span>只修改当前角色的绑定</span>
            </header>
            <label>
              用户人设
              <select
                value={draft.userPersonaId}
                onChange={(event) =>
                  setDraft({ ...draft, userPersonaId: event.target.value })
                }
              >
                <option value="">暂不绑定</option>
                {personas.map((persona) => (
                  <option value={persona.id} key={persona.id}>
                    {persona.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              默认预设
              <select
                value={draft.presetId}
                onChange={(event) =>
                  setDraft({ ...draft, presetId: event.target.value })
                }
              >
                <option value="">不使用预设</option>
                {presets.map((preset) => (
                  <option value={preset.id} key={preset.id}>
                    {preset.title}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>绑定世界书</legend>
              {worldbooks.length === 0 && (
                <p>
                  资料库里还没有世界书。
                  <button type="button" onClick={() => onOpen("世界书")}>
                    去添加
                  </button>
                </p>
              )}
              {worldbooks.map((worldbook) => (
                <label key={worldbook.id}>
                  <input
                    type="checkbox"
                    checked={draft.worldbookIds.includes(worldbook.id)}
                    onChange={() => toggleWorldbook(worldbook.id)}
                  />
                  <span>
                    <strong>{worldbook.title}</strong>
                    <small>
                      {worldbook.triggerMode === "always"
                        ? "常驻"
                        : worldbook.triggerMode === "keyword"
                          ? `关键词 · ${worldbook.keywords.join(" / ") || "未填写"}`
                          : "手动"}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
            <button
              type="button"
              className="workbench-save"
              onClick={saveConnection}
            >
              保存当前绑定
            </button>
            {notice && <p className="workbench-notice">{notice}</p>}
          </section>

          <section className="workbench-preview">
            <header>
              <div>
                <strong>连接测试</strong>
                <span>输入一句话，检查关键词世界书是否命中</span>
              </div>
              <b>约 {inspection.bundle.characterCount} 字</b>
            </header>
            <textarea
              rows={3}
              value={testMessage}
              placeholder="例如：教堂的钟声在雨夜响起……"
              onChange={(event) => setTestMessage(event.target.value)}
            />
            <div className="workbench-receipt">
              {inspection.bundle.sections.length === 0 ? (
                <p>角色核心尚未填写，暂时没有可预览的连接内容。</p>
              ) : (
                inspection.bundle.sections.map((section) => (
                  <article key={`${section.sourceType}-${section.sourceId}`}>
                    <span>
                      {section.sourceType === "character"
                        ? "角色"
                        : section.sourceType === "worldbook"
                          ? "世界书"
                          : section.sourceType === "preset"
                            ? "预设"
                            : "记忆"}
                    </span>
                    <strong>{section.title}</strong>
                    <small>已读取</small>
                  </article>
                ))
              )}
              {inspection.inactiveWorldbooks.map((worldbook) => (
                <article className="inactive" key={`inactive-${worldbook.id}`}>
                  <span>世界书</span>
                  <strong>{worldbook.title}</strong>
                  <small>关键词未命中</small>
                </article>
              ))}
            </div>
          </section>

          {!aiReady && (
            <button
              type="button"
              className="workbench-ai-warning"
              onClick={() => onOpen("设置")}
            >
              <span>模型尚未连接</span>
              <strong>绑定可以先保存，聊天前再完成 AI 设置</strong>
              <b>去设置 →</b>
            </button>
          )}

          <button
            type="button"
            className="workbench-start"
            disabled={!inspection.ready}
            onClick={startChat}
          >
            {inspection.ready
              ? "保存连接并进入微信"
              : "先补充角色核心设定"}
          </button>
        </>
      )}
    </section>
  );
}
