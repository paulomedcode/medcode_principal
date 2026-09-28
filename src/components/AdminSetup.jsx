
import React, { useState } from 'react';

import { ShieldAlert } from 'lucide-react';

const AdminSetup = () => {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');

    const handleCreateAdmin = async (e) => {
        e.preventDefault();
        try {
            await setDoc(doc(db, 'users', email), {
                email: email,
                role: 'admin',
                createdAt: new Date(),
                createdBy: 'system_setup'
            });
            setMessage(`Sucesso! O usuário ${email} agora é Admin. Faça login com este e-mail.`);
            setEmail('');
        } catch (error) {
            console.error(error);
            setMessage('Erro ao criar admin: ' + error.message);
        }
    };

    return (
        <div className="fixed bottom-4 right-4 max-w-sm w-full bg-white p-4 rounded-lg shadow-xl border border-orange-200 z-50">
            <div className="flex items-center gap-2 mb-2 text-orange-600 font-bold">
                <ShieldAlert size={20} />
                <span>Admin Setup (Temp)</span>
            </div>
            <p className="text-xs text-slate-500 mb-3">
                Use isto para criar o <strong>primeiro administrador</strong> do sistema, já que a tela de usuários é restrita.
            </p>
            <form onSubmit={handleCreateAdmin} className="space-y-2">
                <input
                    type="email"
                    placeholder="Seu e-mail de login"
                    className="w-full px-3 py-2 border rounded text-sm"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                />
                <button type="submit" className="w-full bg-orange-500 text-slate-800 py-1.5 rounded text-sm hover:bg-orange-600">
                    Conceder Permissão de Admin
                </button>
            </form>
            {message && <p className="mt-2 text-xs font-semibold text-green-600">{message}</p>}
        </div>
    );
};

export default AdminSetup;
