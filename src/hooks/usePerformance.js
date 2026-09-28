import { useState, useEffect } from 'react';

export const usePerformance = () => {
    const [isLowEndDevice, setIsLowEndDevice] = useState(false);

    useEffect(() => {
        let isLow = false;

        // Verificar memória RAM (<= 4GB)
        if (navigator.deviceMemory && navigator.deviceMemory <= 4) {
            isLow = true;
        }

        // Verificar núcleos de CPU (<= 4)
        if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) {
            isLow = true;
        }

        // Verificar preferências do Sistema Operacional
        if (window.matchMedia) {
            const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const prefersReducedTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
            
            if (prefersReducedMotion || prefersReducedTransparency) {
                isLow = true;
            }
        }

        setIsLowEndDevice(isLow);
    }, []);

    return { isLowEndDevice };
};
