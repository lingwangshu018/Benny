import { useEffect, useRef, useState } from "react";
import { dataVaultRepository } from "../../storage/dataVaultRepository";
import type {
  VaultInspection,
  VaultStorageUsage,
} from "../../types/vault";

function formatBytes(value: number | null) {
  if (value === null) return "浏览器未提供";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(value: number | undefined) {
  if (!value) return "未知时间";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function emptyInspection(fileSize: number): VaultInspection {
  return {
    valid: false,
    archive: null,
    counts: {
      characters: 0,
      worldbooks: 0,
      presets: 0,
      chatCharacters: 0,
      chatSessions: 0,
      chatMessages: 0,
      memories: 0,
      timelineEvents: 0,
      relationshipProfiles: 0,
      characterLifeProfiles: 0,
    },
    issues: [
      {
        level: "error",
        code: "file-parse-failed",
        message: "文件不是完整 JSON，可能下载不完整或已经损坏。",
      },
    ],
    containsSensitiveFields: false,
    byteSize: fileSize,
  };
}

function InspectionSummary({
  inspection,
}: {
  inspection: VaultInspection;
}) {
  const countItems = [
    ["角色", inspection.counts.characters],
    ["世界书", inspection.counts.worldbooks],
    ["预设", inspection.counts.presets],
    ["会话", inspection.counts.chatSessions],
    ["消息", inspection.counts.chatMessages],
    ["记忆", inspection.counts.memories],
    ["生活", inspection.counts.timelineEvents],
    ["关系", inspection.counts.relationshipProfiles],
    ["作息", inspection.counts.characterLifeProfiles],
  ];
  return (
    <>
      <div className="vault-count-grid">
        {countItems.map(([label, value]) => (
          <article key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </article>
        ))}
      </div>
      <div className="vault-issues">
        {inspection.issues.map((issue, index) => (
          <p className={issue.level} key={`${issue.code}-${index}`}>
            <span aria-hidden="true">
              {issue.level === "error"
                ? "×"
                : issue.level === "warning"
                  ? "!"
                  : "✓"}
            </span>
            {issue.message}
          </p>
        ))}
      </div>
    </>
  );
}

export function DataVaultApp() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState<VaultInspection | null>(null);
  const [preview, setPreview] = useState<VaultInspection | null>(null);
  const [previous, setPrevious] = useState<VaultInspection | null>(null);
  const [usage, setUsage] = useState<VaultStorageUsage | null>(null);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("正在检查本地资料…");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [nextCurrent, nextPrevious, nextUsage] = await Promise.all([
      dataVaultRepository.inspectCurrent(),
      dataVaultRepository.previousInspection(),
      dataVaultRepository.storageUsage(),
    ]);
    setCurrent(nextCurrent);
    setPrevious(nextPrevious);
    setUsage(nextUsage);
    setStatus(
      nextCurrent.valid
        ? "本地核心资料检查完成"
        : "发现损坏资料，请先不要覆盖现有文件",
    );
  }

  useEffect(() => {
    void refresh().catch((error) => {
      setStatus(error instanceof Error ? error.message : "资料检查失败");
    });
  }, []);

  async function exportArchive() {
    setBusy(true);
    try {
      const archive = await dataVaultRepository.createArchive();
      const text = JSON.stringify(archive, null, 2);
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stamp = new Date(archive.createdAt)
        .toISOString()
        .replace(/[:.]/g, "-");
      anchor.href = url;
      anchor.download = `Bunny-完整备份-${stamp}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("完整备份已导出；API Key 未包含在文件中");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "导出失败");
    } finally {
      setBusy(false);
    }
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setFileName(file.name);
    setPreview(null);
    try {
      const text = await file.text();
      const inspection = await dataVaultRepository.inspectUnknown(
        JSON.parse(text) as unknown,
        file.size,
      );
      setPreview(inspection);
      setStatus(
        inspection.valid
          ? "预览完成：确认后才会写入本地"
          : "文件未通过检查，不会写入任何资料",
      );
    } catch {
      setPreview(emptyInspection(file.size));
      setStatus("文件解析失败，不会写入任何资料");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function importPreview() {
    if (!preview?.valid || !preview.archive) return;
    const confirmed = window.confirm(
      "要恢复这份备份吗？当前资料会先自动保存为“上一份本地备份”。",
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await dataVaultRepository.importArchive(preview.archive);
      setPreview(null);
      setFileName("");
      await refresh();
      setStatus("恢复完成；原来的资料已保存为上一份本地备份");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "恢复失败");
    } finally {
      setBusy(false);
    }
  }

  async function restorePrevious() {
    if (!previous?.valid) return;
    const confirmed = window.confirm(
      "恢复上一份本地备份？当前资料也会保留下来，之后可以再次换回。",
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await dataVaultRepository.restorePrevious();
      await refresh();
      setStatus("上一份本地备份已恢复；当前版本已成为新的回退点");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "恢复失败");
    } finally {
      setBusy(false);
    }
  }

  const usagePercent =
    usage?.originUsageBytes && usage.originQuotaBytes
      ? Math.min(100, (usage.originUsageBytes / usage.originQuotaBytes) * 100)
      : null;

  return (
    <section className="data-vault-app">
      <header className="vault-heading">
        <span>DATA VAULT · v0.20</span>
        <h1>数据保险箱</h1>
        <p>完整守护角色、世界书、预设、聊天、兔兔记忆、关系档案、作息与生活时间线。</p>
      </header>

      <article className="vault-security-note">
        <span aria-hidden="true">🔐</span>
        <div>
          <strong>API Key 永不进入备份</strong>
          <p>AI 设置和临时密钥不在备份范围，导入时也会拦截敏感字段。</p>
        </div>
      </article>

      <section className="vault-panel">
        <header>
          <div>
            <span>完整备份</span>
            <strong>现在的兔兔资料</strong>
          </div>
          <em className={current?.valid ? "healthy" : "damaged"}>
            {current?.valid ? "结构正常" : "需要检查"}
          </em>
        </header>
        {current && <InspectionSummary inspection={current} />}
        <button
          className="vault-primary-button"
          type="button"
          disabled={busy || !current?.valid}
          onClick={() => void exportArchive()}
        >
          {busy ? "处理中…" : "导出完整备份"}
        </button>
      </section>

      <section className="vault-panel">
        <header>
          <div>
            <span>恢复资料</span>
            <strong>先预览，再决定</strong>
          </div>
          <em>{preview ? formatBytes(preview.byteSize) : "尚未选文件"}</em>
        </header>
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept=".json,application/json"
          onChange={(event) => void chooseFile(event.target.files?.[0])}
        />
        {!preview ? (
          <button
            className="vault-file-button"
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            选择 Bunny 备份文件
          </button>
        ) : (
          <div className="vault-preview">
            <p className="vault-file-name">
              <strong>{fileName}</strong>
              <span>备份于 {formatDate(preview.archive?.createdAt)}</span>
            </p>
            <InspectionSummary inspection={preview} />
            <div className="vault-preview-actions">
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setFileName("");
                }}
              >
                取消
              </button>
              <button
                className="confirm"
                type="button"
                disabled={!preview.valid || busy}
                onClick={() => void importPreview()}
              >
                确认恢复这份备份
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="vault-panel">
        <header>
          <div>
            <span>本地回退点</span>
            <strong>上一份本地备份</strong>
          </div>
          <em>
            {previous?.archive
              ? formatDate(previous.archive.createdAt)
              : "暂时没有"}
          </em>
        </header>
        {previous ? (
          <>
            <InspectionSummary inspection={previous} />
            <button
              className="vault-restore-button"
              type="button"
              disabled={!previous.valid || busy}
              onClick={() => void restorePrevious()}
            >
              恢复上一份本地备份
            </button>
          </>
        ) : (
          <p className="vault-empty-note">
            第一次导入前，保险箱会自动把当前资料保存在这里。
          </p>
        )}
      </section>

      <section className="vault-panel vault-storage-panel">
        <header>
          <div>
            <span>本机空间</span>
            <strong>存储占用</strong>
          </div>
          <em>{usage ? formatBytes(usage.bunnyBytes) : "计算中…"}</em>
        </header>
        {usage && (
          <>
            <div className="vault-storage-bar" aria-hidden="true">
              <span
                style={{
                  width: `${usagePercent === null ? 0 : Math.max(1, usagePercent)}%`,
                }}
              />
            </div>
            <p className="vault-storage-total">
              浏览器已用 {formatBytes(usage.originUsageBytes)}
              <span> / 可用 {formatBytes(usage.originQuotaBytes)}</span>
            </p>
            <div className="vault-storage-list">
              {usage.categories.map((item) => (
                <p key={item.label}>
                  <span>{item.label}</span>
                  <strong>{formatBytes(item.bytes)}</strong>
                </p>
              ))}
              <p>
                <span>上一份本地备份</span>
                <strong>{formatBytes(usage.previousBackupBytes)}</strong>
              </p>
            </div>
          </>
        )}
      </section>

      <p className="vault-status" role="status">
        {status}
      </p>
    </section>
  );
}
