import { useEffect, useMemo, useState } from "react";
import { lifeTimelineRepository } from "../../storage/lifeTimelineRepository";
import { relationshipRepository } from "../../storage/relationshipRepository";
import { relationshipGrowthEngine } from "../../features/relationship/relationshipGrowthEngine";
import type {
  RelationshipGrowthPreview,
  RelationshipMetrics,
  RelationshipStage,
} from "../../types/relationship";
import {
  CharacterSelect,
  LifeAppHeading,
  TimelinePreview,
  dateInputToTimestamp,
  lifeKindMeta,
  toDateInput,
  useLifeTimeline,
} from "./lifeShared";

const stageLabels: Record<RelationshipStage, string> = {
  stranger: "初识",
  familiar: "熟悉",
  close: "亲近",
  ambiguous: "暧昧",
  committed: "相守",
};

const metricLabels: Record<keyof RelationshipMetrics, string> = {
  intimacy: "亲密",
  trust: "信任",
  attraction: "心动",
  security: "安心",
  conflict: "矛盾",
};

export function CoupleSpaceApp() {
  const { events, characters, characterMap } = useLifeTimeline();
  const [characterId, setCharacterId] = useState(characters[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [date, setDate] = useState(toDateInput());
  const [profile, setProfile] = useState(() =>
    relationshipRepository.forCharacter(characters[0]?.id ?? ""),
  );
  const [growthPreview, setGrowthPreview] =
    useState<RelationshipGrowthPreview | null>(null);
  const [growthStatus, setGrowthStatus] = useState("");
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    if (!characters.some((character) => character.id === characterId)) {
      setCharacterId(characters[0]?.id ?? "");
    }
  }, [characters, characterId]);

  useEffect(() => {
    setProfile(relationshipRepository.forCharacter(characterId));
    setGrowthPreview(null);
    setGrowthStatus("");
    const reload = () =>
      setProfile(relationshipRepository.forCharacter(characterId));
    window.addEventListener(relationshipRepository.changeEvent, reload);
    return () =>
      window.removeEventListener(relationshipRepository.changeEvent, reload);
  }, [characterId]);

  const sharedEvents = useMemo(
    () =>
      events.filter((event) => event.participantIds.includes(characterId)),
    [events, characterId],
  );
  const milestones = sharedEvents.filter((event) => event.kind === "couple");
  const activeCharacter = characterMap.get(characterId);
  const firstEvent = sharedEvents.at(-1);
  const knownDays = firstEvent
    ? Math.max(1, Math.floor((Date.now() - firstEvent.eventAt) / 86_400_000) + 1)
    : 0;

  function saveMilestone() {
    if (!characterId || !title.trim()) return;
    lifeTimelineRepository.save(
      lifeTimelineRepository.create("couple", {
        participantIds: [characterId],
        actor: "shared",
        title,
        content,
        eventAt: dateInputToTimestamp(date),
      }),
    );
    setTitle("");
    setContent("");
  }

  function remove(eventId: string) {
    if (!window.confirm("删除这条共同里程碑吗？")) return;
    lifeTimelineRepository.remove(eventId);
  }

  async function reviewGrowth() {
    if (!characterId || reviewing) return;
    setReviewing(true);
    setGrowthPreview(null);
    setGrowthStatus("图书管理员正在核对近期共同生活…");
    try {
      const preview = await relationshipGrowthEngine.review(characterId);
      setGrowthPreview(preview);
      setGrowthStatus("整理完成；确认前不会修改关系档案");
    } catch (error) {
      setGrowthStatus(error instanceof Error ? error.message : "关系整理失败");
    } finally {
      setReviewing(false);
    }
  }

  function confirmGrowth() {
    if (!growthPreview) return;
    const next = relationshipGrowthEngine.commit(growthPreview);
    setProfile(next);
    setGrowthPreview(null);
    setGrowthStatus("关系档案已更新，并留下了一条兔兔时间线记录");
  }

  function previewValue(key: keyof RelationshipMetrics) {
    if (!growthPreview) return profile?.metrics[key] ?? 0;
    return Math.max(
      0,
      Math.min(100, growthPreview.before.metrics[key] + growthPreview.deltas[key]),
    );
  }

  return (
    <section className="life-app couple-space-app">
      <LifeAppHeading eyebrow="LIFE · TWO OF US" title="情侣空间" description="这里汇总与同一角色有关的短信、日记、照片、朋友圈和共同里程碑。" />

      <section className="couple-hero">
        <div className="couple-avatar user">兔</div>
        <span>♡</span>
        <div className="couple-avatar">
          {activeCharacter?.avatar ? <img src={activeCharacter.avatar} alt="" /> : activeCharacter?.name.slice(0, 1) || "?"}
        </div>
        <CharacterSelect characters={characters} value={characterId} onChange={setCharacterId} allowNone={false} label="当前共同空间" />
        <div className="couple-stats"><article><strong>{sharedEvents.length}</strong><span>共同记录</span></article><article><strong>{milestones.length}</strong><span>里程碑</span></article><article><strong>{knownDays}</strong><span>时间线天数</span></article></div>
      </section>

      <section className="relationship-profile-card">
        <header>
          <div>
            <span>RELATIONSHIP FILE</span>
            <strong>关系档案 · {profile ? stageLabels[profile.stage] : "等待连接"}</strong>
          </div>
          <button type="button" disabled={!characterId || reviewing} onClick={() => void reviewGrowth()}>
            {reviewing ? "整理中…" : "整理近期关系"}
          </button>
        </header>
        {profile ? (
          <>
            <div className="relationship-metrics">
              {(Object.keys(metricLabels) as Array<keyof RelationshipMetrics>).map((key) => (
                <article key={key}>
                  <div><span>{metricLabels[key]}</span><strong>{profile.metrics[key]}</strong></div>
                  <i><b style={{ width: `${profile.metrics[key]}%` }} /></i>
                </article>
              ))}
            </div>
            <div className="relationship-notes">
              <p><strong>当前关系</strong>{profile.summary}</p>
              <p><strong>彼此印象</strong>{profile.impression}</p>
            </div>
          </>
        ) : (
          <p className="life-empty">创建并选择角色档案后，这里会出现专属关系档案。</p>
        )}
        {growthStatus && <p className="relationship-status" role="status">{growthStatus}</p>}
      </section>

      {growthPreview && (
        <section className="relationship-growth-preview">
          <header><span>等待兔兔确认</span><strong>{growthPreview.title}</strong></header>
          <p>{growthPreview.reason}</p>
          <div className="growth-stage">
            <span>{stageLabels[growthPreview.before.stage]}</span><b>→</b><strong>{stageLabels[growthPreview.stage]}</strong>
          </div>
          <div className="growth-deltas">
            {(Object.keys(metricLabels) as Array<keyof RelationshipMetrics>).map((key) => (
              <article key={key}>
                <span>{metricLabels[key]}</span>
                <small>{growthPreview.before.metrics[key]} → {previewValue(key)}</small>
                <strong className={growthPreview.deltas[key] > 0 ? "positive" : growthPreview.deltas[key] < 0 ? "negative" : ""}>
                  {growthPreview.deltas[key] > 0 ? "+" : ""}{growthPreview.deltas[key]}
                </strong>
              </article>
            ))}
          </div>
          <div className="growth-preview-copy">
            <p><strong>更新后的关系</strong>{growthPreview.summary}</p>
            <p><strong>更新后的印象</strong>{growthPreview.impression}</p>
          </div>
          <div className="growth-preview-actions">
            <button type="button" onClick={() => { setGrowthPreview(null); setGrowthStatus("已放弃本次整理，关系档案没有变化"); }}>放弃</button>
            <button type="button" className="confirm" onClick={confirmGrowth}>确认这次成长</button>
          </div>
        </section>
      )}

      <section className="life-composer couple-composer">
        <strong>写下共同里程碑</strong>
        <label className="life-field">发生日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <input value={title} placeholder="例如：第一次一起旅行" onChange={(event) => setTitle(event.target.value)} />
        <textarea rows={3} value={content} placeholder="想记住的细节（可选）" onChange={(event) => setContent(event.target.value)} />
        <button type="button" disabled={!characterId || !title.trim()} onClick={saveMilestone}>收进共同时间线</button>
      </section>

      <section className="couple-milestones">
        <header><strong>共同里程碑</strong><span>{activeCharacter?.remark || activeCharacter?.name || "等待角色"}</span></header>
        {milestones.length === 0 && <p className="life-empty">还没有专属里程碑。</p>}
        {milestones.map((event) => (
          <article key={event.id}><span>♡</span><div><strong>{event.title}</strong><p>{event.content || "这一天值得被记住。"}</p><time>{new Date(event.eventAt).toLocaleDateString("zh-CN")}</time></div><button type="button" aria-label="删除共同里程碑" onClick={() => remove(event.id)}>×</button></article>
        ))}
      </section>

      <section className="couple-shared-stream">
        <header><strong>我们发生过的一切</strong><span>生活互动与关系成长共用</span></header>
        {sharedEvents.length === 0 && <p className="life-empty">给生活事件选择这位角色后，它就会自动出现在这里。</p>}
        {sharedEvents.slice(0, 10).map((event) => (
          <article key={event.id}><span>{lifeKindMeta[event.kind].icon}</span><div><strong>{event.title || lifeKindMeta[event.kind].label}</strong><small>{lifeKindMeta[event.kind].label} · {new Date(event.eventAt).toLocaleDateString("zh-CN")}</small></div></article>
        ))}
      </section>
      <TimelinePreview events={events} characterMap={characterMap} limit={4} />
    </section>
  );
}
