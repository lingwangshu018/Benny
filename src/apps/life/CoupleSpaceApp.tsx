import { useEffect, useMemo, useState } from "react";
import { lifeTimelineRepository } from "../../storage/lifeTimelineRepository";
import {
  CharacterSelect,
  LifeAppHeading,
  TimelinePreview,
  dateInputToTimestamp,
  lifeKindMeta,
  toDateInput,
  useLifeTimeline,
} from "./lifeShared";

export function CoupleSpaceApp() {
  const { events, characters, characterMap } = useLifeTimeline();
  const [characterId, setCharacterId] = useState(characters[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [date, setDate] = useState(toDateInput());

  useEffect(() => {
    if (!characters.some((character) => character.id === characterId)) {
      setCharacterId(characters[0]?.id ?? "");
    }
  }, [characters, characterId]);

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
        <header><strong>我们发生过的一切</strong><span>来自五个生活应用</span></header>
        {sharedEvents.length === 0 && <p className="life-empty">给生活事件选择这位角色后，它就会自动出现在这里。</p>}
        {sharedEvents.slice(0, 10).map((event) => (
          <article key={event.id}><span>{lifeKindMeta[event.kind].icon}</span><div><strong>{event.title || lifeKindMeta[event.kind].label}</strong><small>{lifeKindMeta[event.kind].label} · {new Date(event.eventAt).toLocaleDateString("zh-CN")}</small></div></article>
        ))}
      </section>
      <TimelinePreview events={events} characterMap={characterMap} limit={4} />
    </section>
  );
}
