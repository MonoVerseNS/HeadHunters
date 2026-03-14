# HeadHunters Remote Deploy (PowerShell)
param([string]$password)

if (!$password) { 
    Write-Host "Usage: .\deploy_remote.ps1 <password>"; 
    exit 1 
}

$host = "95.182.97.163"
$user = "
