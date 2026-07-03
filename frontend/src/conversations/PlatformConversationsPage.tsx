import { FilterBar, Table } from "../ui/components.js";
import { Pagination } from "../ui/Pagination.js";
import { notifyExportStarted } from "../ui/toast.js";
import { ConversationDetail } from "./ConversationDetail.js";
import { ConversationExportBar } from "./ConversationExport.js";
import { usePlatformConversationsController } from "./usePlatformConversationsController.js";

export function PlatformConversationsPage({ handoffs = false }: { handoffs?: boolean }) {
  const controller = usePlatformConversationsController({ handoffs });

  return <div className={controller.selected ? "split conversation-admin-layout work-split" : "single-column work-split"}>
    <section className="work-panel">
      <ConversationExportBar base="/api/admin/conversations/export" scopedFilters={{ ...controller.filters, limit: "50000" }} scopedLabel="当前筛选" onExportStarted={notifyExportStarted} />
      {handoffs && <div className="conversation-list-toolbar"><span className="status-pill warning">只显示待接管</span></div>}
      <FilterBar
        filters={controller.filters}
        setFilters={controller.setFilters}
        fields={handoffs ? ["merchantId", "language", "limit"] : ["merchantId", "status", "handoffStatus", "language", "limit"]}
        selects={{ status: ["", "active", "human_handoff"], handoffStatus: ["", "pending", "processing", "done"] }}
        onApply={controller.reload}
      />
      <Table
        rows={controller.pager.rows}
        columns={["merchantId", "countryName", "customerPhone", "nickname", "language", "stage", "status", "handoffStatus"]}
        onRow={controller.setSelected}
        selectedKey={controller.selected?.id}
        rowKey={(row) => row.id}
      />
      <Pagination pager={controller.pager} />
    </section>
    {controller.selected && <section className="detail-panel">
      <ConversationDetail platform conversation={controller.selected} refresh={controller.refreshSelected} onDeleted={controller.onDeleted} />
    </section>}
  </div>;
}
