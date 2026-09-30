$file = "src/pages/Acertos.jsx"
$content = Get-Content $file -Raw -Encoding UTF8

$content = $content -replace "\`\*Venda Bruta:\* R\$ \$\{fmt\(settlement.grossTotal\)\}\\n\` \+", "(settlement.tipoAcerto === 'comissionado' ? ``*Venda Bruta:* R$ ${fmt(settlement.grossTotal)}\n`` : '') +"

Set-Content $file -Value $content -Encoding UTF8
