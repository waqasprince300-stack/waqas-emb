/** Consistent Mongo / string IDs for workspaces (business owners). */
export function normalizedBusinessOwnerId(raw) {
  return String(raw ?? "").trim();
}

/**
 * Readable workspace label encoded on the lot by the API (populate / denormalised fields).
 */
export function workspaceLabelEmbeddedInLot(lot) {
  if (!lot || typeof lot !== "object") return "";
  try {
    const bo = lot.businessOwner;
    if (bo != null && typeof bo === "object") {
      const cand = bo.name ?? bo.displayName ?? bo.title ?? bo.label;
      const s = String(cand ?? "").trim();
      if (s) return s;
      const biz = bo.businessName ?? bo.business?.name ?? bo.organizationName;
      if (biz != null && String(biz).trim()) return String(biz).trim();
    }
  } catch {
    /* ignore */
  }
  const flatKeys = [
    "embeddedWorkspaceName",
    "businessOwnerName",
    "businessWorkspaceName",
    "workspaceName",
    "ownerWorkspaceName",
    "tenantName",
    "businessName",
    "workspaceTitle",
    "businessTitle",
    "businessOwnerPopulateName",
  ];
  for (const k of flatKeys) {
    const v = lot[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

/** API may return `{ data, owners }` instead of a bare array */
export function normalizeBusinessOwnersListResponse(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload != null && typeof payload === "object") {
    const nested =
      payload.owners ??
      payload.businessOwners ??
      payload.results ??
      payload.items ??
      payload.rows ??
      payload.records ??
      payload.list ??
      payload.result ??
      payload.data ??
      payload.body?.data ??
      payload.body?.owners ??
      payload.body;
    if (Array.isArray(nested)) return nested;
    const data = payload.data;
    if (data != null && typeof data === "object") {
      if (Array.isArray(data.businessOwners)) return data.businessOwners;
      if (Array.isArray(data.owners)) return data.owners;
      if (Array.isArray(data.items)) return data.items;
    }
  }
  return [];
}

/** Human-readable label from a business-owner / workspace row or document */
export function ownerDisplayNameFromRow(row) {
  if (!row || typeof row !== "object") return "";
  return String(
    row.name ??
      row.title ??
      row.displayName ??
      row.workspaceName ??
      row.businessName ??
      row.companyName ??
      row.organizationName ??
      row.label ??
      row.collectionName ??
      row.tenantName ??
      "",
  ).trim();
}

export function businessOwnerRegistryMap(rows) {
  const m = new Map();
  for (const row of rows || []) {
    const id = normalizedBusinessOwnerId(row?.id ?? row?._id);
    const nm = ownerDisplayNameFromRow(row);
    if (id && nm) m.set(id, nm);
  }
  return m;
}

/** Embedded lot fields first, then name from `businessOwners` list (dashboard / collection tables). */
export function workspaceDisplayTitleForLot(lot, ownersRows, opts = {}) {
  const embedded = workspaceLabelEmbeddedInLot(lot);
  if (embedded) return embedded;
  const id = normalizedBusinessOwnerId(lot?.businessOwnerId);
  if (!id) return "—";
  const nm = businessOwnerRegistryMap(ownersRows).get(id);
  if (nm) return nm;
  if (opts.shortIdFallback) return `Workspace ${id.slice(-6)}`;
  return "—";
}
/** API list shape varies; fallback scan when known keys fail (party regression guard). */
export function extractBusinessOwnersArrayFromResponse(payload) {
  const direct = normalizeBusinessOwnersListResponse(payload);
  if (direct.length) return direct;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  for (const v of Object.values(payload)) {
    if (!Array.isArray(v) || v.length === 0) continue;
    const first = v[0];
    if (
      first &&
      typeof first === "object" &&
      (first._id || first.id) &&
      ownerDisplayNameFromRow(first)
    ) {
      return v;
    }
  }
  return [];
}

/** Single-owner GET: unwrap nested `{ owner | data | businessOwner }`. */
export function businessOwnerDisplayFromApiPayload(raw, idHint = "") {
  if (raw == null) return null;
  const top = typeof raw === "object" ? raw : {};
  const body =
    (typeof top === "object" && top !== null
      ? top.data ?? top.owner ?? top.businessOwner ?? top
      : top) ?? {};
  if (typeof body !== "object" || body === null) return null;
  const nm =
    ownerDisplayNameFromRow(body && typeof body === "object" ? body : {}) ||
    ownerDisplayNameFromRow(top);
  const id =
    normalizedBusinessOwnerId(
      typeof body === "object" ? body?.id ?? body?._id : undefined,
    ) ||
    normalizedBusinessOwnerId(top.id ?? top._id ?? idHint) ||
    normalizedBusinessOwnerId(idHint);
  if (!nm || !id) return null;
  return { id, _id: id, name: nm };
}
