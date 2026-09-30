$file = "src/pages/Acertos.jsx"
$content = Get-Content $file -Raw

# Remove the old rawGross calculation
$content = $content -replace "(?s)if \(!resp\.ok\) throw new Error\(`"Erro ao salvar dados no Supabase\.`"\);\s*const rawGross = selectedVendas\.reduce\(\(sum, \[ftId, qtyToSettle\]\) => \{.*?\}, 0\);", "if (!resp.ok) throw new Error(`"Erro ao salvar dados no Supabase.`");"

# Add rawGross to the calculation loop
$content = $content -replace "let totalAmount = 0;", "let totalAmount = 0;`n      let rawGross = 0;"
$content = $content -replace "totalAmount \+= toAllocate \* netPrecoUnit;", "totalAmount += toAllocate * netPrecoUnit;`n              rawGross += toAllocate * parseN(item.precoUnit);"

# Fix currentTotalReceipt and Venda Bruta in the UI bar
$content = $content -replace "const currentTotalReceipt = openItems\.reduce\(\(sum, it\) => \{.*?\}, 0\) \* repasseRate;", "const currentTotalReceipt = openItems.reduce((sum, it) => {
      const qty = salesToRegister[it.indiceFt] || 0;
      return sum + (qty * parseN(it.precoUnit));
    }, 0) * repasseRate;
    
    // UI gross (only for the preview bar) is the same math
    const currentGrossPreview = openItems.reduce((sum, it) => {
      const qty = salesToRegister[it.indiceFt] || 0;
      return sum + (qty * parseN(it.precoUnit));
    }, 0);"

$content = $content -replace "<span>Venda Bruta: R\$ \{fmt\(openItems\.reduce\(\(sum, it\) => sum \+ \(\(salesToRegister\[it\.indiceFt\] \|\| 0\) \* parseN\(it\.precoUnit\)\), 0\)\)\}</span>", "<span>Venda Bruta: R$ {fmt(currentGrossPreview)}</span>"

$content = $content -replace "<span>Comissuo \(\{comissaoPct\}%\): - R\$ \{fmt\(openItems\.reduce\(\(sum, it\) => sum \+ \(\(salesToRegister\[it\.indiceFt\] \|\| 0\) \* parseN\(it\.precoUnit\)\), 0\) \* \(comissaoPct / 100\)\)\}</span>", "<span>Comissão ({comissaoPct}%): - R$ {fmt(currentGrossPreview * (comissaoPct / 100))}</span>"

Set-Content $file -Value $content -Encoding UTF8
