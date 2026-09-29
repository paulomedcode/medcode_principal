import React from 'react';
import { PendenciasWidget } from './widgetsPendencias.jsx';

/*
 * TELA INICIAL — saudação e grade de módulos à esquerda; Pendências na
 * lateral direita.
 *
 * As duas colunas começam em `md` (768px), não em `lg`: janela de notebook em
 * meia tela dá ~960px e caía na pilha, jogando as pendências para baixo da
 * dobra. A lateral tem largura mínima para não virar uma tira.
 */
const DUAS_COLUNAS = 'md:grid md:grid-cols-[minmax(0,1fr)_minmax(250px,31%)]';

const HomeLayout = ({ header, modules, widgetProps }) => (
    <div className={`flex-1 flex flex-col gap-4 min-h-0 w-full ${DUAS_COLUNAS} md:gap-6`}>
        <div className="flex flex-col gap-4 md:gap-6 min-h-0 min-w-0 shrink-0">
            {header}
            {modules}
        </div>

        <div className="flex min-h-[320px] md:min-h-0 pb-6 md:pb-0 shrink-0">
            <PendenciasWidget {...widgetProps} />
        </div>
    </div>
);

export default HomeLayout;
