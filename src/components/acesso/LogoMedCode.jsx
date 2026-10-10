import React, { useId } from 'react';
import { LOGO_PATHS } from '../../../medcode-proposta/src/logo.js';

const { MED, CODE, W, CX } = LOGO_PATHS;

/**
 * Logo MedCode vetorial (o mesmo da proposta e da landing): ícone </> no
 * quadrado em degradê + "MedCode". `escuro` é para fundo escuro ("Med" branco).
 * `altura` é a altura do ícone em px; o texto acompanha.
 */
export default function LogoMedCode({ escuro = false, altura = 36, className = '' }) {
    const id = useId().replace(/:/g, '');
    const txtH = Math.round(altura * 0.65);
    const txtW = Math.round((txtH * W) / 100);
    const ico = Math.round(altura * 0.59);
    return (
        <div className={`flex items-center ${className}`} style={{ gap: Math.round(altura * 0.26) }}>
            <span className="grid place-items-center shrink-0"
                style={{
                    width: altura, height: altura, borderRadius: Math.round(altura * 0.27),
                    background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)',
                    boxShadow: escuro ? '0 8px 20px -10px rgba(139,92,246,.9)' : undefined,
                }}>
                <svg width={ico} height={ico} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M8.5 8L4.5 12l4 4M15.5 8l4 4-4 4M13.2 6.5l-2.4 11" />
                </svg>
            </span>
            <svg width={txtW} height={txtH} viewBox={`0 0 ${W} 100`} role="img" aria-label="MedCode">
                <defs>
                    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={CX} y1="0" x2={W} y2="0">
                        <stop offset="0" stopColor={escuro ? '#a78bfa' : '#8b5cf6'} />
                        <stop offset="1" stopColor="#3b82f6" />
                    </linearGradient>
                </defs>
                <path fill={escuro ? '#ffffff' : '#07040f'} d={MED} />
                <path fill={`url(#${id})`} d={CODE} />
            </svg>
        </div>
    );
}
