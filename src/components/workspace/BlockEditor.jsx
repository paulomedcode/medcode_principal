// ============================================================================
// Editor de blocos estilo Notion (BlockNote).
//
// Monte sempre com `key={page.id}` no pai: assim cada página tem sua própria
// instância e o conteúdo troca de forma limpa ao navegar entre páginas.
//
// Autosave: dispara `onSave(blocos)` com debounce; também salva ao desmontar
// (troca de página / saída) para não perder a última edição.
// ============================================================================
import { useCallback, useEffect, useRef } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, filterSuggestionItems } from '@blocknote/core';
import { getDefaultReactSlashMenuItems, SuggestionMenuController } from '@blocknote/react';
import { pt } from '@blocknote/core/locales';
import { Database } from 'lucide-react';
import { LinkedDatabaseBlock } from './LinkedDatabaseBlock';
import { MentionInline } from './MentionInline';
import { carregarUsuariosMencionaveis, nomeDeMencao } from './mentionUsers';
import { criarTravaDeQuadro, TRAVA_QUADRO_KEY } from './blockGuard';
import { criarCarimboDeAutoria, CARIMBO_KEY } from './carimboAutoria';
import { agoraFormatado, nomeDoAutor } from './registroDeAndamento';
import { useAuth } from '../../contexts/AuthContext';
import { uploadArquivoDoEditor } from '../../services/workspaceUploads';
import { usePermission } from '../../contexts/PermissionContext';
import '@blocknote/mantine/style.css';
import '../../styles/blocknote.css';

const SAVE_DEBOUNCE_MS = 800;

// ATENÇÃO: no BlockNote 0.51 `createReactBlockSpec()` devolve uma FÁBRICA
// `(options?) => BlockSpec`, não o spec pronto. `blockSpecs` espera o objeto
// com `.config`, então a fábrica PRECISA ser chamada aqui. Passá-la direto faz
// o schema estourar com "Cannot read properties of undefined (reading 'node')"
// já no import do módulo — derrubando a tela inteira.
//
// `createReactInlineContentSpec` (a menção) NÃO segue essa regra: devolve o
// spec pronto. Chamá-lo como se fosse fábrica quebra do mesmo jeito.
const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    linked_database: LinkedDatabaseBlock(),
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    mention: MentionInline,
  },
});

const insertDatabase = (editor) => ({
  title: "Exibição vinculada",
  subtext: "Conecte-se a um banco de dados existente",
  onItemClick: () => {
    editor.insertBlocks(
      [{ type: "linked_database" }],
      editor.getTextCursorPosition().block,
      "replace"
    );
  },
  aliases: ["database", "tabela", "vinculada", "db", "quadro", "calendario"],
  group: "Avançado",
  icon: <Database size={18} />,
});

// Itens do menu de "@": a gente do sistema, filtrada pelo que já foi digitado.
// `onMention` recebe o usuário escolhido — é por ali que a menção vira aviso
// para a pessoa (ver services/workspace.registrarMencao).
const itensDeMencao = async (editor, query, onMention) => {
  const usuarios = await carregarUsuariosMencionaveis();
  const q = (query || '').trim().toLowerCase();
  return usuarios
    .filter((u) => !q || `${u.name || ''} ${u.email || ''}`.toLowerCase().includes(q))
    .slice(0, 15)
    .map((u) => ({
      title: nomeDeMencao(u),
      subtext: u.email || '',
      onItemClick: () => {
        editor.insertInlineContent([
          { type: 'mention', props: { userId: u.id, nome: nomeDeMencao(u) } },
          ' ', // espaço depois do chip: o cursor sai do chip e a frase continua
        ]);
        onMention?.(u);
      },
    }));
};

/*
 * Acrescenta um parágrafo no fim do documento e devolve o documento resultante.
 *
 * Devolver os blocos é o que garante o registro: quem chamou grava na hora, em
 * vez de torcer para o autosave do editor pegar uma alteração que não veio de
 * uma tecla.
 */
function inserirNoFim(editor, conteudo) {
  const doc = editor.document;
  const ultimo = doc[doc.length - 1];
  const ultimoVazio = ultimo?.type === 'paragraph' && !(ultimo.content || []).length;
  // Parágrafo vazio no fim é o cursor da pessoa esperando — aproveita ele em
  // vez de deixar uma linha em branco no meio do histórico.
  if (ultimoVazio) editor.updateBlock(ultimo, { type: 'paragraph', content: conteudo });
  else editor.insertBlocks([{ type: 'paragraph', content: conteudo }], ultimo, 'after');
  return editor.document;
}

/*
 * `aoPreparar` (opcional): recebe uma vez, quando o editor sobe, as ações que a
 * tela de fora pode disparar sobre o conteúdo — hoje só `registrar`, que anexa
 * uma linha ao fim (o "fulano concluiu o lembrete" da tarefa).
 */
export default function BlockEditor({ initialContent, onSave, onDirtyChange, onMention, editavel = true, aoPreparar, carimbarAutoria = false }) {
  // BlockNote exige pelo menos um bloco: conteúdo vazio vira `undefined`
  // (gera um parágrafo em branco) em vez de [] (que quebra).
  const safeInitial = Array.isArray(initialContent) && initialContent.length > 0 ? initialContent : undefined;

  const { hasPermission } = usePermission();
  const { currentUser } = useAuth();
  const podeAlterarQuadro = hasPermission('Alterar Quadros Compromisso');

  // Quem é o autor muda de sessão para sessão; o plugin lê pelo ref para não
  // precisar ser recriado (recriá-lo zeraria a janela do carimbo).
  const autorRef = useRef(currentUser);
  useEffect(() => { autorRef.current = currentUser; }, [currentUser]);

  const editor = useCreateBlockNote({
    schema,
    initialContent: safeInitial,
    dictionary: pt,
    // Com `uploadFile` definido, o BlockNote passa a aceitar arquivo de
    // qualquer origem: arrastar para dentro, colar do clipboard e a aba
    // "Enviar" dos blocos de imagem/arquivo/vídeo/áudio. Sem ele, só resta o
    // campo de URL — que era a única porta que existia aqui.
    uploadFile: uploadArquivoDoEditor,
  });

  // Quadro não sai por tecla apertada sem querer (ver blockGuard.js).
  useEffect(() => {
    const trava = criarTravaDeQuadro();
    editor._tiptapEditor.registerPlugin(trava);
    return () => editor._tiptapEditor.unregisterPlugin(TRAVA_QUADRO_KEY);
  }, [editor]);

  // Carimbo de autoria: uma vez por abertura, na primeira anotação nova.
  // `carimbado` vive no ref porque a janela é do editor montado, não do render:
  // fechar e reabrir a tarefa monta outro editor e a janela abre de novo.
  const carimbado = useRef(false);
  useEffect(() => {
    if (!carimbarAutoria) return undefined;
    const plugin = criarCarimboDeAutoria({
      obterCarimbo: () => `${agoraFormatado()} · ${nomeDoAutor(autorRef.current)} — `,
      jaCarimbou: () => carimbado.current,
      aoCarimbar: () => { carimbado.current = true; },
    });
    editor._tiptapEditor.registerPlugin(plugin);
    return () => editor._tiptapEditor.unregisterPlugin(CARIMBO_KEY);
  }, [editor, carimbarAutoria]);

  // Entrega as ações ao pai uma vez só: guardar o callback num ref evita
  // reentregar a cada render do pai (a prop costuma ser um arrow inline).
  const aoPrepararRef = useRef(aoPreparar);
  useEffect(() => { aoPrepararRef.current = aoPreparar; }, [aoPreparar]);
  useEffect(() => {
    aoPrepararRef.current?.({
      registrar: (conteudo) => {
        // A linha de conclusão já vem com data e autor: carimbar de novo na
        // próxima tecla seria repetição.
        carimbado.current = true;
        return inserirNoFim(editor, conteudo);
      },
    });
  }, [editor]);

  const timerRef = useRef(null);
  const latestRef = useRef(null);
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  const onMentionRef = useRef(onMention);
  useEffect(() => { onMentionRef.current = onMention; }, [onMention]);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (latestRef.current && onSaveRef.current) {
      onSaveRef.current(latestRef.current);
      latestRef.current = null;
    }
  }, []);

  const handleChange = useCallback(() => {
    latestRef.current = editor.document;
    onDirtyChange?.(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      flush();
      onDirtyChange?.(false);
    }, SAVE_DEBOUNCE_MS);
  }, [editor, flush, onDirtyChange]);

  // Salva o que estiver pendente ao desmontar (troca de página / navegação).
  useEffect(() => () => flush(), [flush]);

  return (
    <BlockNoteView
      editor={editor}
      theme="light"
      editable={editavel}
      onChange={handleChange}
      className="ws-editor"
      slashMenu={false}
    >
      {editavel && <SuggestionMenuController
        triggerCharacter={"/"}
        getItems={async (query) =>
          filterSuggestionItems(
            [
              // Quem não pode mexer em quadro também não os cria.
              ...(podeAlterarQuadro ? [insertDatabase(editor)] : []),
              ...getDefaultReactSlashMenuItems(editor),
            ],
            query
          )
        }
      />}
      {/* A filtragem é feita na própria busca (nome + e-mail), então aqui não
          passa por filterSuggestionItems — que só olharia o título. */}
      {editavel && <SuggestionMenuController
        triggerCharacter={"@"}
        getItems={(query) => itensDeMencao(editor, query, onMentionRef.current)}
      />}
    </BlockNoteView>
  );
}
