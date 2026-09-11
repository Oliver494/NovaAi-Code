param(
  [string]$Source = (Join-Path $PSScriptRoot "..\src\assets\vareliox-white.png"),
  [string]$Output = (Join-Path $PSScriptRoot "..\src-tauri\icons\vareliox-source.png")
)

Add-Type -AssemblyName System.Drawing

$sourceBitmap = [System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $Source))
try {
  $left = $sourceBitmap.Width
  $top = $sourceBitmap.Height
  $right = -1
  $bottom = -1

  for ($y = 0; $y -lt $sourceBitmap.Height; $y += 2) {
    for ($x = 0; $x -lt $sourceBitmap.Width; $x += 2) {
      if ($sourceBitmap.GetPixel($x, $y).A -gt 8) {
        if ($x -lt $left) { $left = $x }
        if ($x -gt $right) { $right = $x }
        if ($y -lt $top) { $top = $y }
        if ($y -gt $bottom) { $bottom = $y }
      }
    }
  }

  if ($right -lt $left -or $bottom -lt $top) {
    throw "The source image has no visible pixels."
  }

  $crop = [System.Drawing.Rectangle]::FromLTRB($left, $top, $right + 1, $bottom + 1)
  $canvas = New-Object System.Drawing.Bitmap 1024, 1024, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    try {
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.Clear([System.Drawing.Color]::Transparent)

      $tile = New-Object System.Drawing.Rectangle 36, 36, 952, 952
      $radius = 190
      $path = New-Object System.Drawing.Drawing2D.GraphicsPath
      try {
        $diameter = $radius * 2
        $path.AddArc($tile.Left, $tile.Top, $diameter, $diameter, 180, 90)
        $path.AddArc($tile.Right - $diameter, $tile.Top, $diameter, $diameter, 270, 90)
        $path.AddArc($tile.Right - $diameter, $tile.Bottom - $diameter, $diameter, $diameter, 0, 90)
        $path.AddArc($tile.Left, $tile.Bottom - $diameter, $diameter, $diameter, 90, 90)
        $path.CloseFigure()
        $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 17, 20, 24))
        try { $graphics.FillPath($brush, $path) } finally { $brush.Dispose() }
      } finally {
        $path.Dispose()
      }

      $maxWidth = 850.0
      $maxHeight = 760.0
      $scale = [Math]::Min($maxWidth / $crop.Width, $maxHeight / $crop.Height)
      $width = [int][Math]::Round($crop.Width * $scale)
      $height = [int][Math]::Round($crop.Height * $scale)
      $destination = New-Object System.Drawing.Rectangle ([int]((1024 - $width) / 2)), ([int]((1024 - $height) / 2)), $width, $height
      $graphics.DrawImage($sourceBitmap, $destination, $crop, [System.Drawing.GraphicsUnit]::Pixel)
    } finally {
      $graphics.Dispose()
    }

    $outputDirectory = Split-Path -Parent $Output
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
    $canvas.Save($Output, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $canvas.Dispose()
  }
} finally {
  $sourceBitmap.Dispose()
}
