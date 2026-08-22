$ErrorActionPreference = "Stop"

# ============================================================================
# DUEQUITY NATIONAL GEOGRAPHY SYNC
# Westforge Holdings Inc.
#
# Builds Duequity's U.S. state + county-equivalent geography registry from the
# authoritative U.S. Census Bureau 2025 Gazetteer files.
#
# Current operating scope:
#   - 50 states
#   - District of Columbia
#
# Territories are not activated yet.
#
# IMPORTANT:
#   This establishes geography only.
#   It does NOT create, infer or approve legal/compliance rules.
# ============================================================================

$ProjectRoot =
    "C:\Users\Roger\OneDrive\Documents\WestForge Holdings Inc\duequity"

$GeneratedDirectory =
    Join-Path $ProjectRoot "src\data\generated"

$TempDirectory =
    Join-Path $ProjectRoot ".duequity-data\geography-sync"

$StatesZip =
    Join-Path $TempDirectory "states.zip"

$CountiesZip =
    Join-Path $TempDirectory "counties.zip"

$StatesExtract =
    Join-Path $TempDirectory "states"

$CountiesExtract =
    Join-Path $TempDirectory "counties"

$OutputFile =
    Join-Path $GeneratedDirectory "us-geography.json"

$StatesUrl =
    "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_state_national.zip"

$CountiesUrl =
    "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_counties_national.zip"

# ============================================================================
# 50 states + District of Columbia
# ============================================================================

$OperationalPostalCodes = @(
    "AL",
    "AK",
    "AZ",
    "AR",
    "CA",
    "CO",
    "CT",
    "DE",
    "DC",
    "FL",
    "GA",
    "HI",
    "ID",
    "IL",
    "IN",
    "IA",
    "KS",
    "KY",
    "LA",
    "ME",
    "MD",
    "MA",
    "MI",
    "MN",
    "MS",
    "MO",
    "MT",
    "NE",
    "NV",
    "NH",
    "NJ",
    "NM",
    "NY",
    "NC",
    "ND",
    "OH",
    "OK",
    "OR",
    "PA",
    "RI",
    "SC",
    "SD",
    "TN",
    "TX",
    "UT",
    "VT",
    "VA",
    "WA",
    "WV",
    "WI",
    "WY"
)

# ============================================================================
# Helpers
# ============================================================================

function Reset-Directory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (Test-Path $Path) {
        Remove-Item `
            -LiteralPath $Path `
            -Recurse `
            -Force
    }

    New-Item `
        -ItemType Directory `
        -Force `
        -Path $Path |
        Out-Null
}

function Convert-ToNullableNumber {
    param(
        $Value
    )

    if ($null -eq $Value) {
        return $null
    }

    $Text =
        ([string]$Value).Trim()

    if (
        [string]::IsNullOrWhiteSpace(
            $Text
        )
    ) {
        return $null
    }

    $Number = 0.0

    $Parsed =
        [double]::TryParse(
            $Text,
            [System.Globalization.NumberStyles]::Float,
            [System.Globalization.CultureInfo]::InvariantCulture,
            [ref]$Number
        )

    if ($Parsed) {
        return $Number
    }

    return $null
}

function Assert-GazetteerColumns {
    param(
        [Parameter(Mandatory = $true)]
        $Record,

        [Parameter(Mandatory = $true)]
        [string[]]$Columns,

        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    $Available =
        @(
            $Record.PSObject.Properties.Name
        )

    foreach ($Column in $Columns) {
        if ($Available -notcontains $Column) {
            throw "$Label Gazetteer file is missing expected column '$Column'."
        }
    }
}

# ============================================================================
# Prepare directories
# ============================================================================

New-Item `
    -ItemType Directory `
    -Force `
    -Path $GeneratedDirectory |
    Out-Null

New-Item `
    -ItemType Directory `
    -Force `
    -Path $TempDirectory |
    Out-Null

Reset-Directory $StatesExtract
Reset-Directory $CountiesExtract

Write-Host ""
Write-Host "Duequity National Geography Sync"
Write-Host "================================"
Write-Host ""

# ============================================================================
# Download authoritative 2025 Census files
# ============================================================================

Write-Host "Downloading U.S. Census state geography..."

Invoke-WebRequest `
    -Uri $StatesUrl `
    -OutFile $StatesZip `
    -UseBasicParsing

Write-Host "Downloading U.S. Census county geography..."

Invoke-WebRequest `
    -Uri $CountiesUrl `
    -OutFile $CountiesZip `
    -UseBasicParsing

# ============================================================================
# Extract
# ============================================================================

Write-Host "Extracting Census geography files..."

Expand-Archive `
    -Path $StatesZip `
    -DestinationPath $StatesExtract `
    -Force

Expand-Archive `
    -Path $CountiesZip `
    -DestinationPath $CountiesExtract `
    -Force

$StateTextFile =
    Get-ChildItem `
        -Path $StatesExtract `
        -Filter "*.txt" `
        -File |
    Select-Object -First 1

$CountyTextFile =
    Get-ChildItem `
        -Path $CountiesExtract `
        -Filter "*.txt" `
        -File |
    Select-Object -First 1

if (-not $StateTextFile) {
    throw "The Census state archive did not contain a text file."
}

if (-not $CountyTextFile) {
    throw "The Census county archive did not contain a text file."
}

# ============================================================================
# Parse Census Gazetteer files
#
# 2025 Gazetteer files use the pipe character:
#
#   USPS|GEOID|GEOIDFQ|...
#
# PowerShell Import-Csv can therefore read them directly and reliably.
# ============================================================================

Write-Host "Parsing pipe-delimited Census geography..."

$RawStates =
    @(
        Import-Csv `
            -LiteralPath $StateTextFile.FullName `
            -Delimiter "|"
    )

$RawCounties =
    @(
        Import-Csv `
            -LiteralPath $CountyTextFile.FullName `
            -Delimiter "|"
    )

if ($RawStates.Count -eq 0) {
    throw "The Census state Gazetteer contained no records."
}

if ($RawCounties.Count -eq 0) {
    throw "The Census county Gazetteer contained no records."
}

Assert-GazetteerColumns `
    -Record $RawStates[0] `
    -Columns @(
        "USPS",
        "GEOID",
        "NAME",
        "INTPTLAT",
        "INTPTLONG"
    ) `
    -Label "State"

Assert-GazetteerColumns `
    -Record $RawCounties[0] `
    -Columns @(
        "USPS",
        "GEOID",
        "NAME",
        "INTPTLAT",
        "INTPTLONG"
    ) `
    -Label "County"

# ============================================================================
# Normalize county records
# ============================================================================

$CountyRecords = @()

foreach ($RawCounty in $RawCounties) {
    $PostalCode =
        ([string]$RawCounty.USPS).Trim()

    if (
        $OperationalPostalCodes -notcontains
        $PostalCode
    ) {
        continue
    }

    $GeoId =
        ([string]$RawCounty.GEOID).Trim()

    $Name =
        ([string]$RawCounty.NAME).Trim()

    if (
        [string]::IsNullOrWhiteSpace(
            $GeoId
        ) -or
        [string]::IsNullOrWhiteSpace(
            $Name
        )
    ) {
        throw "A Census county record is missing GEOID or NAME."
    }

    if ($GeoId.Length -ne 5) {
        throw "Unexpected county GEOID '$GeoId'."
    }

    $StateFips =
        $GeoId.Substring(
            0,
            2
        )

    $CountyFips =
        $GeoId.Substring(
            2,
            3
        )

    $CountyRecords +=
        [PSCustomObject][ordered]@{
            geoid =
                $GeoId

            stateFips =
                $StateFips

            countyFips =
                $CountyFips

            postalCode =
                $PostalCode

            name =
                $Name

            latitude =
                Convert-ToNullableNumber `
                    -Value $RawCounty.INTPTLAT

            longitude =
                Convert-ToNullableNumber `
                    -Value $RawCounty.INTPTLONG
        }
}

$CountyRecords =
    @(
        $CountyRecords |
        Sort-Object `
            stateFips,
            name
    )

# ============================================================================
# Normalize states and attach county equivalents
# ============================================================================

$States = @()

foreach ($RawState in $RawStates) {
    $PostalCode =
        ([string]$RawState.USPS).Trim()

    if (
        $OperationalPostalCodes -notcontains
        $PostalCode
    ) {
        continue
    }

    $StateFips =
        ([string]$RawState.GEOID).Trim()

    $StateName =
        ([string]$RawState.NAME).Trim()

    if (
        [string]::IsNullOrWhiteSpace(
            $StateFips
        ) -or
        [string]::IsNullOrWhiteSpace(
            $StateName
        )
    ) {
        throw "A Census state record is missing GEOID or NAME."
    }

    $StateCounties =
        @(
            $CountyRecords |
            Where-Object {
                $_.stateFips -eq
                $StateFips
            } |
            Sort-Object name |
            ForEach-Object {
                [ordered]@{
                    geoid =
                        $_.geoid

                    countyFips =
                        $_.countyFips

                    name =
                        $_.name

                    latitude =
                        $_.latitude

                    longitude =
                        $_.longitude
                }
            }
        )

    $States +=
        [PSCustomObject][ordered]@{
            geoid =
                $StateFips

            stateFips =
                $StateFips

            postalCode =
                $PostalCode

            name =
                $StateName

            latitude =
                Convert-ToNullableNumber `
                    -Value $RawState.INTPTLAT

            longitude =
                Convert-ToNullableNumber `
                    -Value $RawState.INTPTLONG

            countyCount =
                $StateCounties.Count

            counties =
                $StateCounties
        }
}

$States =
    @(
        $States |
        Sort-Object name
    )

# ============================================================================
# Integrity validation
# ============================================================================

if ($States.Count -ne 51) {
    throw "Expected 51 state-level jurisdictions (50 states + D.C.) but found $($States.Count)."
}

$CountyCount =
    $CountyRecords.Count

if ($CountyCount -lt 3000) {
    throw "Expected more than 3,000 counties and county equivalents but found $CountyCount."
}

$UniqueGeoIds =
    @(
        $CountyRecords |
        Select-Object `
            -ExpandProperty geoid `
            -Unique
    )

if (
    $UniqueGeoIds.Count -ne
    $CountyCount
) {
    throw "Duplicate Census county GEOIDs were detected."
}

$Maryland =
    $States |
    Where-Object {
        $_.stateFips -eq "24"
    } |
    Select-Object -First 1

if (-not $Maryland) {
    throw "Maryland FIPS 24 was not found."
}

$PrinceGeorges =
    $Maryland.counties |
    Where-Object {
        $_.geoid -eq "24033"
    } |
    Select-Object -First 1

if (-not $PrinceGeorges) {
    throw "Prince George's County GEOID 24033 was not found."
}

# ============================================================================
# Generate Duequity registry
# ============================================================================

$Registry =
    [ordered]@{
        schemaVersion = 1

        scope =
            [ordered]@{
                country =
                    "United States"

                countryCode =
                    "US"

                includes =
                    "50 states and District of Columbia"

                territoriesActivated =
                    $false
            }

        source =
            [ordered]@{
                authority =
                    "U.S. Census Bureau"

                dataset =
                    "2025 Gazetteer Files"

                format =
                    "Pipe-delimited national Gazetteer archives"

                statesUrl =
                    $StatesUrl

                countiesUrl =
                    $CountiesUrl

                geographyIdentifier =
                    "Census GEOID / state and county FIPS"
            }

        generatedAt =
            [DateTimeOffset]::UtcNow.ToString(
                "o"
            )

        totals =
            [ordered]@{
                statesAndDc =
                    $States.Count

                countyEquivalents =
                    $CountyCount
            }

        states =
            $States
    }

$Json =
    $Registry |
    ConvertTo-Json `
        -Depth 10

Set-Content `
    -LiteralPath $OutputFile `
    -Value $Json `
    -Encoding UTF8

# ============================================================================
# Result
# ============================================================================

Write-Host ""
Write-Host "National geography registry created successfully."
Write-Host ""
Write-Host "States + D.C.:       $($States.Count)"
Write-Host "County equivalents:  $CountyCount"
Write-Host ""
Write-Host "Prince George's validation:"
Write-Host "  State:              $($Maryland.name)"
Write-Host "  State FIPS:         $($Maryland.stateFips)"
Write-Host "  County:             $($PrinceGeorges.name)"
Write-Host "  County GEOID:       $($PrinceGeorges.geoid)"
Write-Host ""
Write-Host "Generated:"
Write-Host "  src\data\generated\us-geography.json"
Write-Host ""
Write-Host "Geography sync complete."
Write-Host "No legal/compliance rules were created or activated."
Write-Host ""