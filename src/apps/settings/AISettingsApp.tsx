import { useState } from "react";
import { openAICompatibleAdapter } from "../../ai/openAICompatibleAdapter";
import { vectorMemoryEngine } from "../../memory/vectorMemoryEngine";
import { aiSettingsRepository } from "../../storage/aiSettingsRepository";
import { memoryRepository } from "../../storage/memoryRepository";
import { memoryVectorRepository } from "../../storage/memoryVectorRepository";

export function AISettingsApp() {
  const [settings, setSettings] = useState(() => aiSettingsRepository.read());
  const [models, setModels] = useState<string[]>([]);
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  function save() {
    aiSettingsRepository.save({
      ...settings,
      baseUrl: settings.baseUrl.trim().replace(/\/+$/, ""),
      model: settings.model.trim(),
    });
    setStatus("设置已保存在这台设备");
  }

  async function loadModels() {
    setLoading(true);
    setStatus("");
    try {
      const nextModels = await openAICompatibleAdapter.listModels(settings);
      setModels(nextModels);
      setStatus(
        nextModels.length
          ? `连接成功，找到 ${nextModels.length} 个模型`
          : "连接成功，但接口没有返回模型列表",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "连接失败");
    } finally {
      setLoading(false);
    }
  }

  async function rebuildVectorIndex() {
    setLoading(true);
    setStatus("正在建立向量索引…");
    try {
      aiSettingsRepository.save(settings);
      const count = await vectorMemoryEngine.ensureIndexed(
        settings,
        memoryRepository.all(),
      );
      setStatus(
        count
          ? `向量索引完成，本次更新 ${count} 条记忆`
          : "向量索引已经是最新状态",
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? `向量索引失败：${error.message}` : "向量索引失败",
      );
    } finally {
      setLoading(false);
    }
  }

  async function clearVectorIndex() {
    await memoryVectorRepository.clear();
    setStatus("本地向量索引已清除，文字记忆不受影响");
  }

  return (
    <section className="ai-settings-app">
      <header className="ai-settings-heading">
        <span>模型接入</span>
        <h1>AI 设置</h1>
        <p>第一版支持 OpenAI 兼容格式，包括许多中转站和自部署模型。</p>
      </header>

      <div className="ai-settings-form">
        <label>
          接口地址
          <input
            placeholder="https://example.com/v1"
            value={settings.baseUrl}
            onChange={(event) =>
              setSettings({ ...settings, baseUrl: event.target.value })
            }
          />
        </label>

        <label>
          API Key
          <div className="secret-input">
            <input
              type={showKey ? "text" : "password"}
              placeholder="sk-..."
              value={settings.apiKey}
              onChange={(event) =>
                setSettings({ ...settings, apiKey: event.target.value })
              }
            />
            <button type="button" onClick={() => setShowKey(!showKey)}>
              {showKey ? "隐藏" : "显示"}
            </button>
          </div>
        </label>

        <label>
          模型名称
          <input
            list="aether-model-list"
            placeholder="填写模型 ID"
            value={settings.model}
            onChange={(event) =>
              setSettings({ ...settings, model: event.target.value })
            }
          />
          <datalist id="aether-model-list">
            {models.map((model) => (
              <option value={model} key={model} />
            ))}
          </datalist>
        </label>

        <button
          className="model-list-button"
          type="button"
          disabled={loading || !settings.baseUrl.trim()}
          onClick={loadModels}
        >
          {loading ? "正在连接…" : "连接并获取模型"}
        </button>

        <div className="ai-parameter-grid">
          <label>
            温度
            <input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={settings.temperature}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  temperature: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            最大输出
            <input
              type="number"
              min="1"
              step="100"
              value={settings.maxTokens}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  maxTokens: Number(event.target.value),
                })
              }
            />
          </label>
        </div>

        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.stream}
            onChange={(event) =>
              setSettings({ ...settings, stream: event.target.checked })
            }
          />
          流式显示回复
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.rememberKey}
            onChange={(event) =>
              setSettings({ ...settings, rememberKey: event.target.checked })
            }
          />
          在本设备长期保存 API Key
        </label>

        <p className="ai-key-note">
          不勾选时，Key 只保留到当前浏览器会话结束。公开设备请勿长期保存。
          某些接口若不允许浏览器跨域访问，需要以后通过安全代理连接。
        </p>

        <section className="memory-ai-settings">
          <header>
            <strong>自动记忆</strong>
            <span>会额外调用模型</span>
          </header>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={settings.autoMemory}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  autoMemory: event.target.checked,
                })
              }
            />
            自动从聊天提取重要记忆
          </label>
          <div className="ai-parameter-grid">
            <label>
              每隔几轮整理
              <input
                type="number"
                min="1"
                max="50"
                value={settings.memoryInterval}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    memoryInterval: Math.max(1, Number(event.target.value)),
                  })
                }
              />
            </label>
            <label>
              每次读取记忆
              <input
                type="number"
                min="1"
                max="20"
                value={settings.memoryLimit}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    memoryLimit: Math.max(1, Number(event.target.value)),
                  })
                }
              />
            </label>
          </div>

          <label className="settings-check">
            <input
              type="checkbox"
              checked={settings.vectorMemoryEnabled}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  vectorMemoryEnabled: event.target.checked,
                })
              }
            />
            启用关键词＋向量混合检索
          </label>

          {settings.vectorMemoryEnabled && (
            <div className="vector-settings">
              <label>
                Embedding 接口
                <input
                  placeholder="留空则使用上方接口地址"
                  value={settings.embeddingBaseUrl}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      embeddingBaseUrl: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Embedding 模型
                <input
                  placeholder="例如 text-embedding-3-small"
                  value={settings.embeddingModel}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      embeddingModel: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                最低相似度：{settings.vectorThreshold.toFixed(2)}
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.vectorThreshold}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      vectorThreshold: Number(event.target.value),
                    })
                  }
                />
              </label>
              <div className="vector-settings-actions">
                <button
                  type="button"
                  disabled={loading || !settings.embeddingModel.trim()}
                  onClick={() => void rebuildVectorIndex()}
                >
                  建立／更新索引
                </button>
                <button
                  type="button"
                  onClick={() => void clearVectorIndex()}
                >
                  清除向量索引
                </button>
              </div>
              <p>
                向量只保存在本机 IndexedDB。更换模型后点击“建立／更新索引”即可重建。
              </p>
            </div>
          )}
        </section>

        {status && <p className="ai-settings-status">{status}</p>}
        <button className="ai-settings-save" type="button" onClick={save}>
          保存 AI 设置
        </button>
      </div>
    </section>
  );
}
