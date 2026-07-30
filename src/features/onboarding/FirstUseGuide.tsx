import { aiSettingsRepository } from "../../storage/aiSettingsRepository";
import { libraryRepository } from "../../storage/libraryRepository";
import type { AppId } from "../../types/phone";

interface FirstUseGuideProps {
  onClose: () => void;
  onOpen: (appId: AppId) => void;
}

export const ONBOARDING_KEY = "aether.onboarding.v1";

export function FirstUseGuide({ onClose, onOpen }: FirstUseGuideProps) {
  const snapshot = libraryRepository.exportSnapshot();
  const aiSettings = aiSettingsRepository.read();
  const hasCharacter = snapshot.characters.length > 0;
  const hasContext =
    snapshot.worldbooks.length > 0 || snapshot.presets.length > 0;
  const hasAI = Boolean(
    aiSettings.baseUrl && aiSettings.model && aiSettings.apiKey,
  );

  function open(appId: AppId) {
    window.localStorage.setItem(ONBOARDING_KEY, "started");
    onClose();
    onOpen(appId);
  }

  function dismiss() {
    window.localStorage.setItem(ONBOARDING_KEY, "dismissed");
    onClose();
  }

  const steps: Array<{
    title: string;
    description: string;
    appId: AppId;
    action: string;
    done: boolean;
  }> = [
    {
      title: "把旧资料搬进来",
      description: "支持穗穗机、锁雾机和兔兔资料包，也可以从空白角色开始。",
      appId: "资料库",
      action: "去搬家",
      done: hasCharacter,
    },
    {
      title: "整理角色的世界",
      description: "检查角色档案、绑定世界书，并选好聊天预设。",
      appId: "角色档案",
      action: "看角色",
      done: hasCharacter && hasContext,
    },
    {
      title: "连接自己的模型",
      description: "填写 API 地址、密钥和模型；密钥不会跟资料包一起导出。",
      appId: "设置",
      action: "AI 设置",
      done: hasAI,
    },
    {
      title: "开始第一场聊天",
      description: "进入微信，选择角色。相关世界书、预设和记忆会自动整理。",
      appId: "微信",
      action: "去聊天",
      done: hasCharacter && hasAI,
    },
  ];

  return (
    <div className="onboarding-backdrop" role="presentation">
      <section
        className="onboarding-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <header>
          <span>欢迎抵达</span>
          <h1 id="onboarding-title">异世界连接</h1>
          <p>
            不必一次学会所有功能。先把角色带回家，再连接模型，就可以开始聊天。
          </p>
        </header>
        <div className="onboarding-steps">
          {steps.map((step, index) => (
            <article className={step.done ? "done" : ""} key={step.title}>
              <b>{step.done ? "✓" : index + 1}</b>
              <div>
                <strong>{step.title}</strong>
                <p>{step.description}</p>
              </div>
              <button type="button" onClick={() => open(step.appId)}>
                {step.done ? "查看" : step.action}
              </button>
            </article>
          ))}
        </div>
        <footer>
          <button type="button" onClick={dismiss}>
            稍后再说
          </button>
          <button type="button" className="primary" onClick={() => open("资料库")}>
            从资料搬家开始
          </button>
        </footer>
      </section>
    </div>
  );
}
