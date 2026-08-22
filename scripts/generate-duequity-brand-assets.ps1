$ErrorActionPreference = "Stop"

# ============================================================================
# DUEQUITY BRAND ASSET GENERATOR
# Westforge Holdings Inc.
#
# Generates the minimum brand assets required for the current DueQuity build:
#
#   public/brand/duequity-mark.svg
#   public/brand/duequity-logo.svg
#   public/brand/duequity-logo-light.svg
#   src/app/icon.svg
#
# The geometry mirrors the existing DueQuity brand concept:
# a property/parcel boundary with its lower-right equity area filled.
#
# No external packages are required.
# ============================================================================

$ProjectRoot = "C:\Users\Roger\OneDrive\Documents\WestForge Holdings Inc\duequity"

$BrandDirectory = Join-Path $ProjectRoot "public\brand"
$AppDirectory = Join-Path $ProjectRoot "src\app"

New-Item -ItemType Directory -Force $BrandDirectory | Out-Null
New-Item -ItemType Directory -Force $AppDirectory | Out-Null

# ============================================================================
# Brand colours
# ============================================================================

$Ink900 = "#161C23"
$Ink950 = "#0C1015"

$Accent300 = "#7FB79F"
$Accent500 = "#1F7A5C"
$Accent600 = "#16624A"

$Canvas = "#F7F6F3"
$White = "#FFFFFF"

# ============================================================================
# Primary brand mark
# ============================================================================

$MarkSvg = @"
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="256"
  height="256"
  viewBox="0 0 64 64"
  fill="none"
  role="img"
  aria-labelledby="title desc"
>
  <title id="title">Duequity</title>
  <desc id="desc">A property boundary divided into sections with the lower-right equity section filled.</desc>

  <rect
    x="8"
    y="8"
    width="48"
    height="48"
    rx="3"
    stroke="$Accent600"
    stroke-width="4"
  />

  <path
    d="M32 10V54"
    stroke="$Accent600"
    stroke-width="3"
    stroke-linecap="round"
    opacity="0.58"
  />

  <path
    d="M10 32H54"
    stroke="$Accent600"
    stroke-width="3"
    stroke-linecap="round"
    opacity="0.58"
  />

  <rect
    x="35"
    y="35"
    width="18"
    height="18"
    rx="1.5"
    fill="$Accent500"
  />
</svg>
"@

Set-Content `
  -Path (Join-Path $BrandDirectory "duequity-mark.svg") `
  -Value $MarkSvg `
  -Encoding UTF8

# ============================================================================
# Primary horizontal logo
# ============================================================================

$LogoSvg = @"
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="520"
  height="112"
  viewBox="0 0 520 112"
  fill="none"
  role="img"
  aria-labelledby="title desc"
>
  <title id="title">Duequity</title>
  <desc id="desc">Duequity institutional wordmark with property equity symbol.</desc>

  <g transform="translate(12 24)">
    <rect
      x="4"
      y="4"
      width="56"
      height="56"
      rx="3.5"
      stroke="$Accent600"
      stroke-width="4.5"
    />

    <path
      d="M32 6V58"
      stroke="$Accent600"
      stroke-width="3.5"
      stroke-linecap="round"
      opacity="0.58"
    />

    <path
      d="M6 32H58"
      stroke="$Accent600"
      stroke-width="3.5"
      stroke-linecap="round"
      opacity="0.58"
    />

    <rect
      x="35.5"
      y="35.5"
      width="20.5"
      height="20.5"
      rx="1.5"
      fill="$Accent500"
    />
  </g>

  <text
    x="94"
    y="72"
    fill="$Ink900"
    font-family="Georgia, 'Times New Roman', serif"
    font-size="48"
    font-weight="600"
    letter-spacing="-1.2"
  >Duequity</text>
</svg>
"@

Set-Content `
  -Path (Join-Path $BrandDirectory "duequity-logo.svg") `
  -Value $LogoSvg `
  -Encoding UTF8

# ============================================================================
# Light horizontal logo
# ============================================================================

$LogoLightSvg = @"
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="520"
  height="112"
  viewBox="0 0 520 112"
  fill="none"
  role="img"
  aria-labelledby="title desc"
>
  <title id="title">Duequity</title>
  <desc id="desc">Duequity light institutional wordmark for dark surfaces.</desc>

  <g transform="translate(12 24)">
    <rect
      x="4"
      y="4"
      width="56"
      height="56"
      rx="3.5"
      stroke="$Accent300"
      stroke-width="4.5"
    />

    <path
      d="M32 6V58"
      stroke="$Accent300"
      stroke-width="3.5"
      stroke-linecap="round"
      opacity="0.68"
    />

    <path
      d="M6 32H58"
      stroke="$Accent300"
      stroke-width="3.5"
      stroke-linecap="round"
      opacity="0.68"
    />

    <rect
      x="35.5"
      y="35.5"
      width="20.5"
      height="20.5"
      rx="1.5"
      fill="$Accent300"
    />
  </g>

  <text
    x="94"
    y="72"
    fill="$White"
    font-family="Georgia, 'Times New Roman', serif"
    font-size="48"
    font-weight="600"
    letter-spacing="-1.2"
  >Duequity</text>
</svg>
"@

Set-Content `
  -Path (Join-Path $BrandDirectory "duequity-logo-light.svg") `
  -Value $LogoLightSvg `
  -Encoding UTF8

# ============================================================================
# Browser / application icon
#
# Dark institutional tile with the simplified equity mark.
# This intentionally uses fewer details than the full logo because favicons
# must remain recognizable at very small sizes.
# ============================================================================

$IconSvg = @"
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="512"
  height="512"
  viewBox="0 0 64 64"
  fill="none"
  role="img"
  aria-labelledby="title desc"
>
  <title id="title">Duequity</title>
  <desc id="desc">Duequity property equity mark.</desc>

  <rect
    width="64"
    height="64"
    rx="14"
    fill="$Ink950"
  />

  <rect
    x="13"
    y="13"
    width="38"
    height="38"
    rx="2.5"
    stroke="$Accent300"
    stroke-width="4"
  />

  <path
    d="M32 15V49"
    stroke="$Accent300"
    stroke-width="3"
    stroke-linecap="round"
    opacity="0.68"
  />

  <path
    d="M15 32H49"
    stroke="$Accent300"
    stroke-width="3"
    stroke-linecap="round"
    opacity="0.68"
  />

  <rect
    x="35"
    y="35"
    width="13"
    height="13"
    rx="1"
    fill="$Accent300"
  />
</svg>
"@

Set-Content `
  -Path (Join-Path $AppDirectory "icon.svg") `
  -Value $IconSvg `
  -Encoding UTF8

# ============================================================================
# Remove the generic Next.js favicon if one exists.
#
# The App Router will use src/app/icon.svg as the current Duequity icon.
# ============================================================================

$LegacyFavicon = Join-Path $AppDirectory "favicon.ico"

if (Test-Path $LegacyFavicon) {
    Remove-Item $LegacyFavicon -Force
    Write-Host "Removed old favicon.ico"
}

# ============================================================================
# Results
# ============================================================================

Write-Host ""
Write-Host "Duequity brand assets generated successfully:"
Write-Host ""
Write-Host "  public\brand\duequity-mark.svg"
Write-Host "  public\brand\duequity-logo.svg"
Write-Host "  public\brand\duequity-logo-light.svg"
Write-Host "  src\app\icon.svg"
Write-Host ""
Write-Host "Primary colours:"
Write-Host "  Ink:          $Ink900"
Write-Host "  Equity green: $Accent500"
Write-Host "  Dark green:   $Accent600"
Write-Host "  Light green:  $Accent300"
Write-Host "  Canvas:       $Canvas"
Write-Host ""