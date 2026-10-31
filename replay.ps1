# 发送测试事件到本地 webhook，以验证 ops review 的匹配逻辑与签到流程。
param(
    [string]$Url = "http://localhost:3000/webhooks/dialpad",
    [string]$Secret = "take-home-secret"
)

# 这里使用的是题目中的典型样例事件，覆盖正常 match、内部号码、重复更新和无 open case 等情况。
$events = @(
    @{ call_id = "7002"; state = "ringing"; direction = "inbound"; external_number = "(210) 555-0177"; internal_number = "+14155550100"; date_started = 1791209740000; date_ended = $null; duration = $null; recording_url = $null },
    @{ call_id = "7003"; state = "ringing"; direction = "inbound"; external_number = "2105550178"; internal_number = "+14155550101"; date_started = 1791214265000; date_ended = $null; duration = $null; recording_url = $null },
    @{ call_id = "7001"; state = "hangup"; direction = "inbound"; external_number = "+15125550142"; internal_number = "+14155550100"; date_started = 1791208931000; date_ended = 1791209243000; duration = 312; recording_url = "https://recordings.example.com/7001.mp3" },
    @{ call_id = "7005"; state = "hangup"; direction = "inbound"; external_number = "+14155550101"; internal_number = "+14155550100"; date_started = 1791219810000; date_ended = 1791219850000; duration = 40; recording_url = $null },
    @{ call_id = "7004"; state = "hangup"; direction = "outbound"; external_number = "+1 619-555-0123"; internal_number = "+14155550100"; date_started = 1791217200000; date_ended = 1791217261000; duration = 61; recording_url = $null },
    @{ call_id = "7006"; state = "hangup"; direction = "inbound"; external_number = "+13055550166"; internal_number = "+14155550100"; date_started = 1791226082000; date_ended = 1791226216000; duration = 134; recording_url = $null },
    @{ call_id = "7007"; state = "hangup"; direction = "inbound"; external_number = "+13055550190"; internal_number = "+14155550100"; date_started = 1791226364000; date_ended = 1791226367000; duration = 3; recording_url = $null },
    @{ call_id = "7008"; state = "hangup"; direction = "inbound"; external_number = "+18305550111"; internal_number = "+14155550100"; date_started = 1791227109000; date_ended = 1791227529000; duration = 420; recording_url = $null },
    @{ call_id = "7009"; state = "ringing"; direction = "inbound"; external_number = "+17375550199"; internal_number = "+14155550100"; date_started = 1791261677000; date_ended = $null; duration = $null; recording_url = $null },
    @{ call_id = "7010"; state = "voicemail"; direction = "inbound"; external_number = "+15125550142"; internal_number = "+14155550100"; date_started = 1791235800000; date_ended = 1791235822000; duration = 22; recording_url = $null },
    @{ call_id = "7011"; state = "hangup"; direction = "inbound"; external_number = "+16195550123"; internal_number = "+14155550100"; date_started = 1791231000000; date_ended = 1791231075000; duration = 75; recording_url = $null }
)

foreach ($event in $events) {
    $body = $event | ConvertTo-Json -Compress
    $payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $hmac = [System.Security.Cryptography.HMACSHA256]::new([System.Text.Encoding]::UTF8.GetBytes($Secret))
    $digest = $hmac.ComputeHash($payloadBytes)
    $signature = "sha256=" + ([BitConverter]::ToString($digest) -replace '-', '').ToLower()

    Write-Host "Sending event: $($event.call_id)"

    try {
        $response = Invoke-RestMethod -Uri $Url -Method Post -Headers @{ "x-signature" = $signature } -ContentType "application/json" -Body $body -ErrorAction Stop
        $response | ConvertTo-Json -Depth 10
    }
    catch {
        Write-Error "Request failed for $($event.call_id): $($_.Exception.Message)"
    }

    Write-Host "---"
}
