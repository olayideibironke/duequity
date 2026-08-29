import {
  NextResponse,
} from "next/server";

import ExcelJS from "exceljs";

import {
  can,
  STAFF_AUTHENTICATION_REQUIRED_MESSAGE,
} from "@/lib/session";

import {
  listStaffMyLeads,
} from "@/server/staff-my-leads-service";

import {
  resolveStaffSession,
} from "@/server/staff-session";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function errorResponse(
  message:
    string,
  status:
    number,
) {
  return NextResponse.json(
    {
      ok:
        false,

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

function safeFilePart(
  value:
    string,
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

export async function GET() {
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
      "opportunity.read",
    )
  ) {
    return errorResponse(
      "You do not have permission to export assigned recovery leads.",
      403,
    );
  }

  /*
   * Security boundary:
   *
   * listStaffMyLeads() scopes ordinary staff to assignments where
   * assigned_to_staff_user_id equals the authenticated staff user.
   *
   * This export therefore cannot become a county-wide Discovery export.
   */
  const leads =
    await listStaffMyLeads(
      session,
    );

  if (
    leads.length ===
    0
  ) {
    return errorResponse(
      "No active recovery leads are assigned to your staff account.",
      404,
    );
  }

  const workbook =
    new ExcelJS.Workbook();

  workbook.creator =
    "DueQuity";

  workbook.company =
    "Westforge Holdings Inc";

  workbook.subject =
    `Assigned recovery leads for ${session.user.name}`;

  workbook.title =
    "DueQuity Assigned Leads";

  workbook.created =
    new Date();

  const worksheet =
    workbook.addWorksheet(
      "My Leads",
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
    "A1:S1",
  );

  const titleCell =
    worksheet.getCell(
      "A1",
    );

  titleCell.value =
    `DueQuity My Leads | ${session.user.name}`;

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

  worksheet.getRow(
    1,
  ).height =
    26;

  worksheet.mergeCells(
    "A2:S2",
  );

  worksheet.getCell(
    "A2",
  ).value =
    `${leads.length} active assigned recovery lead${leads.length === 1 ? "" : "s"} exported ${new Date().toLocaleString("en-US")}.`;

  worksheet.getCell(
    "A2",
  ).font = {
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
    "A3:S3",
  );

  worksheet.getCell(
    "A3",
  ).value =
    "This workbook contains only recovery leads assigned to this DueQuity staff account. Discovery leads are not automatically claimants or clients.";

  worksheet.getCell(
    "A3",
  ).font = {
    size:
      10,

    color: {
      argb:
        "FF815D1C",
    },
  };

  worksheet.getCell(
    "A3",
  ).fill = {
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
    "Full Name as Listed by Source",
    "Best Located Phone",
    "Additional Phone Numbers",
    "Best Located Email",
    "Additional Email Addresses",
    "Property Address",
    "City",
    "County",
    "State",
    "ZIP",
    "Available Surplus / Source-Listed Amount",
    "Sale Date / Source Sale Month-Year",
    "Case / Parcel / Property ID",
    "Assignment Batch Reference",
    "Assignment Batch Name",
    "Assigned At",
    "Lead Stage",
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
    (
      cell,
    ) => {
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
    },
  );

  for (
    const lead
    of leads
  ) {
    const row =
      worksheet.addRow([
        lead.ownerName,
        lead.bestPhone ?? "",
        lead.additionalPhones ?? "",
        lead.bestEmail ?? "",
        lead.additionalEmails ?? "",
        lead.addressLine1,
        lead.city ?? "",
        lead.county,
        lead.stateCode,
        lead.postalCode ?? "",
        lead.amountCents ===
        undefined
          ? null
          : lead.amountCents /
            100,
        lead.saleDate ?? "",
        lead.caseOrParcel ?? "",
        lead.batchReference ?? "",
        lead.batchName ?? "",
        lead.assignedAt,
        lead.subjectType ===
        "discovered_record"
          ? "Discovery"
          : "Opportunity",
        lead.recordId,
        lead.sourceUrl ?? "",
      ]);

    row.alignment = {
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
    32,
    22,
    28,
    30,
    32,
    40,
    20,
    22,
    10,
    12,
    24,
    24,
    36,
    42,
    30,
    24,
    16,
    32,
    48,
  ];

  widths.forEach(
    (
      width,
      index,
    ) => {
      worksheet.getColumn(
        index +
          1,
      ).width =
        width;
    },
  );

  worksheet.getColumn(
    11,
  ).numFmt =
    "$#,##0.00";

  for (
    let rowNumber =
      5;
    rowNumber <=
      worksheet.rowCount;
    rowNumber +=
      1
  ) {
    const row =
      worksheet.getRow(
        rowNumber,
      );

    row.height =
      36;

    row.eachCell(
      (
        cell,
      ) => {
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
    `DueQuity_${safeFilePart(
      session.user.name,
    )}_Assigned_Leads_${datePart}.xlsx`;

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