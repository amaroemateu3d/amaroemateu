const fs = require('fs');
let c = fs.readFileSync('src/pages/Pedidos.jsx', 'utf8');

const regex = /<td className="cost-cell">\{formatTime\(tempoUnit\)\}<\/td>\s*<td>\s*<input\s*type="number"\s*className="cell-input"\s*value=\{it\.precoUnit\}\s*onChange=\{e => updateItem\(originalIdx, 'precoUnit', e\.target\.value\)\}\s*\/>\s*<\/td>/;

const replacement = `<td className="cost-cell">{formatTime(tempoUnit)}</td>
                              <td>
                                <input
                                  type="number"
                                  className="cell-input"
                                  style={{ width: "60px", textAlign: "center" }}
                                  value={it.margemRaw ?? (custoBase > 0 ? (preco / custoBase).toFixed(2) : "0.00")}
                                  onChange={e => {
                                    const raw = e.target.value;
                                    const m = parseFloat(raw) || 0;
                                    setItens(prev => {
                                      const next = [...prev];
                                      next[originalIdx] = { ...next[originalIdx], precoUnit: (custoBase * m).toFixed(2), margemRaw: raw };
                                      return next;
                                    });
                                  }}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className="cell-input"
                                  value={it.precoUnit}
                                  onChange={e => {
                                    setItens(prev => {
                                      const next = [...prev];
                                      next[originalIdx] = { ...next[originalIdx], precoUnit: e.target.value, margemRaw: undefined };
                                      return next;
                                    });
                                  }}
                                />
                              </td>`;

c = c.replace(regex, replacement);
fs.writeFileSync('src/pages/Pedidos.jsx', c);
console.log("Patch applied!");
