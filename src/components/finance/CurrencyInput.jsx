import React from 'react';

// Input de valor no estilo MOEDA (pt-BR): mostra 1.300,00 e digita estilo "calculadora"
// (os dígitos viram centavos da direita p/ esquerda). onChange recebe um Number em reais.
const fmtBRL = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CurrencyInput({ value, onChange, className = '', placeholder = '0,00', ...rest }) {
  const handle = (e) => {
    const digits = (e.target.value.match(/\d/g) || []).join('');
    const num = digits ? parseInt(digits, 10) / 100 : 0;
    onChange(num);
  };
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      // Zero aparece vazio (só o placeholder): com "0,00" escrito, o clique
      // punha o cursor no meio dos zeros e a digitação saía multiplicada.
      value={Number(value) ? fmtBRL(value) : ''}
      onChange={handle}
      placeholder={placeholder}
      className={className}
    />
  );
}
