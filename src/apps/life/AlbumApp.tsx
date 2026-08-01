import { useEffect, useRef, useState } from "react";
import { largeStorageRepository } from "../../storage/largeStorageRepository";
import { lifeTimelineRepository } from "../../storage/lifeTimelineRepository";
import type { LifeEvent } from "../../types/life";
import {
  CharacterSelect,
  LifeAppHeading,
  TimelinePreview,
  characterLabel,
  useLifeTimeline,
} from "./lifeShared";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

function StoredPhoto({ photo }: { photo: LifeEvent }) {
  const [source, setSource] = useState(
    largeStorageRepository.isPhotoReference(photo.media) ? "" : photo.media,
  );

  useEffect(() => {
    if (!largeStorageRepository.isPhotoReference(photo.media)) {
      setSource(photo.media);
      return;
    }
    let objectUrl = "";
    let alive = true;
    void largeStorageRepository.readPhoto(photo.media).then((blob) => {
      if (!alive || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setSource(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo.media]);

  return source ? (
    <img src={source} alt={photo.title} />
  ) : (
    <div className="photo-loading">正在读取照片…</div>
  );
}

export function AlbumApp() {
  const { events, characters, characterMap } = useLifeTimeline();
  const inputRef = useRef<HTMLInputElement>(null);
  const migrationStarted = useRef(new Set<string>());
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [media, setMedia] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [characterId, setCharacterId] = useState("");
  const [status, setStatus] = useState("");
  const photos = events.filter((event) => event.kind === "photo");

  useEffect(() => {
    const legacyPhotos = photos.filter(
      (photo) =>
        photo.media.startsWith("data:image/") &&
        !migrationStarted.current.has(photo.id),
    );
    if (legacyPhotos.length === 0) return;
    legacyPhotos.forEach((photo) => migrationStarted.current.add(photo.id));
    let alive = true;
    void (async () => {
      let migrated = 0;
      for (const photo of legacyPhotos) {
        const blob = await fetch(photo.media).then((response) => response.blob());
        const reference = await largeStorageRepository.savePhoto(photo.id, blob);
        lifeTimelineRepository.save({ ...photo, media: reference });
        migrated += 1;
      }
      if (alive) setStatus(`已把 ${migrated} 张旧照片搬入大容量相册。`);
    })().catch((error) => {
      if (alive) {
        setStatus(error instanceof Error ? error.message : "旧照片迁移失败。");
      }
    });
    return () => {
      alive = false;
    };
  }, [photos]);

  useEffect(
    () => () => {
      if (media.startsWith("blob:")) URL.revokeObjectURL(media);
    },
    [media],
  );

  function chooseImage(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setStatus("单张照片不能超过 25 MB，请压缩后再保存。");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setStatus("请选择图片文件。");
      return;
    }
    if (media.startsWith("blob:")) URL.revokeObjectURL(media);
    setSelectedFile(file);
    setMedia(URL.createObjectURL(file));
    setStatus(`照片已准备好（${(file.size / 1024 / 1024).toFixed(2)} MB），确认后写入大容量相册。`);
  }

  async function save() {
    if (!selectedFile || !title.trim()) return;
    const photo = lifeTimelineRepository.create("photo", {
        participantIds: characterId ? [characterId] : [],
        title,
        content,
        media: "",
      });
    try {
      const reference = await largeStorageRepository.savePhoto(
        photo.id,
        selectedFile,
      );
      lifeTimelineRepository.save({ ...photo, media: reference });
      if (media.startsWith("blob:")) URL.revokeObjectURL(media);
      setTitle("");
      setContent("");
      setMedia("");
      setSelectedFile(null);
      setStatus("照片已进入 IndexedDB 大容量相册和兔兔时间线。");
      if (inputRef.current) inputRef.current.value = "";
    } catch (error) {
      await largeStorageRepository.removePhoto(photo.id).catch(() => undefined);
      setStatus(error instanceof Error ? error.message : "照片保存失败。");
    }
  }

  async function remove(eventId: string) {
    if (!window.confirm("删除这张照片和对应的时间线记录吗？")) return;
    await largeStorageRepository.removePhoto(eventId).catch(() => undefined);
    lifeTimelineRepository.remove(eventId);
  }

  return (
    <section className="life-app album-app">
      <LifeAppHeading eyebrow="LIFE · INDEXEDDB ALBUM · v0.21" title="相册" description="照片保存在浏览器的大容量相册中，并通过数据保险箱一起备份。" />

      <section className="life-composer album-composer">
        <button className="album-picker" type="button" onClick={() => inputRef.current?.click()}>
          {media ? <img src={media} alt="待保存照片" /> : <span>＋<small>选择本地照片</small></span>}
        </button>
        <input ref={inputRef} className="sr-only" type="file" accept="image/*" onChange={(event) => chooseImage(event.target.files?.[0])} />
        <input value={title} placeholder="照片标题" onChange={(event) => setTitle(event.target.value)} />
        <textarea rows={3} value={content} placeholder="写下一句照片说明（可选）" onChange={(event) => setContent(event.target.value)} />
        <CharacterSelect characters={characters} value={characterId} onChange={setCharacterId} />
        {status && <p className="life-form-status">{status}</p>}
        <button type="button" disabled={!selectedFile || !title.trim()} onClick={() => void save()}>保存到相册</button>
      </section>

      <div className="album-grid">
        {photos.length === 0 && <p className="life-empty">相册还是空的，保存第一张照片吧。</p>}
        {photos.map((photo) => {
          const participant = photo.participantIds[0];
          return (
            <article className="photo-card" key={photo.id}>
              <StoredPhoto photo={photo} />
              <div><strong>{photo.title}</strong><span>{participant ? characterLabel(participant, characterMap) : "兔兔"}</span></div>
              <button type="button" aria-label="删除照片" onClick={() => void remove(photo.id)}>×</button>
            </article>
          );
        })}
      </div>
      <TimelinePreview events={events} characterMap={characterMap} limit={4} />
    </section>
  );
}
