import React from 'react';
import Sidebar from '../components/Sidebar';
import { Outlet } from 'react-router-dom';

const MainLayout = () => {
    return (
        <div className="flex min-h-screen bg-gradient-to-br from-blue-50 via-slate-50 to-blue-50 print:block print:bg-white print:m-0 print:p-0">
            <div className="print:hidden">
                <Sidebar />
            </div>
            <main className="flex-1 p-8 overflow-y-auto print:ml-0 print:pl-0 print:w-full print:block print:overflow-visible print:p-0">
                <Outlet />
            </main>
        </div>
    );
};

export default MainLayout;
