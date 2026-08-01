import { useEffect, useMemo, useState } from "react";
import { lifeTimelineRepository } from "../../storage/lifeTimelineRepository";
import type { LifeEventActor } from "../../types/life";
import {
  CharacterSelect,
  LifeAppHeading,
  TimelinePreview,
  useLifeTimeline,
} from "./lifeShared";

export function SmsApp() {
  const { events, characters, characterMap } = useLifeTimeline();
  const [characterId, setCharacterId] = useState(characters[0]?.id ?? "");
  const [actor, setActor] = useState<LifeEventActor>("user");
  const [content, setContent] = useState("");

  useEffect(() => {
    if (!characters.some((character) => character.id === characterId)) {
      setCharacterId(characters[0]?.id ?? "");
    }
  }, [characters, characterId]);

  const messages = useMemo(
    () =>
      events
        .filter(
          (event) =>
            event.kind === "sms" && event.participantIds.includes(characterId),
        )
        .reverse(),
    [events, characterId],
  );
  const activeCharacter = characterMap.get(characterId);

  function send() {
    if (!characterId || !content.trim()) return;
    lifeTimelineRepository.save(
      lifeTimelineRepository.create("sms", {
        participantIds: [characterId],
        actor,
        title:
          actor === "character"
            ? `${activeCharacter?.remark || activeCharacter?.name || "角色"}发来短信`
            : `给${activeCharacter?.remark || activeCharacter?.name || "角色"}的短信`,
        content,
      }),
    );
    setContent("");
  }

  function remove(eventId: string) {
    if (!window.confirm("删除这条短信吗？")) return;
    lifeTimelineRepository.remove(eventId);
  }

  return (
    <section className="life-app sms-app">
      <LifeAppHeading
        eyebrow="LIFE · SHORT MESSAGES"
        title="短信"
        description="轻量记录彼此发来的短消息，并与角色生活时间线保持一致。"
      />

      <section className="sms-contact-card">
        <div className="life-large-avatar">
          {activeCharacter?.avatar ? <img src={activeCharacter.avatar} alt="" /> : activeCharacter?.name.slice(0, 1) || "?"}
        </div>
        <CharacterSelect
          characters={characters}
          value={characterId}
          onChange={setCharacterId}
          allowNone={false}
          label="当前联系人"
        />
      </section>

      <div className="sms-thread">
        {characters.length === 0 && <p className="life-empty">请先在角色档案创建一位联系人。</p>}
        {characters.length > 0 && messages.length === 0 && <p className="life-empty">还没有短信，写下第一句吧。</p>}
        {messages.map((message) => (
          <article className={`sms-bubble ${message.actor}`} key={message.id}>
            <p>{message.content}</p>
            <footer>
              <time>{new Date(message.eventAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>
              <button type="button" aria-label="删除短信" onClick={() => remove(message.id)}>×</button>
            </footer>
          </article>
        ))}
      </div>

      <section className="sms-composer">
        <div className="sms-direction">
          <button className={actor === "user" ? "active" : ""} type="button" onClick={() => setActor("user")}>兔兔发出</button>
          <button className={actor === "character" ? "active" : ""} type="button" onClick={() => setActor("character")}>角色发来</button>
        </div>
        <div>
          <input value={content} placeholder="写一条短信…" onChange={(event) => setContent(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") send(); }} />
          <button type="button" disabled={!characterId || !content.trim()} onClick={send}>↑</button>
        </div>
      </section>

      <TimelinePreview events={events.filter((event) => event.participantIds.includes(characterId))} characterMap={characterMap} limit={4} />
    </section>
  );
}
