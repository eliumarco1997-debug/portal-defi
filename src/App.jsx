import React from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import WalletsPage from './pages/WalletsPage';
import HaraganPage from './pages/HaraganPage';
import AvaroPage from './pages/AvaroPage';
import AddWalletModal from './components/Modals/AddWalletModal';
import CoberturaModal from './components/Modals/CoberturaModal';
import LpDetailsModal from './components/Modals/LpDetailsModal';
import './App.css';

function AppContent() {
  const { session, loading } = useAuth();
  const { activeTab, showAddWalletModal, showCoberturaModal, selectedLpDetails } = useAppContext();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'white', background: '#1e1e2f' }}>
        Cargando...
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <Header />
        
        {activeTab === 'wallets' && <WalletsPage />}
        {activeTab === 'haragan' && <HaraganPage />}
        {activeTab === 'avaro' && <AvaroPage />}

        {showAddWalletModal && <AddWalletModal />}
        {showCoberturaModal && <CoberturaModal />}
        {selectedLpDetails && <LpDetailsModal />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </AuthProvider>
  );
}
