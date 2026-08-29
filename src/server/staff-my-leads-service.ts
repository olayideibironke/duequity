import "server-only";

import { can, type StaffSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/server/supabase-admin";

export interface StaffMyLead {
  assignmentId: string;
  subjectType: "discovered_record" | "opportunity";
  recordId: string;
  isNew: boolean;
  ownerName: string;
  addressLine1: string;
  city?: string;
  county: string;
  stateCode: string;
  postalCode?: string;
  amountCents?: number;
  bestPhone?: string;
  additionalPhones?: string;
  bestEmail?: string;
  additionalEmails?: string;
  saleDate?: string;
  caseOrParcel?: string;
  batchReference?: string;
  batchName?: string;
  assignedAt: string;
  sourceUrl?: string;
  opportunityReference?: string;
}

type Snapshot = Record<string, unknown>;

interface AssignmentRow {
  id: string;
  batch_id: string | null;
  subject_type: "discovered_record" | "opportunity";
  discovered_record_id: string | null;
  opportunity_id: string | null;
  assigned_at: string;
}

interface ReceiptRow {
  assignment_id: string;
}

interface BatchRow {
  id: string;
  reference: string;
  name: string;
  county_name: string;
  state_code: string;
}

interface BatchSourceRow {
  batch_id: string;
  discovered_record_id: string;
  source_row_snapshot: Snapshot;
  created_at: string;
}

interface EnrichmentRow {
  discovered_record_id: string;
  enrichment_snapshot: unknown;
}

interface DiscoveredRow {
  id: string;
  former_owner_name: string | null;
  address_line1: string | null;
  city: string | null;
  county: string;
  state_code: string;
  postal_code: string | null;
  sale_date: string | null;
  case_number: string | null;
  parcel_number: string | null;
  source_listed_balance_cents: number | null;
  source_url: string;
}

interface OpportunityRow {
  id: string;
  reference: string;
  property_id: string;
  sale_date: string | null;
  prior_owners: unknown;
  estimated_surplus_cents: number | null;
  confirmed_surplus_cents: number | null;
}

interface PropertyRow {
  id: string;
  address_line1: string;
  city: string;
  county: string;
  state_code: string;
  postal_code: string;
  parcel_number: string | null;
}

function requireLeadRead(session: StaffSession): void {
  if (!can(session, "opportunity.read")) {
    throw new Error(
      "Your DueQuity role is not authorized to access assigned recovery leads.",
    );
  }
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value
    .trim()
    .replace(/\s+/g, " ");

  return normalized || undefined;
}

function snapshotText(
  snapshot: Snapshot | undefined,
  key: string,
): string | undefined {
  return text(snapshot?.[key]);
}

function parseMoneyToCents(
  value: string | undefined,
): number | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(
    /[^0-9.-]/g,
    "",
  );

  if (!normalized) {
    return undefined;
  }

  const amount = Number.parseFloat(
    normalized,
  );

  return Number.isFinite(amount)
    ? Math.round(amount * 100)
    : undefined;
}

function buildCaseOrParcel(
  caseNumber: string | null,
  parcelNumber: string | null,
): string | undefined {
  const values = [
    caseNumber
      ? `Case ${caseNumber}`
      : undefined,

    parcelNumber
      ? `Parcel ${parcelNumber}`
      : undefined,
  ].filter(
    (
      value,
    ): value is string =>
      Boolean(value),
  );

  return values.length > 0
    ? values.join("; ")
    : undefined;
}

function priorOwnerName(
  value: unknown,
): string {
  if (!Array.isArray(value)) {
    return "Opportunity lead";
  }

  for (const item of value) {
    if (
      typeof item === "string" &&
      item.trim()
    ) {
      return item.trim();
    }

    if (
      !item ||
      typeof item !== "object"
    ) {
      continue;
    }

    const record =
      item as Record<string, unknown>;

    for (
      const key
      of [
        "name",
        "ownerName",
        "fullName",
        "legalName",
      ]
    ) {
      const candidate =
        text(record[key]);

      if (candidate) {
        return candidate;
      }
    }
  }

  return "Opportunity lead";
}

function sourceRowKey(
  batchId: string,
  discoveredRecordId: string,
): string {
  return `${batchId}:${discoveredRecordId}`;
}

function asRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function asRecordArray(
  value: unknown,
): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(asRecord)
    .filter(
      (
        item,
      ): item is Record<string, unknown> =>
        Boolean(item),
    );
}

function statusRank(
  value: unknown,
): number {
  const normalized =
    text(value)?.toLowerCase();

  if (normalized === "rejected") {
    return -1;
  }

  if (normalized === "verified") {
    return 4;
  }

  if (normalized === "candidate") {
    return 2;
  }

  return normalized
    ? 1
    : 0;
}

function historicalConfidence(
  snapshot: Snapshot,
): number {
  const combined = [
    snapshotText(
      snapshot,
      "Contact Verification Status",
    ),
    snapshotText(
      snapshot,
      "Locator Status",
    ),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    combined.includes("high-confidence") ||
    combined.includes("verified")
  ) {
    return 4;
  }

  if (
    combined.includes("candidate")
  ) {
    return 2;
  }

  if (
    combined.includes("no contact data") ||
    combined.includes("not started")
  ) {
    return 0;
  }

  return combined
    ? 1
    : 0;
}

function splitPhones(
  value: string | undefined,
): string[] {
  if (!value) {
    return [];
  }

  const matches =
    value.match(
      /(?:\+?1[\s.\-]?)?(?:\(?\d{3}\)?[\s.\-]?)\d{3}[\s.\-]?\d{4}/g,
    );

  if (
    matches &&
    matches.length > 0
  ) {
    return matches.map(
      (item) =>
        item.trim(),
    );
  }

  return value
    .split(/\s*;\s*/g)
    .map(
      (item) =>
        item.trim(),
    )
    .filter(Boolean);
}

function phoneKey(
  value: string,
): string {
  const digits =
    value.replace(
      /\D/g,
      "",
    );

  if (
    digits.length === 10
  ) {
    return digits;
  }

  if (
    digits.length === 11 &&
    digits.startsWith("1")
  ) {
    return digits.slice(1);
  }

  return value
    .toLowerCase()
    .trim();
}

function uniquePhones(
  values: Array<string | undefined>,
): string[] {
  const result:
    string[] =
    [];

  const seen =
    new Set<string>();

  for (const value of values) {
    for (
      const phone
      of splitPhones(value)
    ) {
      const key =
        phoneKey(phone);

      if (
        seen.has(key)
      ) {
        continue;
      }

      seen.add(key);
      result.push(phone);
    }
  }

  return result;
}

function enrichmentPhoneCandidates(
  enrichmentSnapshot: unknown,
): string[] {
  const root =
    asRecord(
      enrichmentSnapshot,
    );

  const locator =
    asRecord(
      root?.claimantLocator,
    );

  return asRecordArray(
    locator?.candidates,
  )
    .filter(
      (candidate) =>
        text(
          candidate.kind,
        ) === "phone",
    )
    .filter(
      (candidate) =>
        statusRank(
          candidate.status,
        ) >= 0,
    )
    .sort(
      (
        left,
        right,
      ) =>
        statusRank(
          right.status,
        ) -
        statusRank(
          left.status,
        ),
    )
    .map(
      (candidate) =>
        text(
          candidate.value,
        ),
    )
    .filter(
      (
        value,
      ): value is string =>
        Boolean(value),
    );
}

function mergePhoneData({
  currentSnapshot,
  historicalSnapshots,
  enrichmentSnapshot,
}: {
  currentSnapshot?: Snapshot;
  historicalSnapshots: Snapshot[];
  enrichmentSnapshot?: unknown;
}): {
  bestPhone?: string;
  additionalPhones?: string;
} {
  const currentBest =
    snapshotText(
      currentSnapshot,
      "Best Located Phone",
    );

  const currentAdditional =
    snapshotText(
      currentSnapshot,
      "Additional Phone Numbers",
    );

  const rankedHistory =
    historicalSnapshots
      .map(
        (
          snapshot,
          order,
        ) => ({
          snapshot,
          rank:
            historicalConfidence(
              snapshot,
            ),
          order,
        }),
      )
      .sort(
        (
          left,
          right,
        ) => {
          const rankDifference =
            right.rank -
            left.rank;

          return rankDifference !== 0
            ? rankDifference
            : left.order -
                right.order;
        },
      );

  const historicalBest =
    rankedHistory
      .map(
        ({
          snapshot,
        }) =>
          snapshotText(
            snapshot,
            "Best Located Phone",
          ),
      )
      .find(Boolean);

  const enrichmentPhones =
    enrichmentPhoneCandidates(
      enrichmentSnapshot,
    );

  const bestPhone =
    currentBest ??
    historicalBest ??
    enrichmentPhones[0];

  const allPhones =
    uniquePhones([
      currentBest,
      currentAdditional,

      ...rankedHistory.flatMap(
        ({
          snapshot,
        }) => [
          snapshotText(
            snapshot,
            "Best Located Phone",
          ),

          snapshotText(
            snapshot,
            "Additional Phone Numbers",
          ),
        ],
      ),

      ...enrichmentPhones,
    ]);

  const bestKey =
    bestPhone
      ? phoneKey(bestPhone)
      : undefined;

  const additional =
    allPhones.filter(
      (phone) =>
        !bestKey ||
        phoneKey(phone) !==
          bestKey,
    );

  return {
    bestPhone,

    additionalPhones:
      additional.length > 0
        ? additional.join("; ")
        : undefined,
  };
}

function firstKnownField(
  currentSnapshot: Snapshot | undefined,
  historicalSnapshots: Snapshot[],
  key: string,
): string | undefined {
  const current =
    snapshotText(
      currentSnapshot,
      key,
    );

  if (current) {
    return current;
  }

  for (
    const snapshot
    of historicalSnapshots
  ) {
    const value =
      snapshotText(
        snapshot,
        key,
      );

    if (value) {
      return value;
    }
  }

  return undefined;
}

export async function listStaffMyLeads(
  session: StaffSession,
): Promise<StaffMyLead[]> {
  requireLeadRead(session);

  const admin =
    getSupabaseAdmin();

  const {
    data:
      assignmentData,
    error:
      assignmentError,
  } =
    await admin
      .from(
        "lead_assignments",
      )
      .select(
        [
          "id",
          "batch_id",
          "subject_type",
          "discovered_record_id",
          "opportunity_id",
          "assigned_at",
        ].join(", "),
      )
      .eq(
        "assigned_to_staff_user_id",
        session.user.id,
      )
      .eq(
        "status",
        "active",
      )
      .order(
        "assigned_at",
        {
          ascending:
            false,
        },
      );

  if (assignmentError) {
    throw new Error(
      `Unable to load assigned leads: ${assignmentError.message}`,
    );
  }

  const assignments =
    (
      assignmentData ??
      []
    ) as unknown as
      AssignmentRow[];

  if (
    assignments.length === 0
  ) {
    return [];
  }

  const assignmentIds =
    assignments.map(
      (assignment) =>
        assignment.id,
    );

  const batchIds =
    Array.from(
      new Set(
        assignments
          .map(
            (assignment) =>
              assignment.batch_id,
          )
          .filter(
            (
              value,
            ): value is string =>
              Boolean(value),
          ),
      ),
    );

  const discoveredIds =
    Array.from(
      new Set(
        assignments
          .map(
            (assignment) =>
              assignment
                .discovered_record_id,
          )
          .filter(
            (
              value,
            ): value is string =>
              Boolean(value),
          ),
      ),
    );

  const opportunityIds =
    Array.from(
      new Set(
        assignments
          .map(
            (assignment) =>
              assignment
                .opportunity_id,
          )
          .filter(
            (
              value,
            ): value is string =>
              Boolean(value),
          ),
      ),
    );

  const {
    data:
      receiptData,
    error:
      receiptError,
  } =
    await admin
      .from(
        "lead_assignment_receipts",
      )
      .select(
        "assignment_id",
      )
      .in(
        "assignment_id",
        assignmentIds,
      );

  if (receiptError) {
    throw new Error(
      `Unable to load lead notification receipts: ${receiptError.message}`,
    );
  }

  const seenAssignmentIds =
    new Set(
      (
        (
          receiptData ??
          []
        ) as unknown as
          ReceiptRow[]
      ).map(
        (row) =>
          row.assignment_id,
      ),
    );

  const batchesById =
    new Map<
      string,
      BatchRow
    >();

  if (
    batchIds.length > 0
  ) {
    const {
      data:
        batchData,
      error:
        batchError,
    } =
      await admin
        .from(
          "lead_assignment_batches",
        )
        .select(
          "id, reference, name, county_name, state_code",
        )
        .in(
          "id",
          batchIds,
        );

    if (batchError) {
      throw new Error(
        `Unable to load lead batches: ${batchError.message}`,
      );
    }

    for (
      const row
      of (
        batchData ??
        []
      ) as unknown as
        BatchRow[]
    ) {
      batchesById.set(
        row.id,
        row,
      );
    }
  }

  const sourceRowsByKey =
    new Map<
      string,
      BatchSourceRow
    >();

  const historicalRowsByRecordId =
    new Map<
      string,
      BatchSourceRow[]
    >();

  if (
    discoveredIds.length > 0
  ) {
    const {
      data:
        sourceRowData,
      error:
        sourceRowError,
    } =
      await admin
        .from(
          "lead_assignment_batch_rows",
        )
        .select(
          "batch_id, discovered_record_id, source_row_snapshot, created_at",
        )
        .in(
          "discovered_record_id",
          discoveredIds,
        )
        .order(
          "created_at",
          {
            ascending:
              false,
          },
        );

    if (sourceRowError) {
      throw new Error(
        `Unable to load assigned workbook contact history: ${sourceRowError.message}`,
      );
    }

    for (
      const row
      of (
        sourceRowData ??
        []
      ) as unknown as
        BatchSourceRow[]
    ) {
      sourceRowsByKey.set(
        sourceRowKey(
          row.batch_id,
          row.discovered_record_id,
        ),
        row,
      );

      const history =
        historicalRowsByRecordId.get(
          row.discovered_record_id,
        ) ??
        [];

      history.push(row);

      historicalRowsByRecordId.set(
        row.discovered_record_id,
        history,
      );
    }
  }

  const enrichmentByRecordId =
    new Map<
      string,
      unknown
    >();

  if (
    discoveredIds.length > 0
  ) {
    const {
      data:
        enrichmentData,
      error:
        enrichmentError,
    } =
      await admin
        .from(
          "discovered_record_enrichment",
        )
        .select(
          "discovered_record_id, enrichment_snapshot",
        )
        .in(
          "discovered_record_id",
          discoveredIds,
        );

    if (enrichmentError) {
      throw new Error(
        `Unable to load current lead contact enrichment: ${enrichmentError.message}`,
      );
    }

    for (
      const row
      of (
        enrichmentData ??
        []
      ) as unknown as
        EnrichmentRow[]
    ) {
      enrichmentByRecordId.set(
        row.discovered_record_id,
        row.enrichment_snapshot,
      );
    }
  }

  const discoveredById =
    new Map<
      string,
      DiscoveredRow
    >();

  if (
    discoveredIds.length > 0
  ) {
    const {
      data:
        discoveredData,
      error:
        discoveredError,
    } =
      await admin
        .from(
          "discovered_records",
        )
        .select(
          [
            "id",
            "former_owner_name",
            "address_line1",
            "city",
            "county",
            "state_code",
            "postal_code",
            "sale_date",
            "case_number",
            "parcel_number",
            "source_listed_balance_cents",
            "source_url",
          ].join(", "),
        )
        .in(
          "id",
          discoveredIds,
        );

    if (discoveredError) {
      throw new Error(
        `Unable to load assigned discovery records: ${discoveredError.message}`,
      );
    }

    for (
      const row
      of (
        discoveredData ??
        []
      ) as unknown as
        DiscoveredRow[]
    ) {
      discoveredById.set(
        row.id,
        row,
      );
    }
  }

  const opportunitiesById =
    new Map<
      string,
      OpportunityRow
    >();

  const propertiesById =
    new Map<
      string,
      PropertyRow
    >();

  if (
    opportunityIds.length > 0
  ) {
    const {
      data:
        opportunityData,
      error:
        opportunityError,
    } =
      await admin
        .from(
          "opportunities",
        )
        .select(
          [
            "id",
            "reference",
            "property_id",
            "sale_date",
            "prior_owners",
            "estimated_surplus_cents",
            "confirmed_surplus_cents",
          ].join(", "),
        )
        .in(
          "id",
          opportunityIds,
        );

    if (opportunityError) {
      throw new Error(
        `Unable to load assigned opportunities: ${opportunityError.message}`,
      );
    }

    const propertyIds =
      new Set<string>();

    for (
      const row
      of (
        opportunityData ??
        []
      ) as unknown as
        OpportunityRow[]
    ) {
      opportunitiesById.set(
        row.id,
        row,
      );

      propertyIds.add(
        row.property_id,
      );
    }

    if (
      propertyIds.size > 0
    ) {
      const {
        data:
          propertyData,
        error:
          propertyError,
      } =
        await admin
          .from(
            "properties",
          )
          .select(
            "id, address_line1, city, county, state_code, postal_code, parcel_number",
          )
          .in(
            "id",
            Array.from(
              propertyIds,
            ),
          );

      if (propertyError) {
        throw new Error(
          `Unable to load assigned lead properties: ${propertyError.message}`,
        );
      }

      for (
        const row
        of (
          propertyData ??
          []
        ) as unknown as
          PropertyRow[]
      ) {
        propertiesById.set(
          row.id,
          row,
        );
      }
    }
  }

  const leads:
    StaffMyLead[] =
    [];

  for (
    const assignment
    of assignments
  ) {
    const batch =
      assignment.batch_id
        ? batchesById.get(
            assignment.batch_id,
          )
        : undefined;

    const isNew =
      !seenAssignmentIds.has(
        assignment.id,
      );

    if (
      assignment.subject_type ===
        "discovered_record" &&
      assignment.discovered_record_id
    ) {
      const record =
        discoveredById.get(
          assignment
            .discovered_record_id,
        );

      if (!record) {
        continue;
      }

      const currentSourceRow =
        assignment.batch_id
          ? sourceRowsByKey.get(
              sourceRowKey(
                assignment.batch_id,
                assignment
                  .discovered_record_id,
              ),
            )
          : undefined;

      const currentSnapshot =
        currentSourceRow
          ?.source_row_snapshot;

      const historicalSnapshots =
        (
          historicalRowsByRecordId.get(
            assignment
              .discovered_record_id,
          ) ??
          []
        )
          .filter(
            (row) =>
              !assignment.batch_id ||
              row.batch_id !==
                assignment.batch_id,
          )
          .map(
            (row) =>
              row.source_row_snapshot,
          );

      /*
       * Permanent contact-continuity rule:
       *
       * 1. Current assignment workbook wins.
       * 2. Blank phone fields are recovered from previous DueQuity
       *    workbook snapshots for the same DueQuity Record ID.
       * 3. If no workbook has the phone, live non-rejected enrichment
       *    is used as the final fallback.
       *
       * Therefore assigning or reassigning a lead cannot make a
       * known claimant phone number disappear from My Leads.
       */
      const phoneData =
        mergePhoneData({
          currentSnapshot,

          historicalSnapshots,

          enrichmentSnapshot:
            enrichmentByRecordId.get(
              assignment
                .discovered_record_id,
            ),
        });

      const ownerName =
        firstKnownField(
          currentSnapshot,
          historicalSnapshots,
          "Full Name as Listed by Source",
        ) ??
        record.former_owner_name ??
        "Owner name unavailable";

      const workbookAddress =
        firstKnownField(
          currentSnapshot,
          historicalSnapshots,
          "Property Address",
        );

      const caseOrParcel =
        firstKnownField(
          currentSnapshot,
          historicalSnapshots,
          "Case / Parcel / Property ID",
        ) ??
        buildCaseOrParcel(
          record.case_number,
          record.parcel_number,
        );

      const amountCents =
        record
          .source_listed_balance_cents ??
        parseMoneyToCents(
          firstKnownField(
            currentSnapshot,
            historicalSnapshots,
            "Available Surplus / Source-Listed Amount",
          ),
        );

      leads.push({
        assignmentId:
          assignment.id,

        subjectType:
          "discovered_record",

        recordId:
          assignment
            .discovered_record_id,

        isNew,

        ownerName,

        addressLine1:
          workbookAddress ??
          record.address_line1 ??
          "Property address unavailable",

        city:
          record.city ??
          undefined,

        county:
          record.county,

        stateCode:
          record.state_code,

        postalCode:
          record.postal_code ??
          undefined,

        amountCents,

        bestPhone:
          phoneData.bestPhone,

        additionalPhones:
          phoneData
            .additionalPhones,

        bestEmail:
          firstKnownField(
            currentSnapshot,
            historicalSnapshots,
            "Best Located Email",
          ),

        additionalEmails:
          firstKnownField(
            currentSnapshot,
            historicalSnapshots,
            "Additional Email Addresses",
          ),

        saleDate:
          record.sale_date ??
          firstKnownField(
            currentSnapshot,
            historicalSnapshots,
            "Sale Date / Source Sale Month-Year",
          ),

        caseOrParcel,

        batchReference:
          batch?.reference,

        batchName:
          batch?.name,

        assignedAt:
          assignment.assigned_at,

        sourceUrl:
          record.source_url,
      });

      continue;
    }

    if (
      assignment.subject_type ===
        "opportunity" &&
      assignment.opportunity_id
    ) {
      const opportunity =
        opportunitiesById.get(
          assignment
            .opportunity_id,
        );

      if (!opportunity) {
        continue;
      }

      const property =
        propertiesById.get(
          opportunity.property_id,
        );

      if (!property) {
        continue;
      }

      leads.push({
        assignmentId:
          assignment.id,

        subjectType:
          "opportunity",

        recordId:
          assignment
            .opportunity_id,

        isNew,

        ownerName:
          priorOwnerName(
            opportunity.prior_owners,
          ),

        addressLine1:
          property.address_line1,

        city:
          property.city,

        county:
          property.county,

        stateCode:
          property.state_code,

        postalCode:
          property.postal_code,

        amountCents:
          opportunity
            .confirmed_surplus_cents ??
          opportunity
            .estimated_surplus_cents ??
          undefined,

        saleDate:
          opportunity.sale_date ??
          undefined,

        caseOrParcel:
          property.parcel_number
            ? `Parcel ${property.parcel_number}`
            : undefined,

        batchReference:
          batch?.reference,

        batchName:
          batch?.name,

        assignedAt:
          assignment.assigned_at,

        opportunityReference:
          opportunity.reference,
      });
    }
  }

  return leads;
}