import { supabase } from '../supabaseClient';
import { mlProxyFetch, getValidMlToken } from './mercadolivre';

export const DEFAULT_LOJA_CATEGORIAS = [
  'Chaveiros',
  'Religiosos',
  'Natal',
  'Articulados',
  'Sensoriais',
  'Decoração',
  'Kits',
];

export function slugifyCategoria(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ============================================================================
// CATEGORIAS DA LOJA (public.loja_categorias)
// ============================================================================

export async function fetchLojaCategorias() {
  const { data, error } = await supabase
    .from('loja_categorias')
    .select('*')
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createLojaCategoria({ empresaId, nome, ordem = 0 }) {
  const cleanName = String(nome || '').trim();
  if (!cleanName) throw new Error('Informe o nome da categoria.');
  const slug = slugifyCategoria(cleanName);
  if (!slug) throw new Error('Nome de categoria inválido.');

  const { data, error } = await supabase
    .from('loja_categorias')
    .upsert(
      {
        empresa_id: empresaId,
        nome: cleanName,
        slug,
        ordem,
        ativo: true,
      },
      { onConflict: 'empresa_id,slug' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function seedDefaultLojaCategorias(empresaId) {
  if (!empresaId) throw new Error('Empresa não identificada.');
  const rows = DEFAULT_LOJA_CATEGORIAS.map((nome, idx) => ({
    empresa_id: empresaId,
    nome,
    slug: slugifyCategoria(nome),
    ordem: idx + 1,
    ativo: true,
  }));

  const { data, error } = await supabase
    .from('loja_categorias')
    .upsert(rows, { onConflict: 'empresa_id,slug' })
    .select();

  if (error) throw error;
  return data || [];
}

export async function toggleLojaCategoriaAtivo(id, ativo) {
  const { error } = await supabase
    .from('loja_categorias')
    .update({ ativo: Boolean(ativo) })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteLojaCategoria(id) {
  const { error } = await supabase
    .from('loja_categorias')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ============================================================================
// UPLOAD DE FOTOS (Storage bucket: produtos)
// ============================================================================

export async function uploadLojaPhotoFile(file, empresaId, ftId) {
  if (!file) throw new Error('Arquivo inválido.');
  if (!empresaId) throw new Error('Empresa não identificada.');

  const safeFt = String(ftId || 'ft').replace(/[^a-zA-Z0-9_-]/g, '_');
  const rawExt = (file.name && file.name.split('.').pop()) || 'jpg';
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const filePath = `${empresaId}/${safeFt}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('produtos')
    .upload(filePath, file, {
      upsert: true,
      contentType: file.type || 'image/jpeg',
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('produtos').getPublicUrl(filePath);
  return data.publicUrl;
}

async function mirrorExternalImageToStorage(imageUrl, empresaId, ftId, idx = 0) {
  const httpsUrl = String(imageUrl || '').replace(/^http:\/\//i, 'https://');
  if (!httpsUrl) return null;

  try {
    const resp = await fetch(httpsUrl);
    if (!resp.ok) return httpsUrl;
    const blob = await resp.blob();
    const contentType = blob.type || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const safeFt = String(ftId || 'ft').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `${empresaId}/${safeFt}/ml_${Date.now()}_${idx}.${ext}`;

    const { error } = await supabase.storage
      .from('produtos')
      .upload(filePath, blob, { upsert: true, contentType });

    if (error) return httpsUrl;

    const { data } = supabase.storage.from('produtos').getPublicUrl(filePath);
    return data.publicUrl;
  } catch {
    // Fallback para URL HTTPS caso CORS bloqueie download no browser
    return httpsUrl;
  }
}

// ============================================================================
// IMPORTAÇÃO DO MERCADO LIVRE (Fotos, Descrição, Medidas e Peso)
// ============================================================================

function parseMlDimensionsAndWeight(itemData) {
  let medidaComCaixa = '';
  let pesoComCaixa = '';

  // 1. shipping.dimensions no ML costuma vir como "AxLxC,peso" (ex: "10x15x20,300")
  const shipDim = itemData?.shipping?.dimensions;
  if (typeof shipDim === 'string' && shipDim.trim()) {
    const [dimsPart, weightPart] = shipDim.split(',');
    if (dimsPart && dimsPart.includes('x')) {
      medidaComCaixa = `${dimsPart.trim()} cm`;
    }
    if (weightPart && !isNaN(Number(weightPart))) {
      pesoComCaixa = String(Math.round(Number(weightPart)));
    }
  }

  // 2. Fallback via attributes do item (PACKAGE_HEIGHT, PACKAGE_WIDTH, PACKAGE_LENGTH, PACKAGE_WEIGHT)
  const attrs = Array.isArray(itemData?.attributes) ? itemData.attributes : [];
  const getAttrNum = (ids) => {
    for (const id of ids) {
      const found = attrs.find((a) => a.id === id);
      if (found) {
        const val = found.value_struct?.number ?? parseFloat(String(found.value_name || '').replace(',', '.'));
        const unit = String(found.value_struct?.unit || found.value_name || '').toLowerCase();
        if (!isNaN(val) && val > 0) return { val, unit };
      }
    }
    return null;
  };

  if (!medidaComCaixa) {
    const h = getAttrNum(['PACKAGE_HEIGHT', 'HEIGHT']);
    const w = getAttrNum(['PACKAGE_WIDTH', 'WIDTH']);
    const l = getAttrNum(['PACKAGE_LENGTH', 'LENGTH']);
    if (h && w && l) {
      const toCm = (obj) => (obj.unit.includes('mm') ? obj.val / 10 : obj.unit.includes('m') && !obj.unit.includes('cm') ? obj.val * 100 : obj.val);
      medidaComCaixa = `${Math.round(toCm(h))}x${Math.round(toCm(w))}x${Math.round(toCm(l))} cm`;
    }
  }

  if (!pesoComCaixa) {
    const wt = getAttrNum(['PACKAGE_WEIGHT', 'WEIGHT']);
    if (wt) {
      const grams = wt.unit.includes('kg') ? wt.val * 1000 : wt.val;
      pesoComCaixa = String(Math.round(grams));
    }
  }

  return { medidaComCaixa, pesoComCaixa };
}

export function findMlListingsForFt(mlListings = [], ftId) {
  if (!ftId) return [];
  return mlListings.filter((l) => {
    if (l.ft_id === ftId || String(l.ft_id || '').startsWith(`${ftId}__var__`)) return true;
    if (Array.isArray(l.variations)) {
      return l.variations.some((v) => v.ft_id === ftId || String(v.ft_id || '').startsWith(`${ftId}__var__`));
    }
    return false;
  });
}

export async function importMlDataForFt({ mlItemId, ftId, empresaId, copyPhotosToStorage = true }) {
  if (!mlItemId) throw new Error('Informe o ID do anúncio do Mercado Livre.');

  const token = await getValidMlToken(empresaId);
  if (!token?.access_token) {
    throw new Error('Mercado Livre não está conectado. Conecte na aba Estoque → Anúncios Mercado Livre.');
  }

  const headers = { Authorization: `Bearer ${token.access_token}` };

  const itemData = await mlProxyFetch(`/items/${encodeURIComponent(mlItemId)}?include_attributes=all`, { headers });

  let descriptionText = '';
  try {
    const descData = await mlProxyFetch(`/items/${encodeURIComponent(mlItemId)}/description`, { headers });
    descriptionText = descData?.plain_text || descData?.text || '';
  } catch {
    // Alguns anúncios antigos não possuem descrição
  }

  const allPics = Array.isArray(itemData?.pictures) ? itemData.pictures : [];
  const rawPics = allPics.slice(0, 8);
  const picUrls = rawPics.map((p) => p.secure_url || p.url).filter(Boolean);

  let fotosLoja = picUrls.map((u) => u.replace(/^http:\/\//i, 'https://'));
  const picIdToFinalUrl = new Map();
  if (copyPhotosToStorage && empresaId && picUrls.length > 0) {
    const uploaded = await Promise.all(
      picUrls.map((u, idx) => mirrorExternalImageToStorage(u, empresaId, ftId, idx))
    );
    rawPics.forEach((p, idx) => {
      if (p?.id && uploaded[idx]) picIdToFinalUrl.set(p.id, uploaded[idx]);
    });
    fotosLoja = uploaded.filter(Boolean);
  } else {
    rawPics.forEach((p, idx) => {
      if (p?.id && fotosLoja[idx]) picIdToFinalUrl.set(p.id, fotosLoja[idx]);
    });
  }

  // Extrai variações do anúncio do Mercado Livre (com foto, nome e SKU)
  const rawVars = Array.isArray(itemData?.variations) ? itemData.variations : [];
  const variacoesLoja = await Promise.all(
    rawVars.map(async (v, vIdx) => {
      const combos = Array.isArray(v?.attribute_combinations) ? v.attribute_combinations : [];
      const nome =
        combos
          .map((c) => c?.value_name || c?.name)
          .filter(Boolean)
          .join(' / ') || `Variação ${vIdx + 1}`;

      const sellerSkuAttr = Array.isArray(v?.attributes)
        ? v.attributes.find((a) => a?.id === 'SELLER_SKU')
        : null;
      const sku = String(v?.seller_custom_field || sellerSkuAttr?.value_name || '').trim();

      let foto = '';
      const firstPicId = Array.isArray(v?.picture_ids) ? v.picture_ids[0] : null;
      if (firstPicId) {
        if (picIdToFinalUrl.has(firstPicId)) {
          foto = picIdToFinalUrl.get(firstPicId);
        } else {
          const matchedPic = allPics.find((p) => p?.id === firstPicId);
          const rawUrl = (matchedPic?.secure_url || matchedPic?.url || '').replace(/^http:\/\//i, 'https://');
          if (rawUrl) {
            if (copyPhotosToStorage && empresaId) {
              foto = (await mirrorExternalImageToStorage(rawUrl, empresaId, ftId, `var_${v.id || vIdx}`)) || rawUrl;
            } else {
              foto = rawUrl;
            }
            picIdToFinalUrl.set(firstPicId, foto);
          }
        }
      }

      return {
        id: String(v?.id || `mlvar_${vIdx}_${Date.now()}`),
        mlVariationId: v?.id ? String(v.id) : '',
        nome,
        sku,
        foto,
        estoque: Number(v?.available_quantity ?? 0),
        ativo: true,
        variacaoEstoqueId: '',
      };
    })
  );

  const { medidaComCaixa, pesoComCaixa } = parseMlDimensionsAndWeight(itemData);

  return {
    mlItemId,
    tituloLoja: itemData?.title || '',
    descricaoLoja: descriptionText.trim(),
    fotosLoja,
    variacoesLoja,
    medidaComCaixa,
    pesoComCaixa,
  };
}

/**
 * Busca fotos de alta resolução no Mercado Livre para cada variação cadastrada,
 * cruzando pelo nome da variação com os anúncios vinculados (ou variações internas do ML),
 * e espelha cada foto para o bucket 'produtos' no Supabase Storage.
 */
export async function fetchVariationPhotosFromMl({ ftId, empresaId, variacoes = [], mlLinkedListings = [] }) {
  if (!Array.isArray(variacoes) || variacoes.length === 0) return { updated: [], matchedCount: 0 };
  if (!Array.isArray(mlLinkedListings) || mlLinkedListings.length === 0) return { updated: variacoes, matchedCount: 0 };

  const normalize = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  const token = await getValidMlToken(empresaId);
  if (!token?.access_token) {
    throw new Error('Mercado Livre não está conectado. Conecte na aba Estoque → Anúncios Mercado Livre.');
  }
  const headers = { Authorization: `Bearer ${token.access_token}` };
  const itemCache = new Map();

  const getItemDetails = async (mlItemId) => {
    if (itemCache.has(mlItemId)) return itemCache.get(mlItemId);
    try {
      const data = await mlProxyFetch(`/items/${encodeURIComponent(mlItemId)}?include_attributes=all`, { headers });
      itemCache.set(mlItemId, data);
      return data;
    } catch {
      itemCache.set(mlItemId, null);
      return null;
    }
  };

  let matchedCount = 0;
  const updated = await Promise.all(
    variacoes.map(async (v, idx) => {
      const normName = normalize(v.nome);
      const tokens = normName.split(/[\s/|,-]+/).filter((t) => t.length >= 2);
      const varEstId = String(v.variacaoEstoqueId || '').trim();

      let rawPhotoUrl = '';

      // 1. Tenta casar pelo vínculo explícito __var__<variacaoEstoqueId>
      if (varEstId) {
        const byVarLink = mlLinkedListings.find((l) => String(l.ft_id || '').endsWith(`__var__${varEstId}`));
        if (byVarLink) {
          const itemData = await getItemDetails(byVarLink.ml_item_id);
          rawPhotoUrl =
            itemData?.pictures?.[0]?.secure_url ||
            itemData?.pictures?.[0]?.url ||
            (byVarLink.thumbnail_url || '').replace(/-I\.(jpg|jpeg|webp)$/i, '-O.$1');
        }
      }

      // 2. Tenta casar dentro de variations[] de um anúncio ML único
      if (!rawPhotoUrl && normName) {
        for (const l of mlLinkedListings) {
          const lVars = Array.isArray(l.variations) ? l.variations : [];
          const foundVar = lVars.find((lv) => {
            const attrVals = Array.isArray(lv.attributes)
              ? lv.attributes.map((a) => normalize(a.value_name || a.name)).join(' ')
              : '';
            return attrVals && (attrVals.includes(normName) || (tokens.length > 0 && tokens.every((t) => attrVals.includes(t))));
          });
          if (foundVar) {
            const itemData = await getItemDetails(l.ml_item_id);
            const mlVar = Array.isArray(itemData?.variations)
              ? itemData.variations.find((mv) => String(mv.id) === String(foundVar.id))
              : null;
            const picId = mlVar?.picture_ids?.[0];
            const picObj = picId && Array.isArray(itemData?.pictures)
              ? itemData.pictures.find((p) => p.id === picId)
              : null;
            rawPhotoUrl =
              picObj?.secure_url ||
              picObj?.url ||
              (foundVar.thumbnail_url || '').replace(/-I\.(jpg|jpeg|webp)$/i, '-O.$1');
            break;
          }
        }
      }

      // 3. Tenta casar pelo título de anúncios ML separados por cor/modelo
      if (!rawPhotoUrl && tokens.length > 0) {
        const matchedListing = mlLinkedListings.find((l) => {
          const normTitle = normalize(l.title);
          return normTitle.includes(normName) || tokens.every((t) => new RegExp(`(^|[^a-z0-9])${t}([^a-z0-9]|$)`, 'i').test(normTitle));
        });
        if (matchedListing) {
          const itemData = await getItemDetails(matchedListing.ml_item_id);
          rawPhotoUrl =
            itemData?.pictures?.[0]?.secure_url ||
            itemData?.pictures?.[0]?.url ||
            (matchedListing.thumbnail_url || '').replace(/-I\.(jpg|jpeg|webp)$/i, '-O.$1');
        }
      }

      if (!rawPhotoUrl) return v;

      matchedCount++;
      const cleanUrl = rawPhotoUrl.replace(/^http:\/\//i, 'https://');
      const mirrored = empresaId
        ? (await mirrorExternalImageToStorage(cleanUrl, empresaId, ftId, `var_${idx}_${Date.now()}`)) || cleanUrl
        : cleanUrl;

      return { ...v, foto: mirrored };
    })
  );

  return { updated, matchedCount };
}

// ============================================================================
// SINCRONIZAÇÃO COM ABA SITE PRÓPRIO (ecommerce_overrides channel_id = 'site')
// ============================================================================

export async function syncFtAnunciarSiteOverride(ftId, anunciarSite) {
  if (!ftId) return;
  try {
    const { data: existing } = await supabase
      .from('ecommerce_overrides')
      .select('settings')
      .eq('channel_id', 'site')
      .eq('ft_id', ftId)
      .maybeSingle();

    const currentSettings = existing?.settings ? { ...existing.settings } : {};
    if (anunciarSite) {
      currentSettings.cadastrado = true;
      await supabase
        .from('ecommerce_overrides')
        .upsert(
          { channel_id: 'site', ft_id: ftId, settings: currentSettings },
          { onConflict: 'channel_id,ft_id' }
        );
    } else if (existing) {
      delete currentSettings.cadastrado;
      if (Object.keys(currentSettings).length === 0) {
        await supabase
          .from('ecommerce_overrides')
          .delete()
          .eq('channel_id', 'site')
          .eq('ft_id', ftId);
      } else {
        await supabase
          .from('ecommerce_overrides')
          .upsert(
            { channel_id: 'site', ft_id: ftId, settings: currentSettings },
            { onConflict: 'channel_id,ft_id' }
          );
      }
    }
  } catch (err) {
    console.warn('[lojaAdmin] Erro ao sincronizar override site:', err);
  }
}
