import {
  NextRequest,
  NextResponse,
} from "next/server";

import ExcelJS from "exceljs";

import type {
  StateCode,
} from "@/domain/types";

import {
  can,
  clearedForState,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";

import {
  listDiscoveredRecordEnrichments,
  type ClaimantLocatorAssociatedContact,
  type ClaimantLocatorCandidate,
  type ClaimantLocatorIdentityCandidate,
  type ClaimantLocatorSource,
  type DiscoveredRecordEnrichment,
} from "@/server/discovered-record-enrichment-store";

import {
  listDiscoveredRecords,
  type DiscoveredRecord,
} from "@/server/discovered-record-store";

import {
  loadNationalGeography,
} from "@/server/geography-resolver";

import {
  discoverOfficialPublicRecords,
  type OfficialPublicRecord,
} from "@/server/public-record-discovery";

import {
  recordAuditEvent,
} from "@/server/audit-event-store";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

interface ExportRow {
  firstName: string;

  lastName: string;

  fullSourceName: string;

  aliases: string;

  mostRecentPhone: string;

  additionalPhones: string;

  email: string;

  mostRecentMailingAddress: string;

  associatedContact: string;

  relationship: string;

  associatedPhone: string;

  associatedEmail: string;

  county: string;

  state: string;

  propertyAddress: string;

  caseParcelPropertyId: string;

  saleDate: string;

  sourceListedAmountCents?: number;

  officialSourceName: string;

  officialSourceUrl: string;

  contactProvenance: string;

  contactVerificationStatus: string;

  locatorStatus: string;

  outreachStatus: string;

  recordId: string;
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function errorResponse(
  message: string,
  status: number,
) {
  return NextResponse.json(
    {
      ok: false,

      error:
        message,
    },
    {
      status,

      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}

function normalizeCounty(
  value: string,
): string {
  return value
    .toLowerCase()
    .replace(
      /\bcounty\b/g,
      "",
    )
    .replace(
      /[^a-z0-9]+/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function sourceRecordMapKey(
  adapterKey: string,
  recordKey: string,
): string {
  return `${adapterKey.trim()}\u001f${recordKey.trim()}`;
}

function sourcePersonalFirstName(
  sourceRecord: OfficialPublicRecord | undefined,
): string {
  return sourceRecord
    ?.sourceFirstName
    ?.trim() ??
    "";
}

function sourcePersonalLastName(
  sourceRecord: OfficialPublicRecord | undefined,
): string {
  /*
   * The Carroll source labels its second name field "Last Name / Company".
   *
   * Only treat that value as a person's last name when the source also supplied
   * a First Name. If First Name is absent, the second field may be a company,
   * trust, estate or another non-person owner and must not be placed into the
   * Excel Last Name column.
   */
  if (
    !sourceRecord
      ?.sourceFirstName
      ?.trim()
  ) {
    return "";
  }

  return sourceRecord
    .sourceLastNameOrCompany
    ?.trim() ??
    "";
}

function sourceTimestamp(
  sourceDate: string,
  foundAt: string,
): number {
  const sourceTime =
    Date.parse(
      sourceDate,
    );

  if (
    Number.isFinite(
      sourceTime,
    )
  ) {
    return sourceTime;
  }

  const foundTime =
    Date.parse(
      foundAt,
    );

  return Number.isFinite(
    foundTime,
  )
    ? foundTime
    : 0;
}

function newestFirst<
  T extends {
    source: ClaimantLocatorSource;

    foundAt: string;

    status: string;
  },
>(
  items: T[],
): T[] {
  return [
    ...items,
  ]
    .filter(
      (item) =>
        item.status !==
        "rejected",
    )
    .sort(
      (
        left,
        right,
      ) =>
        sourceTimestamp(
          right.source.sourceDate,
          right.foundAt,
        ) -
        sourceTimestamp(
          left.source.sourceDate,
          left.foundAt,
        ),
    );
}

function contactCandidatesOfKind(
  enrichment: DiscoveredRecordEnrichment | undefined,
  kind:
    | "phone"
    | "email"
    | "mailing_address",
): ClaimantLocatorCandidate[] {
  return newestFirst(
    (
      enrichment
        ?.claimantLocator
        ?.candidates ??
      []
    ).filter(
      (candidate) =>
        candidate.kind ===
        kind,
    ),
  );
}

function identitiesOfKind(
  enrichment: DiscoveredRecordEnrichment | undefined,
  kind:
    | "first_name"
    | "last_name"
    | "alias",
): ClaimantLocatorIdentityCandidate[] {
  return newestFirst(
    (
      enrichment
        ?.claimantLocator
        ?.identities ??
      []
    ).filter(
      (candidate) =>
        candidate.kind ===
        kind,
    ),
  );
}

function associatedContacts(
  enrichment: DiscoveredRecordEnrichment | undefined,
): ClaimantLocatorAssociatedContact[] {
  return newestFirst(
    enrichment
      ?.claimantLocator
      ?.associatedContacts ??
      [],
  );
}

function uniqueValues(
  values: Array<
    string | undefined
  >,
): string[] {
  const seen =
    new Set<string>();

  const result: string[] =
    [];

  for (
    const value of values
  ) {
    const trimmed =
      value?.trim();

    if (
      !trimmed
    ) {
      continue;
    }

    const key =
      trimmed.toLowerCase();

    if (
      seen.has(
        key,
      )
    ) {
      continue;
    }

    seen.add(
      key,
    );

    result.push(
      trimmed,
    );
  }

  return result;
}

function selectedSources(
  enrichment: DiscoveredRecordEnrichment | undefined,
): ClaimantLocatorSource[] {
  const locator =
    enrichment
      ?.claimantLocator;

  if (
    !locator
  ) {
    return [];
  }

  const sources: ClaimantLocatorSource[] =
    [];

  for (
    const candidate of locator.candidates
  ) {
    if (
      candidate.status !==
      "rejected"
    ) {
      sources.push(
        candidate.source,
      );
    }
  }

  for (
    const identity of locator.identities ??
    []
  ) {
    if (
      identity.status !==
      "rejected"
    ) {
      sources.push(
        identity.source,
      );
    }
  }

  for (
    const contact of locator.associatedContacts ??
    []
  ) {
    if (
      contact.status !==
      "rejected"
    ) {
      sources.push(
        contact.source,
      );
    }
  }

  return sources;
}

function provenanceLabel(
  enrichment: DiscoveredRecordEnrichment | undefined,
): string {
  const sources =
    selectedSources(
      enrichment,
    );

  return uniqueValues(
    sources.map(
      (source) =>
        `${source.sourceName} (${source.sourceDate})`,
    ),
  ).join(
    "; ",
  );
}

function contactVerificationStatus(
  enrichment: DiscoveredRecordEnrichment | undefined,
): string {
  const directContacts =
    enrichment
      ?.claimantLocator
      ?.candidates ??
      [];

  if (
    directContacts.some(
      (candidate) =>
        candidate.status ===
        "verified",
    )
  ) {
    return "Verified";
  }

  if (
    directContacts.some(
      (candidate) =>
        candidate.status ===
        "candidate",
    )
  ) {
    return "Candidate";
  }

  return "No contact data";
}

function locatorStatus(
  enrichment: DiscoveredRecordEnrichment | undefined,
): string {
  const locator =
    enrichment
      ?.claimantLocator;

  if (
    !locator
  ) {
    return "Not started";
  }

  const direct =
    locator.candidates ??
    [];

  if (
    direct.some(
      (candidate) =>
        candidate.status ===
        "verified",
    )
  ) {
    return "Verified contact available";
  }

  const activeFindingCount =
    [
      ...direct,
      ...(locator.identities ?? []),
      ...(locator.associatedContacts ?? []),
    ].filter(
      (finding) =>
        finding.status !==
        "rejected",
    ).length;

  if (
    activeFindingCount > 0
  ) {
    return "Research findings available";
  }

  const totalFindingCount =
    direct.length +
    (
      locator.identities
        ?.length ??
      0
    ) +
    (
      locator.associatedContacts
        ?.length ??
      0
    );

  return totalFindingCount > 0
    ? "Research findings rejected"
    : "Not started";
}

function propertyAddress(
  record: DiscoveredRecord,
): string {
  return [
    record.addressLine1,
    record.city,
    record.county,
    record.state,
    record.postalCode,
  ]
    .filter(
      Boolean,
    )
    .join(
      ", ",
    );
}

function recordIdentifiers(
  record: DiscoveredRecord,
): string {
  return [
    record.caseNumber
      ? `Case ${record.caseNumber}`
      : undefined,

    record.parcelNumber
      ? `Parcel ${record.parcelNumber}`
      : undefined,

    record.propertyId
      ? `Property ID ${record.propertyId}`
      : undefined,
  ]
    .filter(
      Boolean,
    )
    .join(
      "; ",
    );
}

function exportRow(
  record: DiscoveredRecord,
  enrichment: DiscoveredRecordEnrichment | undefined,
  sourceRecord: OfficialPublicRecord | undefined,
): ExportRow {
  const firstNames =
    identitiesOfKind(
      enrichment,
      "first_name",
    );

  const lastNames =
    identitiesOfKind(
      enrichment,
      "last_name",
    );

  const aliases =
    identitiesOfKind(
      enrichment,
      "alias",
    );

  const phones =
    contactCandidatesOfKind(
      enrichment,
      "phone",
    );

  const emails =
    contactCandidatesOfKind(
      enrichment,
      "email",
    );

  const mailingAddresses =
    contactCandidatesOfKind(
      enrichment,
      "mailing_address",
    );

  const associates =
    associatedContacts(
      enrichment,
    );

  const mostRecentAssociate =
    associates[0];

  /*
   * Researched claimant identity takes precedence if Duequity has a non-rejected
   * identity finding. Otherwise use the exact separate name fields supplied by
   * the activated official county source.
   *
   * We never split formerOwnerName ourselves.
   */
  const sourceFirstName =
    sourcePersonalFirstName(
      sourceRecord,
    );

  const sourceLastName =
    sourcePersonalLastName(
      sourceRecord,
    );

  return {
    firstName:
      firstNames[0]
        ?.value ??
      sourceFirstName,

    lastName:
      lastNames[0]
        ?.value ??
      sourceLastName,

    fullSourceName:
      record.formerOwnerName,

    aliases:
      uniqueValues(
        aliases.map(
          (candidate) =>
            candidate.value,
        ),
      ).join(
        "; ",
      ),

    mostRecentPhone:
      phones[0]
        ?.value ??
      "",

    additionalPhones:
      uniqueValues(
        phones
          .slice(
            1,
          )
          .map(
            (candidate) =>
              candidate.value,
          ),
      ).join(
        "; ",
      ),

    email:
      emails[0]
        ?.value ??
      "",

    mostRecentMailingAddress:
      mailingAddresses[0]
        ?.value ??
      "",

    associatedContact:
      mostRecentAssociate
        ?.name ??
      "",

    relationship:
      mostRecentAssociate
        ?.relationship ??
      "",

    associatedPhone:
      mostRecentAssociate
        ?.phone ??
      "",

    associatedEmail:
      mostRecentAssociate
        ?.email ??
      "",

    county:
      record.county,

    state:
      record.state,

    propertyAddress:
      propertyAddress(
        record,
      ),

    caseParcelPropertyId:
      recordIdentifiers(
        record,
      ),

    saleDate:
      record.saleDate,

    sourceListedAmountCents:
      record.sourceListedBalanceCents,

    officialSourceName:
      record.sourceName,

    officialSourceUrl:
      record.sourceUrl,

    contactProvenance:
      provenanceLabel(
        enrichment,
      ),

    contactVerificationStatus:
      contactVerificationStatus(
        enrichment,
      ),

    locatorStatus:
      locatorStatus(
        enrichment,
      ),

    /*
     * Duequity currently has no implemented outreach-attempt store in the
     * application layer and has sent no outreach. Do not infer an attempt from
     * locator research or promotion status.
     */
    outreachStatus:
      "Not started",

    recordId:
      record.id,
  };
}

function safeFilePart(
  value: string,
): string {
  return value
    .replace(
      /[^a-z0-9]+/gi,
      "_",
    )
    .replace(
      /^_+|_+$/g,
      "",
    );
}

/* ========================================================================== */
/* GET                                                                         */
/* ========================================================================== */

export async function GET(
  request: NextRequest,
) {
  const session =
    await resolveStaffSession();

  if (
    !session
  ) {
    return errorResponse(
      STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
      401,
    );
  }

  if (
    !can(
      session,
      "opportunity.write",
    )
  ) {
    return errorResponse(
      "You do not have permission to export discovered-record research.",
      403,
    );
  }

  const stateParam =
    request.nextUrl.searchParams
      .get(
        "state",
      )
      ?.trim()
      .toUpperCase();

  const countyGeoid =
    request.nextUrl.searchParams
      .get(
        "countyGeoid",
      )
      ?.trim();

  if (
    !stateParam ||
    !countyGeoid
  ) {
    return errorResponse(
      "State and county are required for Excel export.",
      400,
    );
  }

  const geography =
    await loadNationalGeography();

  const state =
    geography.states.find(
      (item) =>
        item.postalCode ===
        stateParam,
    );

  if (
    !state
  ) {
    return errorResponse(
      "The selected state is invalid.",
      400,
    );
  }

  const county =
    state.counties.find(
      (item) =>
        item.geoid ===
        countyGeoid,
    );

  if (
    !county
  ) {
    return errorResponse(
      "The selected county is invalid for this state.",
      400,
    );
  }

  const stateCode =
    state.postalCode as StateCode;

  if (
    !clearedForState(
      session,
      stateCode,
    )
  ) {
    return errorResponse(
      "You are not cleared to export discovered-record research for this state.",
      403,
    );
  }

  const [
    allRecords,
    enrichments,
  ] =
    await Promise.all([
      listDiscoveredRecords(),

      listDiscoveredRecordEnrichments(),
    ]);

  const records =
    allRecords.filter(
      (record) =>
        record.state ===
          stateCode &&
        normalizeCounty(
          record.county,
        ) ===
          normalizeCounty(
            county.name,
          ),
    );

  if (
    records.length === 0
  ) {
    return errorResponse(
      "No discovered records are available for the selected county.",
      404,
    );
  }

  const enrichmentByRecord =
    new Map(
      enrichments.map(
        (enrichment) => [
          enrichment.discoveredRecordId,
          enrichment,
        ],
      ),
    );

  /*
   * Re-read the activated official county source only to recover source-native
   * fields that were not part of older immutable staged snapshots.
   *
   * The match is exact by adapterKey + recordKey. We never match by name,
   * address, amount or another heuristic.
   *
   * If the live source is unsupported or temporarily unavailable, the export
   * still succeeds. Existing immutable staged evidence remains the source of
   * truth and the separate name columns simply remain blank unless Claimant
   * Locator research has established them.
   */
  const officialDiscovery =
    await discoverOfficialPublicRecords({
      state:
        stateCode,

      county:
        county.name,
    });

  const officialRecordBySourceKey =
    new Map<
      string,
      OfficialPublicRecord
    >();

  if (
    officialDiscovery.status ===
    "supported"
  ) {
    for (
      const sourceRecord of officialDiscovery.records
    ) {
      officialRecordBySourceKey.set(
        sourceRecordMapKey(
          sourceRecord.adapterKey,
          sourceRecord.recordKey,
        ),
        sourceRecord,
      );
    }
  }

  const rows =
    records.map(
      (record) =>
        exportRow(
          record,

          enrichmentByRecord.get(
            record.id,
          ),

          officialRecordBySourceKey.get(
            sourceRecordMapKey(
              record.adapterKey,
              record.recordKey,
            ),
          ),
        ),
    );

  const workbook =
    new ExcelJS.Workbook();

  workbook.creator =
    "DueQuity";

  workbook.company =
    "Westforge Holdings Inc";

  workbook.subject =
    `${county.name}, ${state.name} surplus discovery research`;

  workbook.title =
    "DueQuity Surplus Records";

  workbook.created =
    new Date();

  const worksheet =
    workbook.addWorksheet(
      "Surplus Records",
      {
        views: [
          {
            state:
              "frozen",

            ySplit:
              4,
          },
        ],
      },
    );

  worksheet.mergeCells(
    "A1:Y1",
  );

  const titleCell =
    worksheet.getCell(
      "A1",
    );

  titleCell.value =
    `DueQuity Surplus Records | ${county.name}, ${state.name}`;

  titleCell.font = {
    bold:
      true,

    size:
      16,

    color: {
      argb:
        "FF18352D",
    },
  };

  titleCell.alignment = {
    vertical:
      "middle",
  };

  worksheet.getRow(
    1,
  ).height =
    26;

  worksheet.mergeCells(
    "A2:Y2",
  );

  const subtitleCell =
    worksheet.getCell(
      "A2",
    );

  subtitleCell.value =
    `${rows.length} discovery lead${rows.length === 1 ? "" : "s"} exported ${new Date().toLocaleString("en-US")}. Blank locator fields mean the information has not been established in DueQuity research.`;

  subtitleCell.font = {
    size:
      10,

    italic:
      true,

    color: {
      argb:
        "FF5E6C66",
    },
  };

  worksheet.mergeCells(
    "A3:Y3",
  );

  const warningCell =
    worksheet.getCell(
      "A3",
    );

  warningCell.value =
    "Discovery leads are not automatically claimants or clients. Located data is distinct from verified data. Outreach status remains Not started until a real outreach attempt is persisted.";

  warningCell.font = {
    size:
      10,

    color: {
      argb:
        "FF815D1C",
    },
  };

  warningCell.fill = {
    type:
      "pattern",

    pattern:
      "solid",

    fgColor: {
      argb:
        "FFFFF7E6",
    },
  };

  const headers = [
    "First Name",
    "Last Name",
    "Full Name as Listed by Source",
    "Aliases / Alternate Names",
    "Most Recent Located Phone",
    "Additional Phone Numbers",
    "Email Address",
    "Most Recent Located Mailing Address",
    "Relative / Associated Contact",
    "Relationship",
    "Associated Contact Phone",
    "Associated Contact Email",
    "County",
    "State",
    "Property Address",
    "Case / Parcel / Property ID",
    "Sale Date",
    "Available Surplus / Source-Listed Amount",
    "Official Source",
    "Contact Data Source / Provenance",
    "Contact Verification Status",
    "Locator Status",
    "Outreach Status",
    "DueQuity Record ID",
    "Official Source URL",
  ];

  worksheet.addRow(
    headers,
  );

  const headerRow =
    worksheet.getRow(
      4,
    );

  headerRow.height =
    34;

  headerRow.eachCell(
    (cell) => {
      cell.font = {
        bold:
          true,

        color: {
          argb:
            "FFFFFFFF",
        },
      };

      cell.fill = {
        type:
          "pattern",

        pattern:
          "solid",

        fgColor: {
          argb:
            "FF18352D",
        },
      };

      cell.alignment = {
        vertical:
          "middle",

        wrapText:
          true,
      };

      cell.border = {
        bottom: {
          style:
            "thin",

          color: {
            argb:
              "FFD5DDD9",
          },
        },
      };
    },
  );

  for (
    const row of rows
  ) {
    const excelRow =
      worksheet.addRow([
        row.firstName,
        row.lastName,
        row.fullSourceName,
        row.aliases,
        row.mostRecentPhone,
        row.additionalPhones,
        row.email,
        row.mostRecentMailingAddress,
        row.associatedContact,
        row.relationship,
        row.associatedPhone,
        row.associatedEmail,
        row.county,
        row.state,
        row.propertyAddress,
        row.caseParcelPropertyId,
        row.saleDate,
        row.sourceListedAmountCents ===
        undefined
          ? null
          : row.sourceListedAmountCents /
            100,
        {
          text:
            row.officialSourceName,

          hyperlink:
            row.officialSourceUrl,
        },
        row.contactProvenance,
        row.contactVerificationStatus,
        row.locatorStatus,
        row.outreachStatus,
        row.recordId,
        row.officialSourceUrl,
      ]);

    excelRow.alignment = {
      vertical:
        "top",

      wrapText:
        true,
    };
  }

  worksheet.autoFilter = {
    from: {
      row:
        4,

      column:
        1,
    },

    to: {
      row:
        4,

      column:
        headers.length,
    },
  };

  worksheet.getColumn(
    1,
  ).width =
    16;

  worksheet.getColumn(
    2,
  ).width =
    18;

  worksheet.getColumn(
    3,
  ).width =
    30;

  worksheet.getColumn(
    4,
  ).width =
    28;

  worksheet.getColumn(
    5,
  ).width =
    22;

  worksheet.getColumn(
    6,
  ).width =
    28;

  worksheet.getColumn(
    7,
  ).width =
    28;

  worksheet.getColumn(
    8,
  ).width =
    38;

  worksheet.getColumn(
    9,
  ).width =
    28;

  worksheet.getColumn(
    10,
  ).width =
    18;

  worksheet.getColumn(
    11,
  ).width =
    22;

  worksheet.getColumn(
    12,
  ).width =
    28;

  worksheet.getColumn(
    13,
  ).width =
    20;

  worksheet.getColumn(
    14,
  ).width =
    10;

  worksheet.getColumn(
    15,
  ).width =
    38;

  worksheet.getColumn(
    16,
  ).width =
    34;

  worksheet.getColumn(
    17,
  ).width =
    14;

  worksheet.getColumn(
    18,
  ).width =
    22;

  worksheet.getColumn(
    19,
  ).width =
    36;

  worksheet.getColumn(
    20,
  ).width =
    40;

  worksheet.getColumn(
    21,
  ).width =
    22;

  worksheet.getColumn(
    22,
  ).width =
    26;

  worksheet.getColumn(
    23,
  ).width =
    18;

  worksheet.getColumn(
    24,
  ).width =
    30;

  worksheet.getColumn(
    25,
  ).width =
    45;

  worksheet.getColumn(
    18,
  ).numFmt =
    "$#,##0.00";

  for (
    let rowNumber = 5;
    rowNumber <=
      worksheet.rowCount;
    rowNumber += 1
  ) {
    const row =
      worksheet.getRow(
        rowNumber,
      );

    row.height =
      34;

    row.eachCell(
      (cell) => {
        cell.border = {
          bottom: {
            style:
              "hair",

            color: {
              argb:
                "FFE4E9E6",
            },
          },
        };
      },
    );
  }

  await recordAuditEvent({
    actor:
      session.user,

    action:
      "discovered_records.exported",

    targetType:
      "county",

    targetId:
      county.geoid,

    targetLabel:
      `${county.name}, ${state.name}`,

    outcome:
      "success",

    detail:
      `Exported ${rows.length} discovered record${rows.length === 1 ? "" : "s"} to Excel. Export did not authorize outreach or create operational claimant records.`,
  });

  const buffer =
    await workbook.xlsx.writeBuffer();

  const datePart =
    new Date()
      .toISOString()
      .slice(
        0,
        10,
      );

  const fileName =
    `DueQuity_${safeFilePart(state.postalCode)}_${safeFilePart(county.name)}_Surplus_Records_${datePart}.xlsx`;

  return new NextResponse(
    Buffer.from(
      buffer,
    ),
    {
      status:
        200,

      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

        "Content-Disposition":
          `attachment; filename="${fileName}"`,

        "Cache-Control":
          "private, no-store",
      },
    },
  );
}