// ============================================================================
// Menção a um usuário do sistema (@fulano) dentro do editor.
//
// Digitar "@" abre a lista de gente do sistema; escolher alguém insere um chip
// com o nome — e não um texto solto, que ninguém consegue notificar depois.
// O que fica gravado no bloco é o `userId`: se a pessoa trocar de nome, a
// menção continua apontando para ela.
//
// ATENÇÃO: ao contrário de `createReactBlockSpec` (que devolve uma fábrica e
// precisa ser CHAMADA — ver LinkedDatabaseBlock.jsx), o
// `createReactInlineContentSpec` devolve o spec pronto. Vai direto no schema,
// sem parênteses.
// ============================================================================
import { createReactInlineContentSpec } from '@blocknote/react';

export const MentionInline = createReactInlineContentSpec(
  {
    type: 'mention',
    propSchema: {
      userId: { default: '' },
      nome: { default: '' },
    },
    content: 'none',
  },
  {
    render: ({ inlineContent }) => (
      <span className="ws-mention" data-user-id={inlineContent.props.userId}>
        @{inlineContent.props.nome}
      </span>
    ),
  }
);
