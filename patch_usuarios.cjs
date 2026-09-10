const fs = require('fs');
const path = './src/pages/Usuarios.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add missing imports
content = content.replace(
  /BarChart3, Check, X, Building2, Plus, Lock\n  } from 'lucide-react';/,
  `BarChart3, Check, X, Building2, Plus, Lock,\n    Search, Package, Wallet, FileText, Truck, ShieldAlert\n  } from 'lucide-react';`
);

// 2. Add missing PAGES
content = content.replace(
  /\{ id: 'saidas',          label: 'Saídas e Despesas',  icon: <TrendingDown size=\{16\} \/> \},/,
  `{ id: 'saidas',          label: 'Saídas e Despesas',  icon: <TrendingDown size={16} /> },
  { id: 'financas-pessoais', label: 'Finanças Pessoais',  icon: <Wallet size={16} /> },
  { id: 'pesquisa-ecommerce', label: 'Pesquisa Concorrência', icon: <Search size={16} /> },
  { id: 'orcamentos',      label: 'Orçamentos Rápidos', icon: <FileText size={16} /> },
  { id: 'estoque',         label: 'Estoque / Insumos',  icon: <Package size={16} /> },
  { id: 'consignados',     label: 'Consignados',        icon: <Truck size={16} /> },`
);

// 3. Add handleToggleAdmin function
const handleToggleAdminStr = `
  async function handleToggleAdmin(userId, currentValue) {
    if (!window.confirm(currentValue ? "Remover privilégios de administrador deste usuário?" : "Tornar este usuário um administrador com acesso total?")) return;
    const newValue = !currentValue;
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ is_admin: newValue })
        .eq('id', userId);

      if (error) throw error;
      
      setProfiles(prev => {
        const next = { ...prev };
        if (next[userId]) {
          next[userId] = { ...next[userId], is_admin: newValue };
        }
        return next;
      });
    } catch (err) {
      console.error(err);
      alert('Erro ao alterar privilégios: ' + err.message);
    }
  }
`;
content = content.replace(
  /async function handleToggleAcertos\(userId, currentValue\) \{/,
  handleToggleAdminStr + '\n  async function handleToggleAcertos(userId, currentValue) {'
);

// 4. Update Modal to show Admin toggle
const modalHeaderRegex = /\{\!profiles\[selectedUser\.id\]\?\.is_admin && \(\s*<label style=\{\{ display: 'flex'[\s\S]*?<\/label>\s*\)\}/;
const newModalHeader = `
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'var(--bg-secondary)', padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
                        <input
                          type="checkbox"
                          checked={profiles[selectedUser.id]?.is_admin || false}
                          onChange={() => handleToggleAdmin(selectedUser.id, profiles[selectedUser.id]?.is_admin)}
                        />
                        <strong style={{ color: 'var(--danger)' }}>Administrador (Acesso Total)</strong>
                      </label>
                      
                      {!profiles[selectedUser.id]?.is_admin && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'var(--bg-secondary)', padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
                          <input
                            type="checkbox"
                            checked={profiles[selectedUser.id]?.is_acertos || false}
                            onChange={() => handleToggleAcertos(selectedUser.id, profiles[selectedUser.id]?.is_acertos)}
                          />
                          <strong style={{ color: 'var(--accent-primary)' }}>Acesso Restrito a Acertos</strong>
                        </label>
                      )}
                    </div>
`;
content = content.replace(modalHeaderRegex, newModalHeader);

// 5. Add visual warning when Admin User checkboxes are disabled
const permissionsTableRegex = /<table className="permissions-table">[\s\S]*?<\/table>/;
let permissionsTableMatch = content.match(permissionsTableRegex);

if (permissionsTableMatch) {
  let tableStr = permissionsTableMatch[0];
  tableStr = tableStr.replace(
    /<tbody>/,
    `<tbody>
                    {profiles[selectedUser.id]?.is_admin && (
                      <tr>
                        <td colSpan="3">
                          <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', marginBottom: '8px' }}>
                            <ShieldAlert size={18} />
                            Este usuário é Administrador e possui acesso total. Desmarque a opção "Administrador" acima para personalizar permissões.
                          </div>
                        </td>
                      </tr>
                    )}`
  );
  content = content.replace(permissionsTableRegex, tableStr);
}

fs.writeFileSync(path, content, 'utf8');
console.log('Usuarios.jsx patched successfully');
