import { useEffect, useState } from "react";
import { largeStorageRepository } from "../../storage/largeStorageRepository";
import type { ChatVoiceAttachment } from "../../types/ai";

function durationLabel(durationMs: number) {
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function VoiceMessageAudio({ voice }: { voice: ChatVoiceAttachment }) {
  const [source, setSource] = useState("");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let objectUrl = "";
    let alive = true;
    void largeStorageRepository
      .readVoice(voice.reference)
      .then((blob) => {
        if (!alive) return;
        if (!blob) {
          setMissing(true);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [voice.reference]);

  if (missing) {
    return <p className="voice-missing">语音文件不在当前设备，请从数据保险箱恢复。</p>;
  }
  return (
    <div className="voice-message-player">
      <span aria-hidden="true">◖)))</span>
      {source ? <audio controls preload="metadata" src={source} /> : <em>读取中…</em>}
      <small>{durationLabel(voice.durationMs)}</small>
    </div>
  );
}
