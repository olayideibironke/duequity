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

  additionalEmails: string;

  mostRecentMailingAddress: string;

  additionalMailingAddresses: string;

  associatedContact: string;

  relationship: string;

  associatedPhone: string;

  associatedEmail: string;

  additionalAssociatedContacts: string;

  county: string;

  state: string;

  propertyAddress: string;

  caseParcelPropertyId: string;

  saleTiming: string;

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
   * A source-native Last Name / Company field is treated as a person's last
   * name only when that same government source also supplied a first name.
   *
   * This prevents companies, estates and trusts from being silently converted
   * into individual claimant names.
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

function findingStatusRank(
  status: string,
): number {
  switch (
    status
  ) {
    case "verified":
      return 3;

    case "candidate":
      return 2;

    case "rejected":
      return 0;

    default:
      return 1;
  }
}

function bestFirst<
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
      ) => {
        const statusDifference =
          findingStatusRank(
            right.status,
          ) -
          findingStatusRank(
            left.status,
          );

        if (
          statusDifference !==
          0
        ) {
          return statusDifference;
        }

        return (
          sourceTimestamp(
            right.source.sourceDate,
            right.foundAt,
          ) -
          sourceTimestamp(
            left.source.sourceDate,
            left.foundAt,
          )
        );
      },
    );
}

function contactCandidatesOfKind(
  enrichment: DiscoveredRecordEnrichment | undefined,
  kind:
    | "phone"
    | "email"
    | "mailing_address",
): ClaimantLocatorCandidate[] {
  return bestFirst(
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
  return bestFirst(
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
  return bestFirst(
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

  const sources:
    ClaimantLocatorSource[] =
    [];

  for (
    const candidate of
    locator.candidates
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
    const identity of
    locator.identities ??
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
    const contact of
    locator.associatedContacts ??
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
  const locator =
    enrichment
      ?.claimantLocator;

  if (
    !locator
  ) {
    return "No contact data";
  }

  const findings = [
    ...(locator.candidates ?? []),
    ...(locator.identities ?? []),
    ...(locator.associatedContacts ?? []),
  ];

  if (
    findings.some(
      (finding) =>
        finding.status ===
        "verified",
    )
  ) {
    return "Verified";
  }

  if (
    findings.some(
      (finding) =>
        finding.status ===
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

  const findings = [
    ...(locator.candidates ?? []),
    ...(locator.identities ?? []),
    ...(locator.associatedContacts ?? []),
  ];

  if (
    findings.some(
      (finding) =>
        finding.status ===
        "verified",
    )
  ) {
    return "Verified locator data available";
  }

  if (
    findings.some(
      (finding) =>
        finding.status ===
        "candidate",
    )
  ) {
    return "Locator candidates available";
  }

  if (
    findings.length >
    0
  ) {
    return "Research findings rejected";
  }

  return "Not started";
}

function propertyAddress(
  record: DiscoveredRecord,
): string {
  return uniqueValues([
    record.addressLine1,
    record.city,
    record.county,
    record.state,
    record.postalCode,
  ]).join(
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

    record.mapNumber
      ? `Map ${record.mapNumber}`
      : undefined,

    record.gridNumber
      ? `Grid ${record.gridNumber}`
      : undefined,
  ]
    .filter(
      (
        value,
      ): value is string =>
        Boolean(
          value,
        ),
    )
    .join(
      "; ",
    );
}

function saleTiming(
  record: DiscoveredRecord,
): string {
  if (
    record.saleDate
  ) {
    return record.saleDate;
  }

  if (
    record.sourceSaleTimingText
      ?.trim()
  ) {
    return record
      .sourceSaleTimingText
      .trim();
  }

  if (
    record.saleMonthYear
      ?.trim()
  ) {
    return record
      .saleMonthYear
      .trim();
  }

  return "";
}

function associatedContactSummary(
  contact: ClaimantLocatorAssociatedContact,
): string {
  return [
    contact.name?.trim(),

    contact.relationship?.trim()
      ? `Relationship: ${contact.relationship.trim()}`
      : undefined,

    contact.phone?.trim()
      ? `Phone: ${contact.phone.trim()}`
      : undefined,

    contact.email?.trim()
      ? `Email: ${contact.email.trim()}`
      : undefined,
  ]
    .filter(
      (
        value,
      ): value is string =>
        Boolean(
          value,
        ),
    )
    .join(
      " | ",
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

  const primaryAssociate =
    associates[0];

  /*
   * Researched identity takes precedence over source-native split name fields.
   *
   * DueQuity never guesses first/last names by splitting formerOwnerName.
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

    additionalEmails:
      uniqueValues(
        emails
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

    mostRecentMailingAddress:
      mailingAddresses[0]
        ?.value ??
      "",

    additionalMailingAddresses:
      uniqueValues(
        mailingAddresses
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

    associatedContact:
      primaryAssociate
        ?.name ??
      "",

    relationship:
      primaryAssociate
        ?.relationship ??
      "",

    associatedPhone:
      primaryAssociate
        ?.phone ??
      "",

    associatedEmail:
      primaryAssociate
        ?.email ??
      "",

    additionalAssociatedContacts:
      uniqueValues(
        associates
          .slice(
            1,
          )
          .map(
            associatedContactSummary,
          ),
      ).join(
        "; ",
      ),

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

    saleTiming:
      saleTiming(
        record,
      ),

    sourceListedAmountCents:
      record.sourceListedSurplusCents ??
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
     * Locator research is not outreach.
     *
     * This stays "Not started" until DueQuity has a persisted outreach-attempt
     * workflow.
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
    records.length ===
    0
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
   * Re-read the activated official source only to recover source-native fields
   * that were not included in older immutable staged snapshots.
   *
   * Matching is exact by adapterKey + recordKey only.
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
      const sourceRecord of
      officialDiscovery.records
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
    "A1:AB1",
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
    "A2:AB2",
  );

  const subtitleCell =
    worksheet.getCell(
      "A2",
    );

  subtitleCell.value =
    `${rows.length} discovery lead${rows.length === 1 ? "" : "s"} exported ${new Date().toLocaleString("en-US")}. Blank locator fields mean the information has not yet been established by DueQuity research.`;

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
    "A3:AB3",
  );

  const warningCell =
    worksheet.getCell(
      "A3",
    );

  warningCell.value =
    "Discovery leads are not automatically claimants or clients. Candidate locator data must be distinguished from verified data. Outreach status remains Not started until an actual outreach attempt is persisted.";

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
    "Best Located Phone",
    "Additional Phone Numbers",
    "Best Located Email",
    "Additional Email Addresses",
    "Best / Most Recent Located Mailing Address",
    "Additional Located Mailing Addresses",
    "Primary Relative / Associated Contact",
    "Relationship",
    "Associated Contact Phone",
    "Associated Contact Email",
    "Additional Relatives / Associated Contacts",
    "County",
    "State",
    "Property Address",
    "Case / Parcel / Property ID",
    "Sale Date / Source Sale Month-Year",
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
        row.additionalEmails,
        row.mostRecentMailingAddress,
        row.additionalMailingAddresses,
        row.associatedContact,
        row.relationship,
        row.associatedPhone,
        row.associatedEmail,
        row.additionalAssociatedContacts,
        row.county,
        row.state,
        row.propertyAddress,
        row.caseParcelPropertyId,
        row.saleTiming,
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

  const widths = [
    16,
    18,
    30,
    28,
    22,
    28,
    28,
    30,
    40,
    40,
    30,
    18,
    22,
    28,
    48,
    20,
    10,
    38,
    36,
    24,
    22,
    36,
    42,
    22,
    28,
    18,
    30,
    45,
  ];

  widths.forEach(
    (
      width,
      index,
    ) => {
      worksheet.getColumn(
        index + 1,
      ).width =
        width;
    },
  );

  worksheet.getColumn(
    21,
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
      38;

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