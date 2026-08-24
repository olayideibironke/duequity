import "server-only";

/**
 * NATIONAL PUBLIC-RECORD PDF ROW EXTRACTOR
 *
 * Converts text-based official government PDFs into reusable string[][] rows.
 *
 * This module performs transport/layout extraction only.
 *
 * It does NOT:
 *
 *   - decide which jurisdiction the PDF belongs to
 *   - interpret owner names
 *   - interpret surplus amounts
 *   - interpret sale dates
 *   - activate a government source
 *   - approve a jurisdiction
 *   - create discovered records
 *
 * Flow:
 *
 *   Official PDF bytes
 *      ↓
 *   PDF.js text extraction
 *      ↓
 *   Positioned text items
 *      ↓
 *   Baseline grouping
 *      ↓
 *   Horizontal text segmentation
 *      ↓
 *   Stable column-boundary inference
 *      ↓
 *   Blank-cell-preserving reconstruction
 *      ↓
 *   string[][]
 *
 * The national table-profile parser remains responsible for semantic mapping.
 */

/* ========================================================================== */
/* Internal positioned-text model                                              */
/* ========================================================================== */

interface PositionedPdfText {
  text: string;

  x: number;

  y: number;

  width: number;

  height: number;
}

interface PdfTextItemLike {
  str: string;

  transform: number[];

  width: number;

  height: number;
}

interface PositionedPdfRow {
  baseline: number;

  items: PositionedPdfText[];
}

interface PositionedPdfSegment {
  text: string;

  x: number;

  right: number;
}

interface SegmentedPdfRow {
  row: PositionedPdfRow;

  segments: PositionedPdfSegment[];
}

interface PdfColumnLayout {
  columnCount: number;

  boundaries: number[];
}

interface PdfWorkerModuleLike {
  WorkerMessageHandler?: unknown;
}

interface PdfWorkerGlobal {
  pdfjsWorker?: {
    WorkerMessageHandler: unknown;
  };
}

/* ========================================================================== */
/* Shared helpers                                                              */
/* ========================================================================== */

function normalizeText(
  value: string,
): string {
  return value
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function isFiniteNumber(
  value: unknown,
): value is number {
  return (
    typeof value ===
      "number" &&
    Number.isFinite(
      value,
    )
  );
}

function isPdfTextItem(
  value: unknown,
): value is PdfTextItemLike {
  if (
    typeof value !==
      "object" ||
    value ===
      null
  ) {
    return false;
  }

  const candidate =
    value as Partial<PdfTextItemLike>;

  return (
    typeof candidate.str ===
      "string" &&
    Array.isArray(
      candidate.transform,
    ) &&
    candidate.transform.length >=
      6 &&
    candidate.transform.every(
      isFiniteNumber,
    ) &&
    isFiniteNumber(
      candidate.width,
    ) &&
    isFiniteNumber(
      candidate.height,
    )
  );
}

function median(
  values: readonly number[],
): number | undefined {
  if (
    values.length ===
    0
  ) {
    return undefined;
  }

  const sorted =
    [...values].sort(
      (
        left,
        right,
      ) =>
        left -
        right,
    );

  const middle =
    Math.floor(
      sorted.length /
        2,
    );

  if (
    sorted.length %
      2 ===
    1
  ) {
    return sorted[
      middle
    ];
  }

  return (
    sorted[
      middle -
        1
    ] +
    sorted[
      middle
    ]
  ) /
    2;
}

/* ========================================================================== */
/* PDF.js server runtime                                                       */
/* ========================================================================== */

/**
 * PDF.js disables real Web Workers under Node and falls back to its internal
 * fake-worker implementation.
 *
 * When Next.js bundles pdf.mjs into a generated server chunk, PDF.js's default
 * relative worker path can incorrectly resolve beside that generated chunk.
 *
 * Preloading WorkerMessageHandler gives PDF.js the worker implementation
 * directly and prevents it from trying to discover pdf.worker.mjs relative to
 * the generated Next.js server chunk.
 */
async function loadServerPdfJs() {
  const workerModule =
    await import(
      "pdfjs-dist/legacy/build/pdf.worker.mjs"
    ) as PdfWorkerModuleLike;

  if (
    !workerModule.WorkerMessageHandler
  ) {
    throw new Error(
      "PDF.js worker module did not expose WorkerMessageHandler.",
    );
  }

  const globalWithPdfWorker =
    globalThis as typeof globalThis &
      PdfWorkerGlobal;

  if (
    !globalWithPdfWorker.pdfjsWorker
  ) {
    globalWithPdfWorker.pdfjsWorker = {
      WorkerMessageHandler:
        workerModule.WorkerMessageHandler,
    };
  }

  return import(
    "pdfjs-dist/legacy/build/pdf.mjs"
  );
}

/* ========================================================================== */
/* PDF text extraction                                                        */
/* ========================================================================== */

async function extractPageTextItems(
  page: {
    getTextContent(): Promise<{
      items: unknown[];
    }>;
  },
): Promise<PositionedPdfText[]> {
  const content =
    await page.getTextContent();

  return content.items
    .filter(
      isPdfTextItem,
    )
    .map(
      (item) => {
        const text =
          normalizeText(
            item.str,
          );

        return {
          text,

          x:
            item.transform[4],

          y:
            item.transform[5],

          width:
            Math.max(
              item.width,
              0,
            ),

          height:
            Math.max(
              item.height,
              0,
            ),
        };
      },
    )
    .filter(
      (item) =>
        Boolean(
          item.text,
        ),
    );
}

/* ========================================================================== */
/* Baseline grouping                                                           */
/* ========================================================================== */

function rowToleranceForItem(
  item: PositionedPdfText,
): number {
  return Math.max(
    2,
    item.height *
      0.35,
  );
}

function groupTextItemsIntoRows(
  items: readonly PositionedPdfText[],
): PositionedPdfRow[] {
  const sorted =
    [...items].sort(
      (
        left,
        right,
      ) => {
        const yDifference =
          right.y -
          left.y;

        if (
          Math.abs(
            yDifference,
          ) >
          0.5
        ) {
          return yDifference;
        }

        return left.x -
          right.x;
      },
    );

  const rows:
    PositionedPdfRow[] =
    [];

  for (
    const item of sorted
  ) {
    const tolerance =
      rowToleranceForItem(
        item,
      );

    let matchingRow:
      PositionedPdfRow |
      undefined;

    let smallestDifference =
      Number.POSITIVE_INFINITY;

    for (
      const row of rows
    ) {
      const difference =
        Math.abs(
          row.baseline -
            item.y,
        );

      if (
        difference <=
          tolerance &&
        difference <
          smallestDifference
      ) {
        matchingRow =
          row;

        smallestDifference =
          difference;
      }
    }

    if (
      !matchingRow
    ) {
      rows.push(
        {
          baseline:
            item.y,

          items: [
            item,
          ],
        },
      );

      continue;
    }

    matchingRow.items.push(
      item,
    );

    matchingRow.baseline =
      matchingRow.items.reduce(
        (
          total,
          rowItem,
        ) =>
          total +
          rowItem.y,
        0,
      ) /
      matchingRow.items.length;
  }

  return rows.sort(
    (
      left,
      right,
    ) =>
      right.baseline -
      left.baseline,
  );
}

/* ========================================================================== */
/* Horizontal text segmentation                                               */
/* ========================================================================== */

function estimatedCharacterWidth(
  item: PositionedPdfText,
): number | undefined {
  const visibleCharacters =
    item.text.replace(
      /\s+/g,
      "",
    ).length;

  if (
    visibleCharacters ===
      0 ||
    item.width <=
      0
  ) {
    return undefined;
  }

  return item.width /
    visibleCharacters;
}

function determineColumnGapThreshold(
  items: readonly PositionedPdfText[],
): number {
  const characterWidths =
    items
      .map(
        estimatedCharacterWidth,
      )
      .filter(
        (
          value,
        ): value is number =>
          value !==
          undefined &&
          Number.isFinite(
            value,
          ) &&
          value >
            0,
      );

  const typicalCharacterWidth =
    median(
      characterWidths,
    ) ??
    4;

  /*
   * Ordinary spaces within a phrase remain in the same segment.
   * Material horizontal whitespace separates table regions.
   */
  return Math.max(
    9,
    typicalCharacterWidth *
      2.25,
  );
}

function segmentRow(
  row: PositionedPdfRow,
): PositionedPdfSegment[] {
  const items =
    [...row.items].sort(
      (
        left,
        right,
      ) =>
        left.x -
        right.x,
    );

  if (
    items.length ===
    0
  ) {
    return [];
  }

  const gapThreshold =
    determineColumnGapThreshold(
      items,
    );

  const segments:
    PositionedPdfSegment[] =
    [];

  let currentText =
    items[0].text;

  let currentX =
    items[0].x;

  let currentRight =
    items[0].x +
    items[0].width;

  for (
    const item of items.slice(
      1,
    )
  ) {
    const gap =
      item.x -
      currentRight;

    if (
      gap >
      gapThreshold
    ) {
      const normalized =
        normalizeText(
          currentText,
        );

      if (
        normalized
      ) {
        segments.push(
          {
            text:
              normalized,

            x:
              currentX,

            right:
              currentRight,
          },
        );
      }

      currentText =
        item.text;

      currentX =
        item.x;

      currentRight =
        item.x +
        item.width;

      continue;
    }

    const separator =
      currentText.endsWith(
        " ",
      ) ||
      item.text.startsWith(
        " ",
      )
        ? ""
        : " ";

    currentText =
      `${currentText}${separator}${item.text}`;

    currentRight =
      Math.max(
        currentRight,
        item.x +
          item.width,
      );
  }

  const finalText =
    normalizeText(
      currentText,
    );

  if (
    finalText
  ) {
    segments.push(
      {
        text:
          finalText,

        x:
          currentX,

        right:
          currentRight,
      },
    );
  }

  return segments;
}

/* ========================================================================== */
/* Stable PDF column-layout inference                                         */
/* ========================================================================== */

/**
 * Infer a common column layout from the most structurally complete rows.
 *
 * Rows with the greatest number of separated regions are used as reference
 * rows. This allows a table row with a blank optional field to retain that
 * blank field instead of shifting every later value to the left.
 *
 * Column boundaries are inferred from the whitespace between adjacent regions,
 * not from jurisdiction-specific column names.
 */
function inferStableColumnLayout(
  rows: readonly PositionedPdfRow[],
): PdfColumnLayout {
  const segmentedRows:
    SegmentedPdfRow[] =
    rows
      .map(
        (row) => ({
          row,

          segments:
            segmentRow(
              row,
            ),
        }),
      )
      .filter(
        (entry) =>
          entry.segments.length >=
          3,
      );

  if (
    segmentedRows.length ===
    0
  ) {
    throw new Error(
      "The PDF did not contain enough repeated horizontal structure to infer a table layout.",
    );
  }

  const targetColumnCount =
    Math.max(
      ...segmentedRows.map(
        (entry) =>
          entry.segments.length,
      ),
    );

  /*
   * A public-record table with dozens of inferred regions is more likely to be
   * a layout extraction failure than a reliable government table.
   */
  if (
    targetColumnCount <
      3 ||
    targetColumnCount >
      40
  ) {
    throw new Error(
      `The PDF produced an unsafe inferred column count of ${targetColumnCount}.`,
    );
  }

  const referenceRows =
    segmentedRows.filter(
      (entry) =>
        entry.segments.length ===
        targetColumnCount,
    );

  if (
    referenceRows.length ===
    0
  ) {
    throw new Error(
      "The PDF did not contain a complete reference row for stable column inference.",
    );
  }

  const boundaries:
    number[] =
    [];

  for (
    let index = 0;
    index <
    targetColumnCount -
      1;
    index +=
      1
  ) {
    const candidateBoundaries =
      referenceRows
        .map(
          (entry) => {
            const left =
              entry.segments[
                index
              ];

            const right =
              entry.segments[
                index +
                  1
              ];

            /*
             * Prefer the center of actual whitespace between neighboring
             * regions. If glyph boxes overlap slightly, fall back to the
             * midpoint between their starting positions.
             */
            if (
              left.right <=
              right.x
            ) {
              return (
                left.right +
                right.x
              ) /
                2;
            }

            return (
              left.x +
              right.x
            ) /
              2;
          },
        )
        .filter(
          isFiniteNumber,
        );

    const boundary =
      median(
        candidateBoundaries,
      );

    if (
      boundary ===
      undefined
    ) {
      throw new Error(
        "The PDF table boundaries could not be inferred reliably.",
      );
    }

    boundaries.push(
      boundary,
    );
  }

  for (
    let index = 1;
    index < boundaries.length;
    index += 1
  ) {
    if (
      boundaries[index] <=
      boundaries[
        index -
          1
      ] +
        1
    ) {
      throw new Error(
        "The PDF produced overlapping or unstable inferred table columns.",
      );
    }
  }

  return {
    columnCount:
      targetColumnCount,

    boundaries,
  };
}

/* ========================================================================== */
/* Blank-cell-preserving reconstruction                                       */
/* ========================================================================== */

function resolveColumnIndex(
  x: number,
  layout: PdfColumnLayout,
): number {
  for (
    let index = 0;
    index < layout.boundaries.length;
    index += 1
  ) {
    if (
      x <
      layout.boundaries[
        index
      ]
    ) {
      return index;
    }
  }

  return layout.columnCount -
    1;
}

function appendCellText(
  existing: string,
  addition: string,
): string {
  const normalizedAddition =
    normalizeText(
      addition,
    );

  if (
    !normalizedAddition
  ) {
    return existing;
  }

  if (
    !existing
  ) {
    return normalizedAddition;
  }

  return normalizeText(
    `${existing} ${normalizedAddition}`,
  );
}

function reconstructStableCells(
  row: PositionedPdfRow,
  layout: PdfColumnLayout,
): string[] {
  const cells =
    Array<string>(
      layout.columnCount,
    ).fill(
      "",
    );

  const segments =
    segmentRow(
      row,
    );

  for (
    const segment of segments
  ) {
    const columnIndex =
      resolveColumnIndex(
        segment.x,
        layout,
      );

    cells[
      columnIndex
    ] =
      appendCellText(
        cells[
          columnIndex
        ],
        segment.text,
      );
  }

  return cells.map(
    normalizeText,
  );
}

/* ========================================================================== */
/* Public PDF extractor                                                        */
/* ========================================================================== */

/**
 * Convert a text-based PDF into stable table-like rows.
 *
 * Column structure is inferred across the document and applied consistently to
 * every row. Missing source cells therefore remain represented as empty
 * strings instead of shifting later fields left.
 *
 * Pages are still baseline-grouped independently so text from different pages
 * can never merge into one row.
 *
 * Scanned image-only PDFs intentionally produce no rows here. OCR is not
 * performed automatically.
 */
export async function extractPublicRecordPdfRows(
  bytes: Uint8Array,
): Promise<string[][]> {
  if (
    bytes.byteLength ===
    0
  ) {
    throw new Error(
      "Cannot extract public-record rows from an empty PDF.",
    );
  }

  const {
    getDocument,
  } =
    await loadServerPdfJs();

  const loadingTask =
    getDocument(
      {
        data:
          new Uint8Array(
            bytes,
          ),
      },
    );

  const pdf =
    await loadingTask.promise;

  try {
    const positionedRows:
      PositionedPdfRow[] =
      [];

    for (
      let pageNumber =
        1;
      pageNumber <=
      pdf.numPages;
      pageNumber +=
        1
    ) {
      const page =
        await pdf.getPage(
          pageNumber,
        );

      const items =
        await extractPageTextItems(
          page,
        );

      const pageRows =
        groupTextItemsIntoRows(
          items,
        );

      positionedRows.push(
        ...pageRows,
      );

      page.cleanup();
    }

    if (
      positionedRows.length ===
      0
    ) {
      throw new Error(
        "The PDF was readable, but no text-based public-record rows could be extracted. The document may be scanned or image-only.",
      );
    }

    const layout =
      inferStableColumnLayout(
        positionedRows,
      );

    const rows =
      positionedRows
        .map(
          (row) =>
            reconstructStableCells(
              row,
              layout,
            ),
        )
        .filter(
          (row) =>
            row.some(
              (cell) =>
                cell.length >
                0,
            ),
        );

    if (
      rows.length ===
      0
    ) {
      throw new Error(
        "The PDF table layout was detected, but no usable rows could be reconstructed.",
      );
    }

    return rows;
  } finally {
    await pdf.destroy();
  }
}