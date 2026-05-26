import React from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
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
  const { activeTab, showAddWalletModal, showCoberturaModal, selectedLpDetails } = useAppContext();

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
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
