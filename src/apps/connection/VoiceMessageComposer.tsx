import { useEffect, useRef, useState } from "react";

interface VoiceMessageComposerProps {
  disabled: boolean;
  onClose: () => void;
  onSend: (audio: Blob, transcript: string, durationMs: number) => Promise<void>;
}

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

function recorderMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function VoiceMessageComposer({
  disabled,
  onClose,
  onSend,
}: VoiceMessageComposerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const [recording, setRecording] = useState(false);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState("按下录音，或选择已有音频文件。文字内容会帮助角色理解这段语音。");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(
      () => setElapsed(Date.now() - startedAtRef.current),
      250,
    );
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(
    () => () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function startRecording() {
    if (!("MediaRecorder" in window) || !navigator.mediaDevices?.getUserMedia) {
      setStatus("这个浏览器暂时不能直接录音，可以选择一个音频文件发送。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = recorderMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsed(0);
      setAudio(null);
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        const nextDuration = Math.max(500, Date.now() - startedAtRef.current);
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        setAudio(blob);
        setDurationMs(nextDuration);
        setElapsed(nextDuration);
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        setStatus("录音完成。补充文字内容后即可发送。");
      });
      recorder.start(250);
      setRecording(true);
      setStatus("正在录音…说完后按停止。");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `无法开始录音：${error.message}`
          : "无法使用麦克风，可以改为选择音频文件。",
      );
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function chooseAudio(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setStatus("请选择音频文件。");
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      setStatus("单条语音不能超过 20 MB。");
      return;
    }
    setAudio(file);
    setDurationMs(0);
    setStatus(`已选择 ${(file.size / 1024 / 1024).toFixed(2)} MB 音频。`);
  }

  async function sendVoice() {
    if (!audio || !transcript.trim() || sending) return;
    setSending(true);
    try {
      await onSend(audio, transcript.trim(), durationMs);
      onClose();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "语音发送失败。");
    } finally {
      setSending(false);
    }
  }

  const seconds = Math.max(0, Math.round(elapsed / 1000));
  return (
    <section className="voice-composer" aria-label="发送语音消息">
      <header>
        <strong>语音消息</strong>
        <button type="button" onClick={onClose} aria-label="关闭语音面板">×</button>
      </header>
      <div className={`voice-orb${recording ? " recording" : ""}`}>
        <span>{recording ? "●" : "◖)))"}</span>
        <strong>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</strong>
      </div>
      <div className="voice-composer-actions">
        {recording ? (
          <button type="button" onClick={stopRecording}>停止录音</button>
        ) : (
          <button type="button" disabled={disabled} onClick={() => void startRecording()}>开始录音</button>
        )}
        <button type="button" disabled={recording || disabled} onClick={() => fileRef.current?.click()}>选择音频</button>
      </div>
      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept="audio/*"
        onChange={(event) => chooseAudio(event.target.files?.[0])}
      />
      <textarea
        rows={2}
        value={transcript}
        placeholder="这段语音说了什么？"
        onChange={(event) => setTranscript(event.target.value)}
      />
      <p>{status}</p>
      <button
        className="voice-send-button"
        type="button"
        disabled={!audio || !transcript.trim() || sending}
        onClick={() => void sendVoice()}
      >
        {sending ? "正在保存…" : "发送语音"}
      </button>
    </section>
  );
}
