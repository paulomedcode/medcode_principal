import React from 'react';
import { Building2, MapPin, Activity, ArrowRight } from 'lucide-react';
import { useUnit } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';

export const UnitGatekeeper = ({ children }) => {
    const { unidadeAtual, unidades, changeUnidade, isLoadingUnits } = useUnit();
    const { currentUser } = useAuth();

    return children;
};
