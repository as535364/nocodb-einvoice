import "dotenv/config";
import { Api } from "nocodb-sdk";
const NOCODB_URL = process.env.NOCODB_URL.replace(/\/+$/, "");
const api = new Api({
  baseURL: NOCODB_URL,
  headers: {
    "xc-token": process.env.NOCODB_API_KEY,
  },
});
function log(...args) {
  console.log(new Date().toLocaleTimeString(), `[資料庫]`, ...args);
}

function logError(error) {
  console.error(new Date().toLocaleTimeString(), `[資料庫錯誤]`, {
    name: error.name,
    message: error.message,
    stack: error.stack,
    response: error.response?.data,
  });
}

async function nocoFetch(path, options = {}) {
  const res = await fetch(`${NOCODB_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "xc-token": process.env.NOCODB_API_KEY,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NocoDB API ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchLinkFieldId(tableId) {
  const meta = await nocoFetch(`/api/v1/db/meta/tables/${tableId}`);
  const linkCol = meta.columns.find((c) => c.uidt === "Links");
  return linkCol?.id;
}

let invoiceTableId, invoiceDetailTableId, linkFieldId;

async function ensureInit() {
  if (!invoiceTableId || !invoiceDetailTableId) {
    await getDBInfo();
  }
}

export async function getDBInfo() {
  try {
    const { list } = await api.dbTable.list(process.env.NOCODB_BASE_ID);
    const invoiceTable = list.find((table) => table.title === "電子發票");
    const detailTable = list.find(
      (table) => table.title === "電子發票 - 明細"
    );
    if (invoiceTable && detailTable) {
      invoiceTableId = invoiceTable.id;
      invoiceDetailTableId = detailTable.id;
      linkFieldId = await fetchLinkFieldId(invoiceTableId);
      log(`Link field ID: ${linkFieldId}`);
    } else {
      log("建立電子發票資料表");
      const newInvoiceTable = await api.dbTable.create(
        process.env.NOCODB_BASE_ID,
        {
          table_name: "電子發票",
          title: "電子發票",
          description: "自動同步的電子發票資料，請勿手動修改表格名稱",
          tags: ["電子發票"],
          columns: [
            {
              title: "id",
              uidt: "ID",
              pv: true,
            },
            {
              title: "invoice_id",
              uidt: "SingleLineText",
            },
            {
              title: "invoice_date",
              uidt: "SingleLineText",
            },
            {
              title: "invoice_time",
              uidt: "SingleLineText",
            },
            {
              title: "invoice_instant_date",
              uidt: "DateTime",
            },
            {
              title: "total_amount",
              uidt: "Currency",
              meta: {
                currency_locale: "zh-TW",
                currency_code: "TWD",
              },
            },
            {
              title: "ext_status",
              uidt: "SingleLineText",
            },
            {
              title: "donate_mark",
              uidt: "SingleLineText",
            },
            {
              title: "seller_name",
              uidt: "SingleLineText",
            },
            {
              title: "seller_id",
              uidt: "SingleLineText",
            },
            {
              title: "currency",
              uidt: "SingleLineText",
            },
            {
              title: "seller_address",
              uidt: "SingleLineText",
            },
            {
              title: "buyer_name",
              uidt: "SingleLineText",
            },
            {
              title: "main_remark",
              uidt: "SingleLineText",
            },
            {
              title: "alw_flag",
              uidt: "SingleLineText",
            },
            {
              title: "random_number",
              uidt: "SingleLineText",
            },
            {
              title: "invoice_str_status",
              uidt: "SingleLineText",
            },
          ],
        }
      );

      const newDetailTable = await api.dbTable.create(
        process.env.NOCODB_BASE_ID,
        {
          table_name: "電子發票 - 明細",
          title: "電子發票 - 明細",
          description: "自動同步的電子發票明細資料，請勿手動修改表格名稱",
          tags: ["電子發票"],
          columns: [
            {
              title: "id",
              uidt: "ID",
              pv: true,
            },
            {
              title: "item",
              uidt: "SingleLineText",
            },
            {
              title: "quantity",
              uidt: "Number",
            },
            {
              title: "unit_price",
              uidt: "Currency",
              meta: {
                currency_locale: "zh-TW",
                currency_code: "TWD",
              },
            },
            {
              title: "amount",
              uidt: "Currency",
              meta: {
                currency_locale: "zh-TW",
                currency_code: "TWD",
              },
            },
          ],
        }
      );
      await nocoFetch(
        `/api/v1/db/meta/tables/${newInvoiceTable.id}/columns`,
        {
          method: "POST",
          body: JSON.stringify({
            title: "details",
            column_name: "details",
            uidt: "Links",
            userHasChangedTitle: false,
            dtx: "specificType",
            dt: "character varying",
            altered: 2,
            parentId: newInvoiceTable.id,
            childColumn: "電子發票_id",
            childTable: "電子發票",
            parentTable: "",
            parentColumn: "",
            type: "hm",
            onUpdate: "NO ACTION",
            onDelete: "NO ACTION",
            virtual: false,
            alias: "",
            childId: newDetailTable.id,
            childViewId: null,
            childTableTitle: "電子發票 - 明細",
            primaryKey: false,
            table_name: "電子發票",
          }),
        }
      );
      invoiceTableId = newInvoiceTable.id;
      invoiceDetailTableId = newDetailTable.id;
      linkFieldId = await fetchLinkFieldId(invoiceTableId);
      log(`Link field ID: ${linkFieldId}`);
    }
  } catch (error) {
    logError(error);
    throw new Error(`取得資料庫資訊失敗: ${error.message}`);
  }
}

export async function createInvoice(invoiceId, invoiceData, invoiceDetails) {
  await ensureInit();
  try {
    await nocoFetch(`/api/v2/tables/${invoiceTableId}/records`, {
      method: "POST",
      body: JSON.stringify([
        {
          invoice_id: invoiceId,
          invoice_date: invoiceData.invoiceDate,
          invoice_time: invoiceData.invoiceTime,
          invoice_instant_date: invoiceData.invoiceInstantDate,
          total_amount: parseInt(invoiceData.totalAmount.replace(/,/g, "")),
          ext_status: invoiceData.extStatus,
          donate_mark: invoiceData.donateMark,
          seller_name: invoiceData.sellerName,
          seller_id: invoiceData.sellerId,
          currency: invoiceData.currency,
          seller_address: invoiceData.sellerAddress,
          buyer_name: invoiceData.buyerName,
          main_remark: invoiceData.mainRemark,
          alw_flag: invoiceData.alwFlag,
          random_number: invoiceData.randomNumber,
          invoice_str_status: invoiceData.invoiceStrStatus,
        },
      ]),
    });
    const invoiceRecord = await nocoFetch(
      `/api/v2/tables/${invoiceTableId}/records?where=(invoice_id,eq,${invoiceId})&limit=1`
    );
    const invoiceRecordId = invoiceRecord?.list?.[0]?.Id;
    if (!invoiceRecordId) {
      throw new Error(`找不到剛建立的發票 ${invoiceId}`);
    }
    if (invoiceDetails?.length) {
      const beforeInsert = await nocoFetch(
        `/api/v2/tables/${invoiceDetailTableId}/records?sort=-Id&limit=1`
      );
      const maxIdBefore = beforeInsert?.list?.[0]?.Id || 0;
      await nocoFetch(`/api/v2/tables/${invoiceDetailTableId}/records`, {
        method: "POST",
        body: JSON.stringify(
          invoiceDetails.map((detail) => ({
            item: detail.item,
            quantity: parseInt(detail.quantity.replace(/,/g, "")),
            unit_price: parseInt(detail.unitPrice.replace(/,/g, "")),
            amount: parseInt(detail.amount.replace(/,/g, "")),
          }))
        ),
      });
      const newDetails = await nocoFetch(
        `/api/v2/tables/${invoiceDetailTableId}/records?where=(Id,gt,${maxIdBefore})&sort=Id&limit=${invoiceDetails.length}`
      );
      const detailIds = newDetails?.list?.map((r) => ({ Id: r.Id })) || [];
      if (detailIds.length > 0) {
        await nocoFetch(
          `/api/v2/tables/${invoiceTableId}/links/${linkFieldId}/records/${invoiceRecordId}`,
          {
            method: "POST",
            body: JSON.stringify(detailIds),
          }
        );
      }
    }
  } catch (error) {
    logError(error);
  }
}

export async function getExistingInvoiceIds() {
  await ensureInit();
  const ids = new Set();
  let offset = 0;
  while (true) {
    const data = await nocoFetch(
      `/api/v2/tables/${invoiceTableId}/records?fields=invoice_id&limit=200&offset=${offset}`
    );
    for (const row of data.list) {
      ids.add(row.invoice_id);
    }
    if (data.pageInfo.isLastPage) break;
    offset += 200;
  }
  return ids;
}
