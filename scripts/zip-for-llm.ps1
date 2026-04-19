param(
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Path $MyInvocation.MyCommand.Path -Parent
$repoRoot = Split-Path -Path $scriptRoot -Parent
$repoName = Split-Path -Path $repoRoot -Leaf

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = "$repoName-llm.zip"
}

if (-not [System.IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath = Join-Path $repoRoot $OutputPath
}

$resolvedOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Path $resolvedOutputPath -Parent
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

function Get-ArchivePatterns {
    param(
        [string]$RepositoryRoot
    )

    $patterns = New-Object System.Collections.Generic.List[string]
    $gitIgnorePath = Join-Path $RepositoryRoot '.gitignore'

    if (Test-Path -LiteralPath $gitIgnorePath) {
        foreach ($line in Get-Content -LiteralPath $gitIgnorePath) {
            $trimmed = $line.Trim()
            if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith('#')) {
                continue
            }

            $patterns.Add($trimmed)
        }
    }

    foreach ($pattern in @(
        '.git/',
        '.turbo/',
        '.cache/',
        '.parcel-cache/',
        '.pnpm-store/',
        '.yarn/cache/',
        'build/',
        'coverage/',
        'out/',
        'target/',
        '*.zip',
        '*.tar',
        '*.tar.gz',
        '*.tgz',
        '*.7z',
        '*.rar',
        '*.gz',
        '*.bz2',
        '*.xz',
        '*.exe',
        '*.dll',
        '*.so',
        '*.dylib',
        '*.class',
        '*.jar',
        '*.war',
        '*.o',
        '*.a',
        '*.obj',
        '*.pdb',
        '*.pyc'
    )) {
        $patterns.Add($pattern)
    }

    return $patterns
}

function Test-PatternMatch {
    param(
        [string]$RelativePath,
        [string]$Pattern
    )

    $normalizedPath = $RelativePath.Replace('\', '/').TrimStart('./')
    $patternText = $Pattern
    $directoryOnly = $false

    if ($patternText.StartsWith('!')) {
        $patternText = $patternText.Substring(1)
    }

    if ($patternText.EndsWith('/')) {
        $directoryOnly = $true
        $patternText = $patternText.TrimEnd('/')
    }

    if ([string]::IsNullOrWhiteSpace($patternText)) {
        return $false
    }

    if ($directoryOnly) {
        return $normalizedPath -eq $patternText -or
            $normalizedPath -like "$patternText/*" -or
            $normalizedPath -like "*/$patternText/*"
    }

    if ($patternText.Contains('/')) {
        return $normalizedPath -like $patternText -or
            $normalizedPath -like "*/$patternText"
    }

    $basename = [System.IO.Path]::GetFileName($normalizedPath)
    if ($patternText.Contains('*') -or $patternText.Contains('?') -or $patternText.Contains('[')) {
        return $basename -like $patternText
    }

    return $basename -eq $patternText -or
        $normalizedPath -eq $patternText -or
        $normalizedPath -like "*/$patternText"
}

function Test-ShouldIgnore {
    param(
        [string]$RelativePath,
        [System.Collections.Generic.List[string]]$Patterns
    )

    $ignored = $false

    foreach ($rawPattern in $Patterns) {
        $isIncludeRule = $rawPattern.StartsWith('!')
        if (Test-PatternMatch -RelativePath $RelativePath -Pattern $rawPattern) {
            $ignored = -not $isIncludeRule
        }
    }

    return $ignored
}

function Get-RelativePathCompat {
    param(
        [string]$BasePath,
        [string]$TargetPath
    )

    $baseFullPath = [System.IO.Path]::GetFullPath($BasePath)
    if (-not $baseFullPath.EndsWith([System.IO.Path]::DirectorySeparatorChar) -and
        -not $baseFullPath.EndsWith([System.IO.Path]::AltDirectorySeparatorChar)) {
        $baseFullPath += [System.IO.Path]::DirectorySeparatorChar
    }

    $targetFullPath = [System.IO.Path]::GetFullPath($TargetPath)

    $baseUri = New-Object System.Uri($baseFullPath)
    $targetUri = New-Object System.Uri($targetFullPath)
    $relativeUri = $baseUri.MakeRelativeUri($targetUri)

    return [System.Uri]::UnescapeDataString($relativeUri.ToString()).Replace('\', '/')
}

$patterns = Get-ArchivePatterns -RepositoryRoot $repoRoot
$candidateFiles = New-Object System.Collections.Generic.List[string]

try {
    git -C $repoRoot rev-parse --is-inside-work-tree *> $null
    $isGitWorkTree = $LASTEXITCODE -eq 0
} catch {
    $isGitWorkTree = $false
}

if ($isGitWorkTree) {
    foreach ($path in (git -C $repoRoot ls-files --cached --others --exclude-standard)) {
        if (-not [string]::IsNullOrWhiteSpace($path)) {
            $candidateFiles.Add($path.Replace('\', '/'))
        }
    }
} else {
    foreach ($file in Get-ChildItem -Path $repoRoot -File -Recurse) {
        $relativePath = Get-RelativePathCompat -BasePath $repoRoot -TargetPath $file.FullName
        $candidateFiles.Add($relativePath)
    }
}

$selectedFiles = New-Object System.Collections.Generic.List[string]

foreach ($relativePath in $candidateFiles) {
    if ([string]::IsNullOrWhiteSpace($relativePath)) {
        continue
    }

    $normalizedPath = $relativePath.Replace('\', '/')
    $fullPath = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $normalizedPath))
    if ($fullPath -eq $resolvedOutputPath) {
        continue
    }

    if (Test-ShouldIgnore -RelativePath $normalizedPath -Patterns $patterns) {
        continue
    }

    $selectedFiles.Add($normalizedPath)
}

if ($selectedFiles.Count -eq 0) {
    throw 'No files matched the archive rules.'
}

if (Test-Path -LiteralPath $resolvedOutputPath) {
    Remove-Item -LiteralPath $resolvedOutputPath -Force
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$archive = [System.IO.Compression.ZipFile]::Open(
    $resolvedOutputPath,
    [System.IO.Compression.ZipArchiveMode]::Create
)

try {
    foreach ($relativePath in $selectedFiles) {
        $sourcePath = Join-Path $repoRoot ($relativePath -replace '/', '\')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,
            $sourcePath,
            $relativePath,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
} finally {
    $archive.Dispose()
}

Write-Host "Created $resolvedOutputPath with $($selectedFiles.Count) files."
