import "server-only";

import ExcelJS from "exceljs";

import {
  extractPublicRecordPdfRows,
} from "@/server/public-record-pdf-row-extractor";

import type {
  PublicRecordSourcePayload,
} from "@/server/public-record-source-fetcher";

import type {
  PublicRecordSourceDefinition,
} from "@/server/public-record-source-registry";

import type {
  PublicRecordTableProfile,
} from "@/server/public-record-table-profile";

/**
 * NATIONAL PUBLIC-RECORD ROW EXTRACTOR
 *
 * Converts source-native tabular payloads into a common row structure:
 *
 *   string[][]
 *
 * It does not assign business meaning to columns.
 *
 * The table profile is responsible for saying which column represents:
 *
 *   - owner
 *   - property ID
 *   - sale date
 *   - surplus amount
 *   - case number
 *   - address
 *
 * Supported row transports:
 *
 *   - HTML tables
 *   - CSV files
 *   - XLSX workbooks
 *   - text-based PDF tables
 *
 * JSON/API extraction uses its own structured parser family.
 *
 * Interactive portal extraction remains a separate source family and fails
 * closed until its extraction engine is implemented.
 */

/* ========================================================================== */
/* Shared text helpers                                                         */
/* ========================================================================== */

function decodeHtmlEntities(
  value: string,
): string {
  return value
    .replace(
      /&nbsp;|&#160;|&#xA0;/gi,
      " ",
    )
    .replace(
      /&amp;/gi,
      "&",
    )
    .replace(
      /&quot;/gi,
      '"',
    )
    .replace(
      /&#39;|&apos;/gi,
      "'",
    )
    .replace(
      /&lt;/gi,
      "<",
    )
    .replace(
      /&gt;/gi,
      ">",
    )
    .replace(
      /&#(\d+);/g,
      (
        _match,
        code: string,
      ) =>
        String.fromCharCode(
          Number(
            code,
          ),
        ),
    )
    .replace(
      /&#x([0-9a-f]+);/gi,
      (
        _match,
        code: string,
      ) =>
        String.fromCharCode(
          Number.parseInt(
            code,
            16,
          ),
        ),
    );
}

function htmlToText(
  value: string,
): string {
  return decodeHtmlEntities(
    value
      .replace(
        /<br\s*\/?>/gi,
        " ",
      )
      .replace(
        /<\/p>/gi,
        " ",
      )
      .replace(
        /<[^>]+>/g,
        " ",
      ),
  )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function normalizeCellText(
  value: string,
): string {
  return value
    .replace(
      /\u00a0/g,
      " ",
    )
    .replace(
      /\r\n/g,
      "\n",
    )
    .replace(
      /\r/g,
      "\n",
    )
    .trim();
}

/* ========================================================================== */
/* HTML table extraction                                                       */
/* ========================================================================== */

function extractHtmlRows(
  html: string,
): string[][] {
  const rows: string[][] =
    [];

  const rowPattern =
    /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

  let rowMatch:
    | RegExpExecArray
    | null;

  while (
    (
      rowMatch =
        rowPattern.exec(
          html,
        )
    ) !== null
  ) {
    const rowHtml =
      rowMatch[1];

    const cells: string[] =
      [];

    const cellPattern =
      /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;

    let cellMatch:
      | RegExpExecArray
      | null;

    while (
      (
        cellMatch =
          cellPattern.exec(
            rowHtml,
          )
      ) !== null
    ) {
      cells.push(
        htmlToText(
          cellMatch[1],
        ),
      );
    }

    if (
      cells.length >
      0
    ) {
      rows.push(
        cells,
      );
    }
  }

  return rows;
}

/* ========================================================================== */
/* CSV extraction                                                              */
/* ========================================================================== */

/**
 * Parse RFC-style comma-separated text while preserving:
 *
 *   - quoted commas
 *   - quoted line breaks
 *   - escaped double quotes
 *   - blank cells
 *
 * Column meaning remains entirely outside this function.
 */
function extractCsvRows(
  csv: string,
): string[][] {
  const rows: string[][] =
    [];

  let row: string[] =
    [];

  let field =
    "";

  let quoted =
    false;

  for (
    let index = 0;
    index < csv.length;
    index += 1
  ) {
    const character =
      csv[index];

    if (
      quoted
    ) {
      if (
        character ===
        '"'
      ) {
        const nextCharacter =
          csv[
            index + 1
          ];

        if (
          nextCharacter ===
          '"'
        ) {
          field +=
            '"';

          index +=
            1;

          continue;
        }

        quoted =
          false;

        continue;
      }

      field +=
        character;

      continue;
    }

    if (
      character ===
      '"'
    ) {
      quoted =
        true;

      continue;
    }

    if (
      character ===
      ","
    ) {
      row.push(
        normalizeCellText(
          field,
        ),
      );

      field =
        "";

      continue;
    }

    if (
      character ===
        "\n" ||
      character ===
        "\r"
    ) {
      if (
        character ===
          "\r" &&
        csv[
          index + 1
        ] ===
          "\n"
      ) {
        index +=
          1;
      }

      row.push(
        normalizeCellText(
          field,
        ),
      );

      field =
        "";

      if (
        row.some(
          (value) =>
            value.length >
            0,
        )
      ) {
        rows.push(
          row,
        );
      }

      row =
        [];

      continue;
    }

    field +=
      character;
  }

  /*
   * Preserve the final row when the file does not end with a newline.
   */
  if (
    field.length >
      0 ||
    row.length >
      0
  ) {
    row.push(
      normalizeCellText(
        field,
      ),
    );

    if (
      row.some(
        (value) =>
          value.length >
            0,
      )
    ) {
      rows.push(
        row,
      );
    }
  }

  return rows;
}

/* ========================================================================== */
/* XLSX extraction                                                             */
/* ========================================================================== */

async function extractXlsxRows(
  bytes: Uint8Array,
): Promise<string[][]> {
  const workbook =
    new ExcelJS.Workbook();

  /*
   * ExcelJS 4.x declares Workbook.xlsx.load() against an older non-generic
   * Node Buffer type. Newer @types/node versions expose Buffer as a generic,
   * which causes an otherwise valid runtime Buffer to fail TypeScript
   * assignment checking.
   *
   * Deriving the parameter type directly from ExcelJS keeps this compatibility
   * conversion isolated here without weakening types elsewhere in the engine.
   */
  const workbookBuffer =
    Buffer.from(
      bytes,
    ) as unknown as Parameters<
      typeof workbook.xlsx.load
    >[0];

  await workbook.xlsx.load(
    workbookBuffer,
  );

  const worksheet =
    workbook.worksheets.find(
      (candidate) =>
        candidate.state !==
        "veryHidden",
    );

  if (
    !worksheet
  ) {
    throw new Error(
      "The XLSX workbook does not contain a readable worksheet.",
    );
  }

  const rows: string[][] =
    [];

  worksheet.eachRow(
    {
      includeEmpty:
        false,
    },
    (worksheetRow) => {
      const cells: string[] =
        [];

      /*
       * cellCount represents the highest populated cell position on the row.
       * Iterating every position preserves blank cells between populated
       * columns so profile column indexes remain stable.
       */
      for (
        let column = 1;
        column <= worksheetRow.cellCount;
        column += 1
      ) {
        const cell =
          worksheetRow.getCell(
            column,
          );

        cells.push(
          normalizeCellText(
            cell.text ??
              "",
          ),
        );
      }

      if (
        cells.some(
          (value) =>
            value.length >
            0,
        )
      ) {
        rows.push(
          cells,
        );
      }
    },
  );

  return rows;
}

/* ========================================================================== */
/* Payload guards                                                              */
/* ========================================================================== */

function verifyProfileFormat(
  source: PublicRecordSourceDefinition,
  profile: PublicRecordTableProfile,
): void {
  if (
    !profile.supportedSourceFormats.includes(
      source.sourceFormat,
    )
  ) {
    throw new Error(
      `Table profile ${profile.key} does not support source format ${source.sourceFormat}.`,
    );
  }
}

function verifyPayloadSource(
  source: PublicRecordSourceDefinition,
  payload: PublicRecordSourcePayload,
): void {
  if (
    payload.sourceKey !==
    source.key
  ) {
    throw new Error(
      `Source payload ${payload.sourceKey} does not belong to source ${source.key}.`,
    );
  }
}

/* ========================================================================== */
/* Public extraction API                                                       */
/* ========================================================================== */

/**
 * Convert one tabular official-source payload into source-neutral rows.
 *
 * The result can be passed directly to the configuration-driven table parser.
 */
export async function extractPublicRecordRows(
  source: PublicRecordSourceDefinition,
  profile: PublicRecordTableProfile,
  payload: PublicRecordSourcePayload,
): Promise<string[][]> {
  verifyProfileFormat(
    source,
    profile,
  );

  verifyPayloadSource(
    source,
    payload,
  );

  switch (
    source.sourceFormat
  ) {
    case "html_table": {
      if (
        payload.kind !==
          "text" ||
        payload.format !==
          "html_table"
      ) {
        throw new Error(
          `Source ${source.key} did not return the expected HTML-table payload.`,
        );
      }

      const rows =
        extractHtmlRows(
          payload.text,
        );

      if (
        rows.length ===
        0
      ) {
        throw new Error(
          `${source.sourceName} did not contain any readable HTML table rows.`,
        );
      }

      return rows;
    }

    case "csv": {
      if (
        payload.kind !==
          "text" ||
        payload.format !==
          "csv"
      ) {
        throw new Error(
          `Source ${source.key} did not return the expected CSV payload.`,
        );
      }

      const rows =
        extractCsvRows(
          payload.text,
        );

      if (
        rows.length ===
        0
      ) {
        throw new Error(
          `${source.sourceName} did not contain any readable CSV rows.`,
        );
      }

      return rows;
    }

    case "xlsx": {
      if (
        payload.kind !==
          "binary" ||
        payload.format !==
          "xlsx"
      ) {
        throw new Error(
          `Source ${source.key} did not return the expected XLSX payload.`,
        );
      }

      const rows =
        await extractXlsxRows(
          payload.bytes,
        );

      if (
        rows.length ===
        0
      ) {
        throw new Error(
          `${source.sourceName} did not contain any readable XLSX rows.`,
        );
      }

      return rows;
    }

    case "pdf_table": {
      if (
        payload.kind !==
          "binary" ||
        payload.format !==
          "pdf_table"
      ) {
        throw new Error(
          `Source ${source.key} did not return the expected PDF-table payload.`,
        );
      }

      const rows =
        await extractPublicRecordPdfRows(
          payload.bytes,
        );

      if (
        rows.length ===
        0
      ) {
        throw new Error(
          `${source.sourceName} did not contain any readable PDF table rows.`,
        );
      }

      return rows;
    }

    case "json_api":
      throw new Error(
        `JSON/API source ${source.key} uses the structured JSON parser and does not produce table rows.`,
      );

    case "web_portal":
      throw new Error(
        `Interactive portal extraction for source ${source.key} is not implemented yet.`,
      );
  }
}