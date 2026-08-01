import { useEffect, useRef, useState } from "react";

interface CallLine {
  id: string;
  speaker: "user" | "character";
  content: string;
}

interface SpeechRecognitionResultLike {
  0?: { transcript?: string };
}

interface SpeechRecognitionEventLike {
  results?: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

interface CharacterCallPanelProps {
  characterName: string;
  characterAvatar: string;
  voiceHint: string;
  disabled: boolean;
  onTurn: (content: string) => Promise<string | null>;
  onEnd: (durationMs: number, turns: number) => void;
}

function clockLabel(durationMs: number) {
  const seconds = Math.floor(durationMs / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function recognitionFactory() {
  const source = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return source.SpeechRecognition ?? source.webkitSpeechRecognition;
}

export function CharacterCallPanel({
  characterName,
  characterAvatar,
  voiceHint,
  disabled,
  onTurn,
  onEnd,
}: CharacterCallPanelProps) {
  const startedAt = useRef(Date.now());
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("通话已接通");
  const [lines, setLines] = useState<CallLine[]>([]);

  useEffect(() => {
    const timer = window.setInterval(
      () => setElapsed(Date.now() - startedAt.current),
      1000,
    );
    return () => {
      window.clearInterval(timer);
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);

  function speak(content: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = "zh-CN";
    const hint = voiceHint.trim().toLocaleLowerCase();
    if (hint) {
      const voice = window.speechSynthesis
        .getVoices()
        .find((item) => item.name.toLocaleLowerCase().includes(hint));
      if (voice) utterance.voice = voice;
    }
    window.speechSynthesis.speak(utterance);
  }

  function listen() {
    const Recognition = recognitionFactory();
    if (!Recognition) {
      setStatus("当前浏览器没有语音转文字，可以直接在下面输入后发送。");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const last = event.results?.[event.results.length - 1];
      const transcript = last?.[0]?.transcript?.trim();
      if (transcript) setDraft(transcript);
    };
    recognition.onerror = () => setStatus("没有听清，可以再试一次或直接输入。 ");
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    setStatus("正在听兔兔说话…");
    recognition.start();
  }

  async function sendTurn() {
    const content = draft.trim();
    if (!content || busy || disabled) return;
    const userLine: CallLine = {
      id: `call_user_${Date.now()}`,
      speaker: "user",
      content,
    };
    setLines((current) => [...current, userLine]);
    setDraft("");
    setBusy(true);
    setStatus(`${characterName}正在回应…`);
    const response = await onTurn(content);
    if (response) {
      setLines((current) => [
        ...current,
        {
          id: `call_character_${Date.now()}`,
          speaker: "character",
          content: response,
        },
      ]);
      speak(response);
      setStatus("通话中");
    } else {
      setStatus("这句话没有成功送达，可以重试。");
    }
    setBusy(false);
  }

  function endCall() {
    onEnd(Date.now() - startedAt.current, lines.filter((line) => line.speaker === "user").length);
  }

  return (
    <section className="character-call" aria-label={`与${characterName}通话`}>
      <div className="call-aurora" aria-hidden="true" />
      <header>
        <span>角色电话 · v0.22</span>
        <time>{clockLabel(elapsed)}</time>
      </header>
      <div className="call-avatar">
        {characterAvatar ? <img src={characterAvatar} alt="" /> : characterName.slice(0, 1)}
      </div>
      <h1>{characterName}</h1>
      <p className="call-status">{status}</p>
      <div className="call-transcript">
        {lines.length === 0 ? (
          <p>说句话吧。电话内容会进入当前角色会话，并继续使用角色档案、世界书和记忆。</p>
        ) : (
          lines.slice(-4).map((line) => (
            <p className={line.speaker} key={line.id}>
              <strong>{line.speaker === "user" ? "兔兔" : characterName}</strong>
              {line.content}
            </p>
          ))
        )}
      </div>
      <div className="call-input">
        <button
          type="button"
          className={listening ? "listening" : ""}
          disabled={busy || disabled}
          onClick={listen}
          aria-label="语音输入"
        >
          {listening ? "●" : "麦"}
        </button>
        <input
          value={draft}
          disabled={busy || disabled}
          placeholder="对角色说…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void sendTurn();
          }}
        />
        <button type="button" disabled={!draft.trim() || busy || disabled} onClick={() => void sendTurn()}>发送</button>
      </div>
      <button className="call-end" type="button" onClick={endCall}>
        挂断
      </button>
    </section>
  );
}
