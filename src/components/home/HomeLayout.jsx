import React from 'react';
import { ProximosPlantoesWidget } from './widgets.jsx';
import { PendenciasWidget } from './widgetsPendencias.jsx';
import { MapaDoPlantaoWidget } from './widgetsMapa.jsx';
import { ehTelaMedico } from '../../config/homeLayout';

/*
 * TELA INICIAL — duas telas, e só duas.
 *
 *   MÉDICO         lateral direita: Próximos Plantões (em cima) + Pendências
 *                  (embaixo, cabem ~4 sem rolar). Embaixo dos módulos, o mapa
 *                  cirúrgico do hospital onde ele está escalado.
 *
 *   ADMINISTRATIVO lateral direita inteira: Pendências. O resto da tela é a
 *                  grade de módulos, distribuída na altura disponível.
 *
 * Antes isto era configurável por cargo E por usuário (settings.id='home_layouts'
 * + editor nas Configurações). Um override individual apagou silenciosamente o
 * card de assinatura da home de um médico — a folha de ponto ficou pendente sem
 * que ele tivesse como saber. A tela deixou de ser configurável de propósito:
 * quem decide o que a pessoa vê é o cargo dela, no código.
 *
 * As duas colunas começam em `md` (768px), não em `lg`: janela de notebook em
 * meia tela dá ~960px e caía na pilha, jogando plantões e pendências para
 * baixo da dobra. A lateral tem largura mínima para não virar uma tira.
 */

// Colunas só a partir de md; a lateral nunca abaixo de 250px.
const DUAS_COLUNAS = 'md:grid md:grid-cols-[minmax(0,1fr)_minmax(250px,31%)]';

const HomeLayout = ({ header, modules, widgetProps }) => {
    if (ehTelaMedico(widgetProps?.currentUser)) {
        return (
            /*
             * Grade de 2 colunas x 2 linhas no desktop: módulos em cima da
             * esquerda, mapa embaixo, lateral ocupando as duas linhas.
             * Empilhado (mobile/tablet) vira uma coluna só, e o `order` põe a
             * lateral ANTES do mapa — plantão e pendência são o que a pessoa
             * abriu o sistema para ver; o mapa é grande e empurraria tudo para
             * fora da tela.
             */
            <div className={`flex-1 flex flex-col gap-4 min-h-0 w-full ${DUAS_COLUNAS} md:grid-rows-[auto_minmax(0,1fr)] md:gap-6`}>
                <div className="order-1 md:col-start-1 md:row-start-1 flex flex-col gap-4 md:gap-6 min-w-0 shrink-0">
                    {header}
                    {modules}
                </div>

                <div className="order-2 md:col-start-2 md:row-start-1 md:row-span-2 flex flex-col gap-4 md:gap-6 min-h-0 min-w-0 shrink-0">
                    <div className="flex w-full min-h-[250px] md:flex-1 md:min-h-0">
                        <ProximosPlantoesWidget {...widgetProps} />
                    </div>
                    {/* Altura fixa: é o que garante os itens à vista sem rolar. Sem
                        ela a coluna dividiria o espaço meio a meio com os plantões.
                        Cresceu 20% (260 → 312px) porque a pendência é o que pede
                        ação; a lista de plantões é consulta e cede o espaço. Foi a
                        368px quando o lembrete passou a ocupar duas linhas: sem
                        isso a lista voltaria a rolar já no quarto item. */}
                    <div className="flex w-full h-[368px] shrink-0">
                        <PendenciasWidget {...widgetProps} />
                    </div>
                </div>

                <div className="order-3 md:col-start-1 md:row-start-2 flex w-full min-h-[280px] md:min-h-0 pb-6 md:pb-0 shrink-0">
                    <MapaDoPlantaoWidget {...widgetProps} />
                </div>
            </div>
        );
    }

    return (
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
};

export default HomeLayout;
