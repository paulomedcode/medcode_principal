export const maskCPF = (value) => {
    if (!value) return '';
    return value
        .replace(/\D/g, '')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
        .slice(0, 14);
};

export const maskTelefone = (value) => {
    if (!value) return '';
    let limpo = value.replace(/\D/g, '');
    if (limpo.length <= 10) {
        return limpo
            .replace(/(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{4})(\d)/, '$1-$2')
            .slice(0, 14);
    }
    return limpo
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2')
        .slice(0, 15);
};

export const maskCEP = (value) => {
    if (!value) return '';
    return value
        .replace(/\D/g, '')
        .replace(/(\d{5})(\d)/, '$1-$2')
        .slice(0, 9);
};

export const maskCNS = (value) => {
    if (!value) return '';
    return value
        .replace(/\D/g, '')
        .replace(/(\d{3})(\d)/, '$1 $2')
        .replace(/(\d{4})(\d)/, '$1 $2')
        .replace(/(\d{4})(\d{1,4})$/, '$1 $2')
        .slice(0, 18);
};

export const apenasNumeros = (value) => {
    if (!value) return '';
    return value.replace(/\D/g, '');
};

export const maskCNPJ = (value) => {
    if (!value) return '';
    return value
        .replace(/\D/g, '')
        .replace(/(\d{2})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1/$2')
        .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
        .slice(0, 18);
};

// Decide CPF (≤11 dígitos) ou CNPJ pela quantidade de dígitos.
export const maskDocumento = (value) => {
    if (!value) return '';
    const digits = value.replace(/\D/g, '');
    return digits.length <= 11 ? maskCPF(value) : maskCNPJ(value);
};
