import "server-only";

import {
  readFile,
} from "node:fs/promises";

import {
  join,
} from "node:path";

import fontkit from "@pdf-lib/fontkit";

import {
  PDFDocument,
  PDFFont,
  PDFPage,
  rgb,
} from "pdf-lib";

/* ========================================================================== */
/* Types                                                                       */
/* ========================================================================== */

export interface SignedAgreementPdfInput {
  agreementTitle:
    string;

  renderedAgreement:
    string;

  claimReference:
    string;

  claimantReference:
    string;

  claimantLegalName:
    string;

  jurisdictionLabel:
    string;

  recoveryBasis:
    "estimated" |
    "confirmed";

  recoveryAmountCents:
    number;

  feeStructureLabel:
    string;

  projectedFeeCents:
    number;

  projectedClaimantNetCents:
    number;

  paymentRouteLabel:
    string;

  agreementHash:
    string;

  signaturePngBytes:
    Uint8Array;

  signatureSha256:
    string;

  signedAtIso:
    string;

  claimantAuthUserId:
    string;

  acknowledgedKeys:
    string[];

  electronicConsentText:
    string;
}

export interface GeneratedSignedAgreementPdf {
  bytes:
    Uint8Array;

  pageCount:
    number;

  fileName:
    string;
}

interface UnicodeFontCandidate {
  label:
    string;

  regularPath:
    string;

  boldPath:
    string;
}

interface EmbeddedFontPair {
  regular:
    PDFFont;

  bold:
    PDFFont;

  source:
    string;
}

/* ========================================================================== */
/* Page constants                                                              */
/* ========================================================================== */

const PAGE_WIDTH =
  612;

const PAGE_HEIGHT =
  792;

const MARGIN_X =
  54;

const TOP_MARGIN =
  68;

const BOTTOM_MARGIN =
  62;

const CONTENT_WIDTH =
  PAGE_WIDTH -
  MARGIN_X *
    2;

const BODY_SIZE =
  10.5;

const BODY_LINE_HEIGHT =
  15.5;

const SMALL_SIZE =
  8.5;

const SMALL_LINE_HEIGHT =
  12;

const SECTION_SIZE =
  11.5;

const SECTION_LINE_HEIGHT =
  17;

const TITLE_SIZE =
  18;

const TITLE_LINE_HEIGHT =
  23;

/* ========================================================================== */
/* Colors                                                                      */
/* ========================================================================== */

const INK =
  rgb(
    0.10,
    0.12,
    0.14,
  );

const MUTED =
  rgb(
    0.36,
    0.39,
    0.42,
  );

const LIGHT_LINE =
  rgb(
    0.84,
    0.84,
    0.82,
  );

const PAPER =
  rgb(
    0.97,
    0.96,
    0.93,
  );

const EQUITY =
  rgb(
    0.14,
    0.38,
    0.28,
  );

/* ========================================================================== */
/* Formatting                                                                  */
/* ========================================================================== */

function money(
  cents:
    number,
): string {
  return new Intl.NumberFormat(
    "en-US",
    {
      style:
        "currency",

      currency:
        "USD",

      minimumFractionDigits:
        2,

      maximumFractionDigits:
        2,
    },
  ).format(
    cents /
      100,
  );
}

function signedDateTime(
  iso:
    string,
): string {
  const parsed =
    new Date(
      iso,
    );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return iso;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        "UTC",

      year:
        "numeric",

      month:
        "long",

      day:
        "numeric",

      hour:
        "numeric",

      minute:
        "2-digit",

      second:
        "2-digit",

      timeZoneName:
        "short",
    },
  ).format(
    parsed,
  );
}

function recoveryBasisLabel(
  basis:
    "estimated" |
    "confirmed",
): string {
  return basis ===
    "confirmed"
    ? "Confirmed"
    : "Estimated";
}

function fileNameForClaim(
  claimReference:
    string,
): string {
  const safeReference =
    claimReference
      .replace(
        /[^A-Za-z0-9_-]+/g,
        "-",
      )
      .replace(
        /^-+|-+$/g,
        "",
      );

  return [
    "DueQuity-Recovery-Services-Agreement",
    safeReference ||
      "Claim",
    "Signed.pdf",
  ].join(
    "-",
  );
}

/* ========================================================================== */
/* Unicode PDF fonts                                                           */
/* ========================================================================== */

function configuredFontCandidate():
  UnicodeFontCandidate |
  undefined {
  const regularPath =
    process.env
      .DUEQUITY_PDF_FONT_REGULAR_PATH
      ?.trim();

  const boldPath =
    process.env
      .DUEQUITY_PDF_FONT_BOLD_PATH
      ?.trim();

  if (
    !regularPath &&
    !boldPath
  ) {
    return undefined;
  }

  if (
    !regularPath ||
    !boldPath
  ) {
    throw new Error(
      "Both DUEQUITY_PDF_FONT_REGULAR_PATH and DUEQUITY_PDF_FONT_BOLD_PATH must be configured together.",
    );
  }

  return {
    label:
      "DueQuity configured Unicode font",

    regularPath,

    boldPath,
  };
}

function systemFontCandidates():
  UnicodeFontCandidate[] {
  const candidates:
    UnicodeFontCandidate[] =
    [];

  if (
    process.platform ===
    "win32"
  ) {
    const windowsRoot =
      process.env.WINDIR?.trim() ||
      "C:\\Windows";

    const fontRoot =
      join(
        windowsRoot,
        "Fonts",
      );

    candidates.push(
      {
        label:
          "Windows Segoe UI",

        regularPath:
          join(
            fontRoot,
            "segoeui.ttf",
          ),

        boldPath:
          join(
            fontRoot,
            "segoeuib.ttf",
          ),
      },
      {
        label:
          "Windows Arial",

        regularPath:
          join(
            fontRoot,
            "arial.ttf",
          ),

        boldPath:
          join(
            fontRoot,
            "arialbd.ttf",
          ),
      },
    );
  }

  if (
    process.platform ===
    "linux"
  ) {
    candidates.push(
      {
        label:
          "Linux Noto Sans",

        regularPath:
          "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",

        boldPath:
          "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
      },
      {
        label:
          "Linux DejaVu Sans",

        regularPath:
          "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",

        boldPath:
          "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
      },
      {
        label:
          "Linux Liberation Sans",

        regularPath:
          "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",

        boldPath:
          "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
      },
    );
  }

  if (
    process.platform ===
    "darwin"
  ) {
    candidates.push(
      {
        label:
          "macOS Arial",

        regularPath:
          "/System/Library/Fonts/Supplemental/Arial.ttf",

        boldPath:
          "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
      },
    );
  }

  return candidates;
}

async function embedUnicodeFontCandidate({
  pdf,
  candidate,
}: {
  pdf:
    PDFDocument;

  candidate:
    UnicodeFontCandidate;
}): Promise<
  EmbeddedFontPair
> {
  const [
    regularBytes,
    boldBytes,
  ] =
    await Promise.all([
      readFile(
        candidate.regularPath,
      ),

      readFile(
        candidate.boldPath,
      ),
    ]);

  const [
    regular,
    bold,
  ] =
    await Promise.all([
      pdf.embedFont(
        regularBytes,
        {
          subset:
            true,
        },
      ),

      pdf.embedFont(
        boldBytes,
        {
          subset:
            true,
        },
      ),
    ]);

  return {
    regular,

    bold,

    source:
      candidate.label,
  };
}

async function loadUnicodeFontPair(
  pdf:
    PDFDocument,
): Promise<
  EmbeddedFontPair
> {
  pdf.registerFontkit(
    fontkit,
  );

  const configured =
    configuredFontCandidate();

  if (
    configured
  ) {
    try {
      return await embedUnicodeFontCandidate({
        pdf,

        candidate:
          configured,
      });
    } catch (
      error
    ) {
      throw new Error(
        `DueQuity could not load the configured Unicode PDF font: ${
          error instanceof
            Error
            ? error.message
            : "unknown font error"
        }`,
      );
    }
  }

  const candidates =
    systemFontCandidates();

  for (
    const candidate of
    candidates
  ) {
    try {
      return await embedUnicodeFontCandidate({
        pdf,

        candidate,
      });
    } catch {
      /*
       * Try the next known system font.
       */
    }
  }

  throw new Error(
    "A Unicode-capable PDF font could not be loaded. The frozen agreement will not be altered or transliterated. Configure DUEQUITY_PDF_FONT_REGULAR_PATH and DUEQUITY_PDF_FONT_BOLD_PATH before signing.",
  );
}

/* ========================================================================== */
/* PDF text integrity                                                          */
/* ========================================================================== */

function pdfText(
  font:
    PDFFont,
  value:
    string,
  label:
    string,
): string {
  /*
   * IMPORTANT:
   *
   * Do not replace punctuation, transliterate names, strip diacritics or
   * otherwise modify the frozen agreement merely to satisfy PDF encoding.
   *
   * The exact supplied text is validated against the embedded Unicode font and
   * then drawn unchanged.
   */
  try {
    font.encodeText(
      value,
    );
  } catch {
    throw new Error(
      `${label} contains a character that is not supported by the embedded Unicode PDF font. The frozen agreement text has not been altered.`,
    );
  }

  return value;
}

/* ========================================================================== */
/* Wrapping                                                                    */
/* ========================================================================== */

function splitLongToken({
  token,
  font,
  size,
  maxWidth,
}: {
  token:
    string;

  font:
    PDFFont;

  size:
    number;

  maxWidth:
    number;
}): string[] {
  if (
    font.widthOfTextAtSize(
      token,
      size,
    ) <=
    maxWidth
  ) {
    return [
      token,
    ];
  }

  const pieces:
    string[] =
    [];

  let current =
    "";

  for (
    const character of
    token
  ) {
    const candidate =
      current +
      character;

    if (
      current &&
      font.widthOfTextAtSize(
        candidate,
        size,
      ) >
        maxWidth
    ) {
      pieces.push(
        current,
      );

      current =
        character;
    } else {
      current =
        candidate;
    }
  }

  if (
    current
  ) {
    pieces.push(
      current,
    );
  }

  return pieces;
}

function wrapText({
  text,
  font,
  size,
  maxWidth,
}: {
  text:
    string;

  font:
    PDFFont;

  size:
    number;

  maxWidth:
    number;
}): string[] {
  const trimmed =
    text.trim();

  if (
    !trimmed
  ) {
    return [
      "",
    ];
  }

  const rawWords =
    trimmed.split(
      /\s+/,
    );

  const words =
    rawWords.flatMap(
      (
        word,
      ) =>
        splitLongToken({
          token:
            word,

          font,

          size,

          maxWidth,
        }),
    );

  const lines:
    string[] =
    [];

  let current =
    "";

  for (
    const word of
    words
  ) {
    const candidate =
      current
        ? `${current} ${word}`
        : word;

    if (
      current &&
      font.widthOfTextAtSize(
        candidate,
        size,
      ) >
        maxWidth
    ) {
      lines.push(
        current,
      );

      current =
        word;
    } else {
      current =
        candidate;
    }
  }

  if (
    current
  ) {
    lines.push(
      current,
    );
  }

  return lines;
}

/* ========================================================================== */
/* Page creation                                                               */
/* ========================================================================== */

interface DocumentContext {
  pdf:
    PDFDocument;

  regular:
    PDFFont;

  bold:
    PDFFont;

  claimReference:
    string;

  currentPage:
    PDFPage;

  y:
    number;
}

function createPage(
  context:
    Omit<
      DocumentContext,
      "currentPage" |
      "y"
    >,
): {
  page:
    PDFPage;

  y:
    number;
} {
  const page =
    context.pdf.addPage([
      PAGE_WIDTH,
      PAGE_HEIGHT,
    ]);

  page.drawText(
    "DUEQUITY",
    {
      x:
        MARGIN_X,

      y:
        PAGE_HEIGHT -
        35,

      size:
        9,

      font:
        context.bold,

      color:
        EQUITY,
    },
  );

  page.drawText(
    "A Westforge Holdings Inc. product",
    {
      x:
        MARGIN_X +
        62,

      y:
        PAGE_HEIGHT -
        35,

      size:
        7.5,

      font:
        context.regular,

      color:
        MUTED,
    },
  );

  page.drawLine({
    start: {
      x:
        MARGIN_X,

      y:
        PAGE_HEIGHT -
        45,
    },

    end: {
      x:
        PAGE_WIDTH -
        MARGIN_X,

      y:
        PAGE_HEIGHT -
        45,
    },

    thickness:
      0.7,

    color:
      LIGHT_LINE,
  });

  return {
    page,

    y:
      PAGE_HEIGHT -
      TOP_MARGIN,
  };
}

function ensureSpace(
  context:
    DocumentContext,
  requiredHeight:
    number,
): void {
  if (
    context.y -
      requiredHeight >=
    BOTTOM_MARGIN
  ) {
    return;
  }

  const next =
    createPage({
      pdf:
        context.pdf,

      regular:
        context.regular,

      bold:
        context.bold,

      claimReference:
        context.claimReference,
    });

  context.currentPage =
    next.page;

  context.y =
    next.y;
}

/* ========================================================================== */
/* Drawing                                                                     */
/* ========================================================================== */

function drawWrappedText({
  context,
  text,
  font,
  size,
  lineHeight,
  color,
  indent = 0,
  after = 7,
}: {
  context:
    DocumentContext;

  text:
    string;

  font:
    PDFFont;

  size:
    number;

  lineHeight:
    number;

  color:
    ReturnType<
      typeof rgb
    >;

  indent?:
    number;

  after?:
    number;
}): void {
  const safe =
    pdfText(
      font,
      text,
      "Agreement text",
    );

  const lines =
    wrapText({
      text:
        safe,

      font,

      size,

      maxWidth:
        CONTENT_WIDTH -
        indent,
    });

  for (
    const line of
    lines
  ) {
    ensureSpace(
      context,
      lineHeight,
    );

    if (
      line
    ) {
      context.currentPage.drawText(
        line,
        {
          x:
            MARGIN_X +
            indent,

          y:
            context.y,

          size,

          font,

          color,
        },
      );
    }

    context.y -=
      lineHeight;
  }

  context.y -=
    after;
}

function isSectionHeading(
  value:
    string,
): boolean {
  return /^\d+\.\s+[A-Z]/.test(
    value,
  );
}

function isMajorHeading(
  value:
    string,
): boolean {
  return (
    value ===
      "DUEQUITY RECOVERY SERVICES AGREEMENT" ||
    value ===
      "SCHEDULE A" ||
    value ===
      "CLAIM & FEE DISCLOSURE"
  );
}

function drawAgreementText(
  context:
    DocumentContext,
  agreement:
    string,
): void {
  const paragraphs =
    agreement.split(
      /\r?\n/,
    );

  for (
    const raw of
    paragraphs
  ) {
    const paragraph =
      raw.trim();

    if (
      !paragraph
    ) {
      context.y -=
        4;

      continue;
    }

    if (
      isMajorHeading(
        paragraph,
      )
    ) {
      ensureSpace(
        context,
        34,
      );

      drawWrappedText({
        context,

        text:
          paragraph,

        font:
          context.bold,

        size:
          paragraph ===
          "DUEQUITY RECOVERY SERVICES AGREEMENT"
            ? 15
            : 12.5,

        lineHeight:
          19,

        color:
          INK,

        after:
          8,
      });

      continue;
    }

    if (
      isSectionHeading(
        paragraph,
      )
    ) {
      ensureSpace(
        context,
        30,
      );

      drawWrappedText({
        context,

        text:
          paragraph,

        font:
          context.bold,

        size:
          SECTION_SIZE,

        lineHeight:
          SECTION_LINE_HEIGHT,

        color:
          INK,

        after:
          5,
      });

      continue;
    }

    if (
      paragraph.startsWith(
        "- ",
      )
    ) {
      drawWrappedText({
        context,

        text:
          paragraph,

        font:
          context.regular,

        size:
          BODY_SIZE,

        lineHeight:
          BODY_LINE_HEIGHT,

        color:
          INK,

        indent:
          12,

        after:
          3,
      });

      continue;
    }

    drawWrappedText({
      context,

      text:
        paragraph,

      font:
        context.regular,

      size:
        BODY_SIZE,

      lineHeight:
        BODY_LINE_HEIGHT,

      color:
        INK,

      after:
        6,
    });
  }
}

/* ========================================================================== */
/* Summary                                                                     */
/* ========================================================================== */

function drawSummaryBox({
  context,
  input,
}: {
  context:
    DocumentContext;

  input:
    SignedAgreementPdfInput;
}): void {
  const boxHeight =
    174;

  ensureSpace(
    context,
    boxHeight +
      16,
  );

  const top =
    context.y;

  context.currentPage.drawRectangle({
    x:
      MARGIN_X,

    y:
      top -
      boxHeight,

    width:
      CONTENT_WIDTH,

    height:
      boxHeight,

    color:
      PAPER,

    borderColor:
      LIGHT_LINE,

    borderWidth:
      0.7,
  });

  context.currentPage.drawText(
    "CLAIM & FEE SUMMARY",
    {
      x:
        MARGIN_X +
        16,

      y:
        top -
        24,

      size:
        8.5,

      font:
        context.bold,

      color:
        EQUITY,
    },
  );

  const rows: Array<
    [
      string,
      string,
    ]
  > = [
    [
      "Claim",
      input.claimReference,
    ],
    [
      "Claimant",
      `${input.claimantLegalName} (${input.claimantReference})`,
    ],
    [
      `${recoveryBasisLabel(
        input.recoveryBasis,
      )} recovery`,
      money(
        input.recoveryAmountCents,
      ),
    ],
    [
      "DueQuity fee",
      input.feeStructureLabel,
    ],
    [
      "Projected DueQuity fee",
      money(
        input.projectedFeeCents,
      ),
    ],
    [
      "Projected amount to claimant",
      money(
        input.projectedClaimantNetCents,
      ),
    ],
    [
      "Payment route",
      input.paymentRouteLabel,
    ],
    [
      "Jurisdiction",
      input.jurisdictionLabel,
    ],
  ];

  let y =
    top -
    44;

  for (
    const [
      label,
      value,
    ] of
    rows
  ) {
    const safeLabel =
      pdfText(
        context.bold,
        label,
        "Summary label",
      );

    const safeValue =
      pdfText(
        context.regular,
        value,
        "Summary value",
      );

    context.currentPage.drawText(
      safeLabel,
      {
        x:
          MARGIN_X +
          16,

        y,

        size:
          8.5,

        font:
          context.bold,

        color:
          MUTED,
      },
    );

    const valueLines =
      wrapText({
        text:
          safeValue,

        font:
          context.regular,

        size:
          9,

        maxWidth:
          315,
      });

    context.currentPage.drawText(
      valueLines[
        0
      ] ??
      "",
      {
        x:
          MARGIN_X +
          168,

        y,

        size:
          9,

        font:
          context.regular,

        color:
          INK,
      },
    );

    y -=
      16;
  }

  context.y =
    top -
    boxHeight -
    18;
}

/* ========================================================================== */
/* Signature page                                                              */
/* ========================================================================== */

async function drawSignatureCertificate({
  context,
  input,
}: {
  context:
    DocumentContext;

  input:
    SignedAgreementPdfInput;
}): Promise<void> {
  const next =
    createPage({
      pdf:
        context.pdf,

      regular:
        context.regular,

      bold:
        context.bold,

      claimReference:
        context.claimReference,
    });

  context.currentPage =
    next.page;

  context.y =
    next.y;

  drawWrappedText({
    context,

    text:
      "ELECTRONIC SIGNATURE CERTIFICATE",

    font:
      context.bold,

    size:
      TITLE_SIZE,

    lineHeight:
      TITLE_LINE_HEIGHT,

    color:
      INK,

    after:
      3,
  });

  drawWrappedText({
    context,

    text:
      "This certificate is part of the signed DueQuity Recovery Services Agreement and records the authenticated electronic-signature evidence associated with the agreement.",

    font:
      context.regular,

    size:
      BODY_SIZE,

    lineHeight:
      BODY_LINE_HEIGHT,

    color:
      MUTED,

    after:
      15,
  });

  const fields: Array<
    [
      string,
      string,
    ]
  > = [
    [
      "Claimant legal name",
      input.claimantLegalName,
    ],
    [
      "Claimant ID",
      input.claimantReference,
    ],
    [
      "Claim ID",
      input.claimReference,
    ],
    [
      "Authenticated claimant user",
      input.claimantAuthUserId,
    ],
    [
      "Signature method",
      "Drawn signature plus typed legal-name confirmation",
    ],
    [
      "Signed timestamp",
      signedDateTime(
        input.signedAtIso,
      ),
    ],
    [
      "Agreement SHA-256",
      input.agreementHash,
    ],
    [
      "Signature SHA-256",
      input.signatureSha256,
    ],
  ];

  for (
    const [
      label,
      value,
    ] of
    fields
  ) {
    drawWrappedText({
      context,

      text:
        label.toUpperCase(),

      font:
        context.bold,

      size:
        8,

      lineHeight:
        11,

      color:
        MUTED,

      after:
        1,
    });

    drawWrappedText({
      context,

      text:
        value,

      font:
        context.regular,

      size:
        9.5,

      lineHeight:
        14,

      color:
        INK,

      after:
        8,
    });
  }

  ensureSpace(
    context,
    145,
  );

  context.currentPage.drawText(
    "DRAWN ELECTRONIC SIGNATURE",
    {
      x:
        MARGIN_X,

      y:
        context.y,

      size:
        8,

      font:
        context.bold,

      color:
        MUTED,
    },
  );

  context.y -=
    18;

  const signatureImage =
    await context.pdf.embedPng(
      input.signaturePngBytes,
    );

  const availableWidth =
    310;

  const availableHeight =
    92;

  const scale =
    Math.min(
      availableWidth /
        signatureImage.width,

      availableHeight /
        signatureImage.height,

      1,
    );

  const signatureWidth =
    signatureImage.width *
    scale;

  const signatureHeight =
    signatureImage.height *
    scale;

  context.currentPage.drawRectangle({
    x:
      MARGIN_X,

    y:
      context.y -
      104,

    width:
      330,

    height:
      104,

    color:
      rgb(
        1,
        1,
        1,
      ),

    borderColor:
      LIGHT_LINE,

    borderWidth:
      0.8,
  });

  context.currentPage.drawImage(
    signatureImage,
    {
      x:
        MARGIN_X +
        10,

      y:
        context.y -
        96 +
        (
          92 -
          signatureHeight
        ) /
          2,

      width:
        signatureWidth,

      height:
        signatureHeight,
    },
  );

  context.y -=
    120;

  drawWrappedText({
    context,

    text:
      `Typed legal-name confirmation: ${input.claimantLegalName}`,

    font:
      context.bold,

    size:
      10,

    lineHeight:
      15,

    color:
      INK,

    after:
      12,
  });

  drawWrappedText({
    context,

    text:
      "ELECTRONIC CONSENT TEXT",

    font:
      context.bold,

    size:
      8,

    lineHeight:
      11,

    color:
      MUTED,

    after:
      2,
  });

  drawWrappedText({
    context,

    text:
      input.electronicConsentText,

    font:
      context.regular,

    size:
      9,

    lineHeight:
      13.5,

    color:
      INK,

    after:
      12,
  });

  drawWrappedText({
    context,

    text:
      "RECORDED ACKNOWLEDGEMENTS",

    font:
      context.bold,

    size:
      8,

    lineHeight:
      11,

    color:
      MUTED,

    after:
      2,
  });

  for (
    const key of
    input.acknowledgedKeys
  ) {
    drawWrappedText({
      context,

      text:
        `- ${key.replaceAll(
          "_",
          " ",
        )}`,

      font:
        context.regular,

      size:
        8.7,

      lineHeight:
        12.5,

      color:
        INK,

      indent:
        8,

      after:
        2,
    });
  }
}

/* ========================================================================== */
/* Footer                                                                      */
/* ========================================================================== */

function drawFooters({
  pdf,
  regular,
  bold,
  claimReference,
}: {
  pdf:
    PDFDocument;

  regular:
    PDFFont;

  bold:
    PDFFont;

  claimReference:
    string;
}): void {
  const pages =
    pdf.getPages();

  pages.forEach(
    (
      page,
      index,
    ) => {
      page.drawLine({
        start: {
          x:
            MARGIN_X,

          y:
            38,
        },

        end: {
          x:
            PAGE_WIDTH -
            MARGIN_X,

          y:
            38,
        },

        thickness:
          0.6,

        color:
          LIGHT_LINE,
      });

      page.drawText(
        pdfText(
          regular,
          `Claim ${claimReference}`,
          "Footer",
        ),
        {
          x:
            MARGIN_X,

          y:
            23,

          size:
            7,

          font:
            regular,

          color:
            MUTED,
        },
      );

      const pageLabel =
        `Page ${
          index +
          1
        } of ${
          pages.length
        }`;

      const width =
        bold.widthOfTextAtSize(
          pageLabel,
          7,
        );

      page.drawText(
        pageLabel,
        {
          x:
            PAGE_WIDTH -
            MARGIN_X -
            width,

          y:
            23,

          size:
            7,

          font:
            bold,

          color:
            MUTED,
        },
      );
    },
  );
}

/* ========================================================================== */
/* Generator                                                                   */
/* ========================================================================== */

export async function generateSignedAgreementPdf(
  input:
    SignedAgreementPdfInput,
): Promise<
  GeneratedSignedAgreementPdf
> {
  if (
    !input.renderedAgreement.trim()
  ) {
    throw new Error(
      "Signed agreement PDF requires the frozen agreement text.",
    );
  }

  if (
    input.signaturePngBytes.byteLength ===
    0
  ) {
    throw new Error(
      "Signed agreement PDF requires a drawn electronic signature.",
    );
  }

  const pdf =
    await PDFDocument.create();

  pdf.setTitle(
    input.agreementTitle,
  );

  pdf.setAuthor(
    "Westforge Holdings Inc. - DueQuity",
  );

  pdf.setSubject(
    `Signed DueQuity Recovery Services Agreement for ${input.claimReference}`,
  );

  pdf.setCreator(
    "DueQuity E-Document System",
  );

  pdf.setProducer(
    "DueQuity E-Document System",
  );

  pdf.setCreationDate(
    new Date(
      input.signedAtIso,
    ),
  );

  pdf.setModificationDate(
    new Date(
      input.signedAtIso,
    ),
  );

  const {
    regular,
    bold,
  } =
    await loadUnicodeFontPair(
      pdf,
    );

  /*
   * Validate the legal signer identity and frozen agreement before page
   * creation. No punctuation replacement, transliteration or ASCII fallback is
   * permitted.
   */
  pdfText(
    regular,
    input.claimantLegalName,
    "Claimant legal name",
  );

  pdfText(
    regular,
    input.renderedAgreement,
    "Agreement",
  );

  const first =
    createPage({
      pdf,

      regular,

      bold,

      claimReference:
        input.claimReference,
    });

  const context:
    DocumentContext = {
    pdf,

    regular,

    bold,

    claimReference:
      input.claimReference,

    currentPage:
      first.page,

    y:
      first.y,
  };

  drawWrappedText({
    context,

    text:
      input.agreementTitle,

    font:
      bold,

    size:
      TITLE_SIZE,

    lineHeight:
      TITLE_LINE_HEIGHT,

    color:
      INK,

    after:
      4,
  });

  drawWrappedText({
    context,

    text:
      "Electronically executed claimant copy",

    font:
      regular,

    size:
      9,

    lineHeight:
      13,

    color:
      MUTED,

    after:
      13,
  });

  drawSummaryBox({
    context,

    input,
  });

  drawAgreementText(
    context,
    input.renderedAgreement,
  );

  await drawSignatureCertificate({
    context,

    input,
  });

  drawFooters({
    pdf,

    regular,

    bold,

    claimReference:
      input.claimReference,
  });

  const bytes =
    await pdf.save({
      useObjectStreams:
        false,

      addDefaultPage:
        false,

      updateFieldAppearances:
        false,
    });

  return {
    bytes,

    pageCount:
      pdf.getPageCount(),

    fileName:
      fileNameForClaim(
        input.claimReference,
      ),
  };
}