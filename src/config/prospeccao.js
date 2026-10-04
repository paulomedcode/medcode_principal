// Etapas da prospecção (coluna prospeccao_leads.status). A ordem é a do quadro
// e a tecla de atalho na ficha do lead (1 a 9).
export const STATUS_PROSPECCAO = [
    { id: 'NOVO', label: 'A abordar', cor: '#94a3b8', etiqueta: 'bg-slate-100 text-slate-600 border-slate-200' },
    { id: 'CONTATADO', label: 'Abordado', cor: '#3b82f6', etiqueta: 'bg-blue-50 text-blue-700 border-blue-200' },
    { id: 'SEM_RESPOSTA', label: 'Sem resposta', cor: '#f59e0b', etiqueta: 'bg-amber-50 text-amber-700 border-amber-200' },
    { id: 'RESPONDEU', label: 'Respondeu', cor: '#06b6d4', etiqueta: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
    { id: 'INTERESSADO', label: 'Interessado', cor: '#6366f1', etiqueta: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    { id: 'PROPOSTA', label: 'Proposta enviada', cor: '#8b5cf6', etiqueta: 'bg-violet-50 text-violet-700 border-violet-200' },
    { id: 'FECHADO', label: 'Fechado', cor: '#10b981', etiqueta: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { id: 'PRODUCAO', label: 'Em produção', cor: '#14b8a6', etiqueta: 'bg-teal-50 text-teal-700 border-teal-200' },
    { id: 'DESCARTADO', label: 'Descartado', cor: '#f43f5e', etiqueta: 'bg-rose-50 text-rose-600 border-rose-200' },
];

export const statusProspeccao = (id) => STATUS_PROSPECCAO.find((s) => s.id === id) || STATUS_PROSPECCAO[0];

/** Campos que a importação sabe preencher, com os nomes de coluna que costumam aparecer nas planilhas. */
export const CAMPOS_IMPORTACAO = [
    { id: 'nome', label: 'Nome', apelidos: ['nome', 'name', 'title', 'titulo', 'empresa', 'razao social', 'nome fantasia', 'business name'] },
    { id: 'categoria', label: 'Categoria', apelidos: ['categoria', 'category', 'categoryname', 'categoria principal', 'segmento', 'tipo', 'type', 'main category'] },
    { id: 'telefone', label: 'Telefone', apelidos: ['telefone', 'phone', 'fone', 'celular', 'whatsapp', 'phoneunformatted', 'phone number', 'tel'] },
    { id: 'email', label: 'E-mail', apelidos: ['email', 'e-mail', 'emails', 'mail'] },
    { id: 'site', label: 'Site', apelidos: ['site', 'website', 'web', 'url do site', 'domain', 'dominio'] },
    { id: 'instagram', label: 'Instagram', apelidos: ['instagram', 'insta', 'instagrams'] },
    { id: 'endereco', label: 'Endereço', apelidos: ['endereco', 'address', 'street', 'rua', 'logradouro', 'full address'] },
    { id: 'cidade', label: 'Cidade', apelidos: ['cidade', 'city', 'municipio'] },
    { id: 'uf', label: 'UF', apelidos: ['uf', 'estado', 'state'] },
    { id: 'maps_url', label: 'Link do Maps', apelidos: ['maps', 'google maps', 'url', 'link', 'maps url', 'place url', 'googlemapsurl'] },
    { id: 'nota_google', label: 'Nota Google', apelidos: ['nota', 'rating', 'totalscore', 'stars', 'avaliacao', 'score'] },
    { id: 'avaliacoes', label: 'Nº de avaliações', apelidos: ['avaliacoes', 'reviews', 'reviewscount', 'reviews count', 'qtd avaliacoes', 'numero de avaliacoes'] },
    { id: 'notas', label: 'Observações', apelidos: ['observacoes', 'obs', 'notas', 'notes', 'descricao', 'description'] },
];

export const soDigitos = (s) => String(s || '').replace(/\D/g, '');

/** Link de WhatsApp a partir do telefone (assume Brasil quando vier sem DDI). */
export const linkWhats = (telefone) => {
    let d = soDigitos(telefone);
    if (!d) return null;
    if (d.length <= 11) d = `55${d.replace(/^0+/, '')}`;
    return `https://wa.me/${d}`;
};

export const linkSite = (s) => (!s ? null : /^https?:\/\//i.test(s) ? s : `https://${s}`);

export const linkInstagram = (s) => {
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return s;
    return `https://instagram.com/${String(s).replace(/^@/, '').trim()}`;
};

export const linkMaps = (lead) => lead.maps_url
    || (lead.endereco || lead.nome ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([lead.nome, lead.endereco, lead.cidade].filter(Boolean).join(' '))}` : null);

/** "há 3 dias", "hoje", "ontem". */
export const tempoDesde = (iso) => {
    if (!iso) return null;
    const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (dias <= 0) return 'hoje';
    if (dias === 1) return 'ontem';
    if (dias < 30) return `há ${dias} dias`;
    const meses = Math.floor(dias / 30);
    return meses === 1 ? 'há 1 mês' : `há ${meses} meses`;
};
