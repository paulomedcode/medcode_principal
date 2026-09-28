export const formatNameStandard = (fullName) => {
    if (!fullName) return '';
    const parts = fullName.trim().split(' ').filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    
    // Deixa a primeira letra de cada nome em maiúscula
    const formatPart = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    
    return `${formatPart(parts[0])} ${formatPart(parts[1])}`;
};
