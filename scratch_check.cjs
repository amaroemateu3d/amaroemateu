const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key.trim()] = val.trim().replace(/^"|"$/g, '');
  return acc;
}, {});
import('@supabase/supabase-js').then(supabase => {
  const client = supabase.createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  client.from('fichas_tecnicas').select('id, name, empresa_id').order('pk_id', {ascending: false}).limit(20).then(res => console.log(res.data));
});
