$ErrorActionPreference = "Stop"

# ============================================================================
# DUEQUITY OFFICIAL GOVERNMENT DOMAIN SYNC
# Westforge Holdings Inc.
#
# Purpose:
#
#   Build a trusted national registry of official U.S. .gov domains from the
#   CISA / Get.gov public domain dataset.
#
# This registry becomes a source-discovery safety boundary for Duequity's
# jurisdiction intelligence system.
#
# IMPORTANT:
#
#   - A .gov domain is a trusted government-domain candidate.
#   - A domain appearing here does NOT mean a legal rule has been verified.
#   - No jurisdiction is approved by this script.
#   - No statute, court rule, deadline, fee limit or claim procedure is inferred.
#
# Scope:
#
#   50 states + District of Columbia, matching Duequity's national geography
#   registry.
# ============================================================================

$ProjectRoot =
    "C:\Users\Roger\OneDrive\Documents\WestForge Holdings Inc\duequity"

$GeneratedDirectory =
    Join-Path $ProjectRoot "src\data\generated"

$TempDirectory =
    Join-Path $ProjectRoot ".duequity-data\government-domain-sync"

$GeographyFile =
    Join-Path $GeneratedDirectory "us-geography.json"

$DownloadedCsv =
    Join-Path $TempDirectory "current-full.csv"

$OutputFile =
    Join-Path $GeneratedDirectory "us-government-domains.json"

$SourceUrl =
    "https://raw.githubusercontent.com/cisagov/dotgov-data/main/current-full.csv"

# ============================================================================
# Helpers
# ============================================================================

function Get-Utf8TextWithoutBom {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $Text =
        [System.IO.File]::ReadAllText(
            $Path,
            [System.Text.Encoding]::UTF8
        )

    return $Text.TrimStart(
        [char]0xFEFF
    )
}

function Normalize-Domain {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Domain
    )

    $Value =
        $Domain.Trim().ToLowerInvariant()

    $Value =
        $Value -replace "^https?://", ""

    $Value =
        $Value.TrimEnd("/")

    return $Value
}

function Normalize-Text {
    param(
        $Value
    )

    if ($null -eq $Value) {
        return ""
    }

    return (
        ([string]$Value).Trim()
    )
}

function Get-PropertyValue {
    param(
        [Parameter(Mandatory = $true)]
        $Record,

        [Parameter(Mandatory = $true)]
        [string[]]$CandidateNames
    )

    foreach ($Name in $CandidateNames) {
        $Property =
            $Record.PSObject.Properties[
                $Name
            ]

        if ($null -ne $Property) {
            return Normalize-Text `
                -Value $Property.Value
        }
    }

    return ""
}

function Get-NormalizedCountyToken {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CountyName
    )

    $Value =
        $CountyName.ToLowerInvariant()

    $Value =
        $Value -replace "[’']", ""

    $Value =
        $Value -replace "\bcounty\b", ""

    $Value =
        $Value -replace "\bparish\b", ""

    $Value =
        $Value -replace "\bborough\b", ""

    $Value =
        $Value -replace "\bcensus area\b", ""

    $Value =
        $Value -replace "\bmunicipality\b", ""

    $Value =
        $Value -replace "\bcity and borough\b", ""

    $Value =
        $Value -replace "\bmunicipio\b", ""

    $Value =
        $Value -replace "[^a-z0-9]", ""

    return $Value
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

Write-Host ""
Write-Host "Duequity Official Government Domain Sync"
Write-Host "========================================="
Write-Host ""

# ============================================================================
# Load national geography registry
# ============================================================================

if (-not (Test-Path $GeographyFile)) {
    throw "National geography registry is missing. Run scripts/sync-us-geography.ps1 first."
}

Write-Host "Loading Duequity national geography registry..."

$GeographyRaw =
    Get-Utf8TextWithoutBom `
        -Path $GeographyFile

try {
    $Geography =
        $GeographyRaw |
        ConvertFrom-Json
}
catch {
    throw "Duequity national geography registry contains invalid JSON."
}

if (
    $null -eq $Geography.states -or
    $Geography.states.Count -ne 51
) {
    throw "Expected 51 state-level geography records."
}

$OperationalStateCodes =
    @(
        $Geography.states |
        ForEach-Object {
            ([string]$_.postalCode).Trim().ToUpperInvariant()
        }
    )

$StateByCode = @{}

foreach ($State in $Geography.states) {
    $StateCode =
        ([string]$State.postalCode).Trim().ToUpperInvariant()

    $StateByCode[
        $StateCode
    ] = $State
}

# ============================================================================
# Download official CISA / Get.gov domain data
# ============================================================================

Write-Host "Downloading official .gov domain registry..."

Invoke-WebRequest `
    -Uri $SourceUrl `
    -OutFile $DownloadedCsv `
    -UseBasicParsing

if (-not (Test-Path $DownloadedCsv)) {
    throw "The official government domain CSV was not downloaded."
}

$DownloadedLength =
    (
        Get-Item $DownloadedCsv
    ).Length

if ($DownloadedLength -lt 100000) {
    throw "The downloaded government-domain dataset is unexpectedly small."
}

# ============================================================================
# Parse CISA CSV
# ============================================================================

Write-Host "Parsing government domains..."

$DomainRecords =
    @(
        Import-Csv `
            -LiteralPath $DownloadedCsv
    )

if ($DomainRecords.Count -lt 10000) {
    throw "Expected more than 10,000 registered .gov domain records but found $($DomainRecords.Count)."
}

# ============================================================================
# Normalize records
# ============================================================================

$NormalizedDomains = @()

foreach ($Record in $DomainRecords) {
    $Domain =
        Get-PropertyValue `
            -Record $Record `
            -CandidateNames @(
                "Domain name",
                "Domain Name",
                "domain"
            )

    if (
        [string]::IsNullOrWhiteSpace(
            $Domain
        )
    ) {
        continue
    }

    $Domain =
        Normalize-Domain `
            -Domain $Domain

    if (
        -not $Domain.EndsWith(
            ".gov",
            [System.StringComparison]::OrdinalIgnoreCase
        )
    ) {
        continue
    }

    $DomainType =
        Get-PropertyValue `
            -Record $Record `
            -CandidateNames @(
                "Domain type",
                "Domain Type"
            )

    $OrganizationName =
        Get-PropertyValue `
            -Record $Record `
            -CandidateNames @(
                "Organization name",
                "Organization Name",
                "Agency"
            )

    $SuborganizationName =
        Get-PropertyValue `
            -Record $Record `
            -CandidateNames @(
                "Suborganization name",
                "Suborganization Name"
            )

    $City =
        Get-PropertyValue `
            -Record $Record `
            -CandidateNames @(
                "City"
            )

    $StateCode =
        (
            Get-PropertyValue `
                -Record $Record `
                -CandidateNames @(
                    "State"
                )
        ).ToUpperInvariant()

    if (
        [string]::IsNullOrWhiteSpace(
            $StateCode
        )
    ) {
        continue
    }

    if (
        $OperationalStateCodes -notcontains
        $StateCode
    ) {
        continue
    }

    $State =
        $StateByCode[
            $StateCode
        ]

    $DomainTypeLower =
        $DomainType.ToLowerInvariant()

    $OrganizationSearchText =
        (
            "$OrganizationName $SuborganizationName"
        ).ToLowerInvariant()

    $CountyCandidates = @()

    foreach ($County in $State.counties) {
        $CountyToken =
            Get-NormalizedCountyToken `
                -CountyName ([string]$County.name)

        if (
            [string]::IsNullOrWhiteSpace(
                $CountyToken
            )
        ) {
            continue
        }

        $OrganizationToken =
            $OrganizationSearchText `
                -replace "[’']", ""

        $OrganizationToken =
            $OrganizationToken `
                -replace "[^a-z0-9]", ""

        if (
            $OrganizationToken.Contains(
                $CountyToken
            )
        ) {
            $CountyCandidates +=
                [ordered]@{
                    geoid =
                        [string]$County.geoid

                    name =
                        [string]$County.name
                }
        }
    }

    $LikelyCountyDomain =
        $DomainTypeLower.Contains(
            "county"
        ) -or
        $CountyCandidates.Count -gt 0

    $NormalizedDomains +=
        [PSCustomObject][ordered]@{
            domain =
                $Domain

            baseUrl =
                "https://$Domain"

            domainType =
                $DomainType

            organizationName =
                $OrganizationName

            suborganizationName =
                $SuborganizationName

            city =
                $City

            state =
                $StateCode

            stateFips =
                [string]$State.stateFips

            likelyCountyDomain =
                $LikelyCountyDomain

            countyCandidates =
                $CountyCandidates
        }
}

# ============================================================================
# Deduplicate
# ============================================================================

$NormalizedDomains =
    @(
        $NormalizedDomains |
        Sort-Object domain -Unique
    )

if ($NormalizedDomains.Count -lt 5000) {
    throw "Too few operational-state .gov domains remained after normalization: $($NormalizedDomains.Count)."
}

# ============================================================================
# Build state index
# ============================================================================

$States = @()

foreach (
    $State in
    (
        $Geography.states |
        Sort-Object name
    )
) {
    $StateCode =
        ([string]$State.postalCode).Trim().ToUpperInvariant()

    $StateDomains =
        @(
            $NormalizedDomains |
            Where-Object {
                $_.state -eq
                $StateCode
            }
        )

    $CountyDomainCount =
        @(
            $StateDomains |
            Where-Object {
                $_.likelyCountyDomain
            }
        ).Count

    $States +=
        [ordered]@{
            state =
                $StateCode

            stateName =
                [string]$State.name

            stateFips =
                [string]$State.stateFips

            domainCount =
                $StateDomains.Count

            likelyCountyDomainCount =
                $CountyDomainCount

            domains =
                $StateDomains
        }
}

# ============================================================================
# Maryland / Prince George's validation
# ============================================================================

$Maryland =
    $States |
    Where-Object {
        $_.state -eq "MD"
    } |
    Select-Object -First 1

if (-not $Maryland) {
    throw "Maryland was not found in the official government-domain registry."
}

$PrinceGeorgesCandidates =
    @(
        $Maryland.domains |
        Where-Object {
            $_.countyCandidates |
            Where-Object {
                $_.geoid -eq
                "24033"
            }
        }
    )

# ============================================================================
# Generate output
# ============================================================================

$Registry =
    [ordered]@{
        schemaVersion =
            1

        purpose =
            "Trusted official .gov domain discovery registry for Duequity jurisdiction intelligence"

        source =
            [ordered]@{
                authority =
                    "Cybersecurity and Infrastructure Security Agency / Get.gov"

                dataset =
                    "Official list of registered .gov domains"

                sourceUrl =
                    $SourceUrl

                retrievedAt =
                    [DateTimeOffset]::UtcNow.ToString(
                        "o"
                    )
            }

        scope =
            [ordered]@{
                country =
                    "United States"

                includes =
                    "50 states and District of Columbia"

                geographyRegistry =
                    "src/data/generated/us-geography.json"

                legalAuthorityVerified =
                    $false
            }

        totals =
            [ordered]@{
                sourceRecords =
                    $DomainRecords.Count

                operationalGovDomains =
                    $NormalizedDomains.Count

                stateRecords =
                    $States.Count
            }

        states =
            $States
    }

$Json =
    $Registry |
    ConvertTo-Json `
        -Depth 12

# Write UTF-8 without BOM so Node JSON.parse can consume the file directly.

$Utf8WithoutBom =
    New-Object `
        System.Text.UTF8Encoding(
            $false
        )

[System.IO.File]::WriteAllText(
    $OutputFile,
    $Json,
    $Utf8WithoutBom
)

# ============================================================================
# Result
# ============================================================================

Write-Host ""
Write-Host "Official government-domain registry created successfully."
Write-Host ""
Write-Host "CISA source records:       $($DomainRecords.Count)"
Write-Host "Operational .gov domains:  $($NormalizedDomains.Count)"
Write-Host "State records:             $($States.Count)"
Write-Host ""
Write-Host "Prince George's candidate .gov domains:"
Write-Host ""

if (
    $PrinceGeorgesCandidates.Count -eq 0
) {
    Write-Host "  No direct county-domain candidate was found."
    Write-Host "  This is allowed. Other official state/court sources will be discovered separately."
}
else {
    foreach (
        $Candidate in
        $PrinceGeorgesCandidates
    ) {
        Write-Host "  $($Candidate.domain) - $($Candidate.organizationName)"
    }
}

Write-Host ""
Write-Host "Generated:"
Write-Host "  src\data\generated\us-government-domains.json"
Write-Host ""
Write-Host "IMPORTANT:"
Write-Host "  These are trusted government-domain candidates."
Write-Host "  No legal rule has been inferred, approved or activated."
Write-Host ""