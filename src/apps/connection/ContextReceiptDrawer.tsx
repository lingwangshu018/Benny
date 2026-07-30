import type {
  ContextReceipt,
  ContextReceiptItem,
} from "../../features/context/contextReceipt";

interface ContextReceiptDrawerProps {
  receipt: ContextReceipt;
  mode: "preview" | "sent";
}

function ReceiptItem({
  item,
  empty,
}: {
  item: ContextReceiptItem | null;
  empty: string;
}) {
  return (
    <article className={item ? "" : "empty"}>
      <strong>{item?.title || empty}</strong>
      <span>{item?.detail || "本次没有读取"}</span>
    </article>
  );
}

function ReceiptList({
  items,
  empty,
}: {
  items: ContextReceiptItem[];
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="context-receipt-empty">{empty}</p>;
  }
  return (
    <div className="context-receipt-list">
      {items.map((item) => (
        <article key={item.id}>
          <strong>{item.title}</strong>
          <span>{item.detail}</span>
        </article>
      ))}
    </div>
  );
}

export function ContextReceiptDrawer({
  receipt,
  mode,
}: ContextReceiptDrawerProps) {
  return (
    <details className="context-receipt-drawer">
      <summary>
        <span>
          <b>本次读取</b>
          <small>{mode === "preview" ? "输入预览" : "最近一次发送"}</small>
        </span>
        <em>
          {receipt.matchedWorldbooks.length} 本书 · {receipt.memories.length} 条记忆
        </em>
      </summary>
      <div className="context-receipt-body">
        <section className="context-receipt-metrics">
          <article>
            <span>历史消息</span>
            <strong>{receipt.historyCount} 条</strong>
            <small>
              {receipt.historyLimit > 0
                ? `上限 ${receipt.historyLimit} 条`
                : "未设置条数上限"}
            </small>
          </article>
          <article>
            <span>大致长度</span>
            <strong>约 {receipt.totalLength} 字</strong>
            <small>
              资料 {receipt.promptLength} ＋ 历史 {receipt.historyLength}
            </small>
          </article>
        </section>

        <section className="context-receipt-core">
          <header>连接核心</header>
          <div>
            <label>当前角色</label>
            <ReceiptItem item={receipt.character} empty="未找到角色" />
            <label>用户人设</label>
            <ReceiptItem item={receipt.userPersona} empty="暂未绑定" />
            <label>当前预设</label>
            <ReceiptItem item={receipt.preset} empty="未使用预设" />
          </div>
        </section>

        <section>
          <header>
            命中的世界书
            <small>{receipt.matchedWorldbooks.length}</small>
          </header>
          <ReceiptList
            items={receipt.matchedWorldbooks}
            empty="本次没有世界书被触发"
          />
        </section>

        <section>
          <header>
            检索到的记忆
            <small>{receipt.memories.length}</small>
          </header>
          <ReceiptList
            items={receipt.memories}
            empty="本次没有检索到相关记忆"
          />
        </section>

        <section className="context-receipt-skipped">
          <header>
            未触发的世界书
            <small>{receipt.skippedWorldbooks.length}</small>
          </header>
          <ReceiptList
            items={receipt.skippedWorldbooks}
            empty="所有候选世界书都已触发"
          />
        </section>
      </div>
    </details>
  );
}
