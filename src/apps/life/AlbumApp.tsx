import { useRef, useState } from "react";
import { lifeTimelineRepository } from "../../storage/lifeTimelineRepository";
import {
  CharacterSelect,
  LifeAppHeading,
  TimelinePreview,
  characterLabel,
  useLifeTimeline,
} from "./lifeShared";

const MAX_IMAGE_BYTES = 1_500_000;

export function AlbumApp() {
  const { events, characters, characterMap } = useLifeTimeline();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [media, setMedia] = useState("");
  const [characterId, setCharacterId] = useState("");
  const [status, setStatus] = useState("");
  const photos = events.filter((event) => event.kind === "photo");

  function chooseImage(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setStatus("图片超过 1.5 MB，请压缩后再保存，避免本地空间过快用完。");
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        setMedia(reader.result);
        setStatus("图片已经准备好，还没有写入时间线。");
      }
    });
    reader.readAsDataURL(file);
  }

  function save() {
    if (!media || !title.trim()) return;
    lifeTimelineRepository.save(
      lifeTimelineRepository.create("photo", {
        participantIds: characterId ? [characterId] : [],
        title,
        content,
        media,
      }),
    );
    setTitle("");
    setContent("");
    setMedia("");
    setStatus("照片已进入兔兔时间线。");
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(eventId: string) {
    if (!window.confirm("删除这张照片和对应的时间线记录吗？")) return;
    lifeTimelineRepository.remove(eventId);
  }

  return (
    <section className="life-app album-app">
      <LifeAppHeading eyebrow="LIFE · LOCAL ALBUM" title="相册" description="照片保存在当前浏览器，并通过数据保险箱一起备份。" />

      <section className="life-composer album-composer">
        <button className="album-picker" type="button" onClick={() => inputRef.current?.click()}>
          {media ? <img src={media} alt="待保存照片" /> : <span>＋<small>选择本地照片</small></span>}
        </button>
        <input ref={inputRef} className="sr-only" type="file" accept="image/*" onChange={(event) => chooseImage(event.target.files?.[0])} />
        <input value={title} placeholder="照片标题" onChange={(event) => setTitle(event.target.value)} />
        <textarea rows={3} value={content} placeholder="写下一句照片说明（可选）" onChange={(event) => setContent(event.target.value)} />
        <CharacterSelect characters={characters} value={characterId} onChange={setCharacterId} />
        {status && <p className="life-form-status">{status}</p>}
        <button type="button" disabled={!media || !title.trim()} onClick={save}>保存到相册</button>
      </section>

      <div className="album-grid">
        {photos.length === 0 && <p className="life-empty">相册还是空的，保存第一张照片吧。</p>}
        {photos.map((photo) => {
          const participant = photo.participantIds[0];
          return (
            <article className="photo-card" key={photo.id}>
              <img src={photo.media} alt={photo.title} />
              <div><strong>{photo.title}</strong><span>{participant ? characterLabel(participant, characterMap) : "兔兔"}</span></div>
              <button type="button" aria-label="删除照片" onClick={() => remove(photo.id)}>×</button>
            </article>
          );
        })}
      </div>
      <TimelinePreview events={events} characterMap={characterMap} limit={4} />
    </section>
  );
}
