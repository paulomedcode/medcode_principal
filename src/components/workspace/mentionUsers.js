// ============================================================================
// Quem pode ser mencionado com "@" — a gente cadastrada no sistema.
//
// Fica separado do MentionInline.jsx (que é só o nó do editor) porque o menu de
// menção precisa dessa lista antes de qualquer chip existir.
// ============================================================================
import { supabase } from '../../services/supabase';
import { formatNameStandard } from '../../utils/nameFormatter';

/** Nome curto e legível para o chip ("Paulo Nogueira"). */
export const nomeDeMencao = (u) => formatNameStandard(u?.name) || u?.email || 'Sem nome';

// A lista de gente muda pouco e o menu abre a cada "@": uma consulta por sessão
// basta. Guarda a PROMESSA (não o resultado) para dois menus abertos ao mesmo
// tempo não dispararem duas buscas; se der erro, o cache é descartado para a
// próxima tentativa buscar de novo.
let promessaUsuarios = null;
export function carregarUsuariosMencionaveis() {
  if (!promessaUsuarios) {
    promessaUsuarios = supabase
      .from('users')
      .select('id, name, email')
      .order('name')
      .then(({ data, error }) => {
        if (error) throw error;
        return data || [];
      })
      .catch((e) => {
        promessaUsuarios = null;
        console.error('Erro ao carregar usuários para menção:', e);
        return [];
      });
  }
  return promessaUsuarios;
}
