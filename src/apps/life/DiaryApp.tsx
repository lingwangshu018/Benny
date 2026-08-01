import { useState } from "react";
import { lifeTimelineRepository } from "../../storage/lifeTimelineRepository";
import {
  CharacterSelect,
  LifeAppHeading,
  TimelinePreview,
  characterLabel,
  dateInputToTimestamp,
  toDateInput,
  useLifeTimeline,
} from "./lifeShared";

const moods = ["平静", "开心", "心动", "想念", "疲惫", "难过"];

export function DiaryApp() {
  const { events, characters, characterMap } = useLifeTimeline();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mood, setMood] = useState("平静");
  const [characterId, setCharacterId] = useState("");
  const [date, setDate] = useState(toDateInput());
  const diaries = events.filter((event) => event.kind === "diary");

  function save() {
    if (!title.trim() || !content.trim()) return;
    lifeTimelineRepository.save(
      lifeTimelineRepository.create("diary", {
        participantIds: characterId ? [characterId] : [],
        title,
        content,
        mood,
        eventAt: dateInputToTimestamp(date),
      }),
    );
    setTitle("");
    setContent("");
  }

  function remove(eventId: string) {
    if (!window.confirm("删除这篇日记吗？")) return;
    lifeTimelineRepository.remove(eventId);
  }

  return (
    <section className="life-app diary-app">
      <LifeAppHeading eyebrow="LIFE · PRIVATE DIARY" title="日记" description="写给兔兔自己的文字，也可以标记故事里出现的角色。" />

      <section className="life-composer diary-composer">
        <div className="life-two-columns">
          <label className="life-field">日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label className="life-field">心情<select value={mood} onChange={(event) => setMood(event.target.value)}>{moods.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        <input value={title} placeholder="给今天起一个标题" onChange={(event) => setTitle(event.target.value)} />
        <textarea rows={6} value={content} placeholder="今天发生了什么？" onChange={(event) => setContent(event.target.value)} />
        <CharacterSelect characters={characters} value={characterId} onChange={setCharacterId} />
        <button type="button" disabled={!title.trim() || !content.trim()} onClick={save}>收进日记本</button>
      </section>

      <div className="diary-list">
        {diaries.length === 0 && <p className="life-empty">第一页还是空白的。</p>}
        {diaries.map((entry) => {
          const participant = entry.participantIds[0];
          return (
            <article className="diary-card" key={entry.id}>
              <header><time>{new Date(entry.eventAt).toLocaleDateString("zh-CN")}</time><span>{entry.mood}</span><button type="button" aria-label="删除日记" onClick={() => remove(entry.id)}>×</button></header>
              <h2>{entry.title}</h2>
              <p>{entry.content}</p>
              {participant && <small>这一页里有 {characterLabel(participant, characterMap)}</small>}
            </article>
          );
        })}
      </div>
      <TimelinePreview events={events} characterMap={characterMap} limit={4} />
    </section>
  );
}
