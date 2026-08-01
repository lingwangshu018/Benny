import { useState } from "react";
import { lifeTimelineRepository } from "../../storage/lifeTimelineRepository";
import {
  CharacterSelect,
  LifeAppHeading,
  TimelinePreview,
  characterLabel,
  useLifeTimeline,
} from "./lifeShared";

export function MomentsApp() {
  const { events, characters, characterMap } = useLifeTimeline();
  const [content, setContent] = useState("");
  const [media, setMedia] = useState("");
  const [characterId, setCharacterId] = useState("");
  const moments = events.filter((event) => event.kind === "moment");

  function publish() {
    if (!content.trim() && !media.trim()) return;
    lifeTimelineRepository.save(
      lifeTimelineRepository.create("moment", {
        participantIds: characterId ? [characterId] : [],
        title: content.trim().slice(0, 24) || "分享了一张照片",
        content,
        media,
      }),
    );
    setContent("");
    setMedia("");
  }

  function remove(eventId: string) {
    if (!window.confirm("删除这条朋友圈吗？它也会从兔兔时间线消失。")) return;
    lifeTimelineRepository.remove(eventId);
  }

  return (
    <section className="life-app moments-app">
      <LifeAppHeading
        eyebrow="LIFE · SHARED MOMENTS"
        title="朋友圈"
        description="这里发布的每一次生活分享，都会进入同一条兔兔时间线。"
      />

      <section className="life-composer moments-composer">
        <textarea
          rows={3}
          value={content}
          placeholder="今天想记录什么？"
          onChange={(event) => setContent(event.target.value)}
        />
        <input
          value={media}
          placeholder="图片地址（可选）"
          onChange={(event) => setMedia(event.target.value)}
        />
        <CharacterSelect
          characters={characters}
          value={characterId}
          onChange={setCharacterId}
        />
        <button type="button" onClick={publish}>发布朋友圈</button>
      </section>

      <div className="moment-feed">
        {moments.length === 0 && (
          <p className="life-empty">还没有朋友圈，留下第一条生活片段吧。</p>
        )}
        {moments.map((event) => {
          const participant = event.participantIds[0];
          return (
            <article className="moment-card" key={event.id}>
              <header>
                <div className="life-mini-avatar">兔</div>
                <div>
                  <strong>兔兔</strong>
                  <span>
                    {new Date(event.eventAt).toLocaleString("zh-CN", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <button type="button" aria-label="删除朋友圈" onClick={() => remove(event.id)}>×</button>
              </header>
              {event.content && <p>{event.content}</p>}
              {event.media && <img src={event.media} alt="朋友圈配图" />}
              {participant && (
                <small>与 {characterLabel(participant, characterMap)} 一起</small>
              )}
            </article>
          );
        })}
      </div>

      <TimelinePreview events={events} characterMap={characterMap} limit={4} />
    </section>
  );
}
