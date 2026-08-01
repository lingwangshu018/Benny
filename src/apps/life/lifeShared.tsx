import { useEffect, useMemo, useState } from "react";
import { libraryRepository } from "../../storage/libraryRepository";
import { lifeTimelineRepository } from "../../storage/lifeTimelineRepository";
import type { LifeEvent, LifeEventKind } from "../../types/life";
import type { CharacterCard } from "../../types/library";

export const lifeKindMeta: Record<
  LifeEventKind,
  { label: string; icon: string }
> = {
  moment: { label: "朋友圈", icon: "◎" },
  sms: { label: "短信", icon: "✉" },
  diary: { label: "日记", icon: "✎" },
  photo: { label: "照片", icon: "▧" },
  couple: { label: "共同里程碑", icon: "♡" },
  relationship: { label: "关系成长", icon: "↗" },
  offline: { label: "离线活动", icon: "◌" },
  call: { label: "角色电话", icon: "☎" },
};

function availableCharacters() {
  return libraryRepository
    .characters()
    .filter((character) => character.enabled && character.kind !== "user");
}

export function useLifeTimeline() {
  const [events, setEvents] = useState(() => lifeTimelineRepository.all());
  const [characters, setCharacters] =
    useState<CharacterCard[]>(availableCharacters);

  useEffect(() => {
    const reloadEvents = () => setEvents(lifeTimelineRepository.all());
    const reloadCharacters = () => setCharacters(availableCharacters());
    window.addEventListener(lifeTimelineRepository.changeEvent, reloadEvents);
    window.addEventListener(libraryRepository.changeEvent, reloadCharacters);
    return () => {
      window.removeEventListener(
        lifeTimelineRepository.changeEvent,
        reloadEvents,
      );
      window.removeEventListener(
        libraryRepository.changeEvent,
        reloadCharacters,
      );
    };
  }, []);

  const characterMap = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters],
  );

  return { events, characters, characterMap };
}

export function CharacterSelect({
  characters,
  value,
  onChange,
  allowNone = true,
  label = "参与角色",
}: {
  characters: CharacterCard[];
  value: string;
  onChange: (value: string) => void;
  allowNone?: boolean;
  label?: string;
}) {
  return (
    <label className="life-field">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {allowNone && <option value="">只属于兔兔自己</option>}
        {!allowNone && characters.length === 0 && (
          <option value="">请先创建角色档案</option>
        )}
        {characters.map((character) => (
          <option value={character.id} key={character.id}>
            {character.remark || character.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function LifeAppHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="life-app-heading">
      <span>{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

export function TimelinePreview({
  events,
  characterMap,
  empty = "时间线还很安静。",
  limit = 6,
}: {
  events: LifeEvent[];
  characterMap: Map<string, CharacterCard>;
  empty?: string;
  limit?: number;
}) {
  const visible = events.slice(0, limit);
  return (
    <section className="life-timeline-preview">
      <header>
        <strong>兔兔时间线</strong>
        <span>所有生活应用共用</span>
      </header>
      {visible.length === 0 && <p className="life-empty">{empty}</p>}
      {visible.map((event) => {
        const meta = lifeKindMeta[event.kind];
        const participants = event.participantIds
          .map((id) => characterMap.get(id)?.remark || characterMap.get(id)?.name)
          .filter(Boolean)
          .join("、");
        return (
          <article className="life-timeline-row" key={event.id}>
            <span>{meta.icon}</span>
            <div>
              <strong>{event.title || meta.label}</strong>
              <small>
                {meta.label}
                {participants ? ` · ${participants}` : " · 兔兔"}
              </small>
            </div>
            <time>
              {new Date(event.eventAt).toLocaleDateString("zh-CN", {
                month: "2-digit",
                day: "2-digit",
              })}
            </time>
          </article>
        );
      })}
    </section>
  );
}

export function characterLabel(
  id: string,
  characterMap: Map<string, CharacterCard>,
) {
  const character = characterMap.get(id);
  return character?.remark || character?.name || "已离开的角色";
}

export function toDateInput(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function dateInputToTimestamp(value: string) {
  const timestamp = new Date(`${value}T12:00:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}
