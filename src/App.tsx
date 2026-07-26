import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PlayerProvider } from './context/PlayerContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { PlayerBar } from './components/PlayerBar';
import { QueueDrawer } from './components/QueueDrawer';
import { ExpandedPlayerModal } from './components/ExpandedPlayerModal';
import { AddTrackModal } from './components/AddTrackModal';
import { UnauthorizedScreen } from './components/UnauthorizedScreen';
import { HomeView } from './views/HomeView';
import { LibraryView } from './views/LibraryView';
import { PlaylistDetailView } from './views/PlaylistDetailView';
import { SearchView } from './views/SearchView';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { user, loading } = useAuth();

  const [currentTab, setCurrentTab] = useState<string>('home');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals & Drawers
  const [isQueueOpen, setIsQueueOpen] = useState<boolean>(false);
  const [isExpandedOpen, setIsExpandedOpen] = useState<boolean>(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin mb-3" />
        <span className="text-xs font-mono text-neutral-400">Verifying single-user session...</span>
      </div>
    );
  }

  // If user is not authenticated or not authorized (`minecraftprahas@gmail.com`)
  if (!user || !user.isAuthorized) {
    return <UnauthorizedScreen />;
  }

  const handleSearchSubmit = (query: string) => {
    setSearchQuery(query);
    setCurrentTab('search');
    setSelectedPlaylistId(null);
  };

  const handleSelectPlaylist = (playlistId: string) => {
    setSelectedPlaylistId(playlistId);
    setCurrentTab('playlist');
  };

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white overflow-hidden select-none font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={(tab) => {
          setCurrentTab(tab);
          setSelectedPlaylistId(null);
        }}
        selectedPlaylistId={selectedPlaylistId}
        setSelectedPlaylistId={setSelectedPlaylistId}
        onOpenAddModal={() => setIsAddModalOpen(true)}
      />

      {/* Main Container */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Top Sticky Header */}
        <Header
          onSearchSubmit={handleSearchSubmit}
          onOpenAddModal={() => setIsAddModalOpen(true)}
        />

        {/* Main View Area */}
        <main className="flex-1 overflow-y-auto bg-[#0d0d0d] custom-scrollbar">
          {selectedPlaylistId ? (
            <PlaylistDetailView
              playlistId={selectedPlaylistId}
              onBack={() => {
                setSelectedPlaylistId(null);
                setCurrentTab('home');
              }}
              onOpenAddModal={() => setIsAddModalOpen(true)}
            />
          ) : currentTab === 'home' ? (
            <HomeView
              onOpenAddModal={() => setIsAddModalOpen(true)}
              onSelectPlaylist={handleSelectPlaylist}
            />
          ) : currentTab === 'library' ? (
            <LibraryView
              onOpenAddModal={() => setIsAddModalOpen(true)}
              onSelectPlaylist={handleSelectPlaylist}
            />
          ) : currentTab === 'explore' || currentTab === 'search' ? (
            <SearchView
              initialQuery={searchQuery}
              onOpenAddModal={() => setIsAddModalOpen(true)}
            />
          ) : (
            <HomeView
              onOpenAddModal={() => setIsAddModalOpen(true)}
              onSelectPlaylist={handleSelectPlaylist}
            />
          )}
        </main>

        {/* Sticky Bottom Audio Player Bar */}
        <PlayerBar
          onToggleQueue={() => setIsQueueOpen(!isQueueOpen)}
          onToggleExpanded={() => setIsExpandedOpen(!isExpandedOpen)}
          isQueueOpen={isQueueOpen}
        />
      </div>

      {/* Slide-over Queue Drawer */}
      <QueueDrawer isOpen={isQueueOpen} onClose={() => setIsQueueOpen(false)} />

      {/* Fullscreen Player Modal */}
      <ExpandedPlayerModal isOpen={isExpandedOpen} onClose={() => setIsExpandedOpen(false)} />

      {/* Add Track via YouTube URL Modal */}
      <AddTrackModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PlayerProvider>
        <AppContent />
      </PlayerProvider>
    </AuthProvider>
  );
}
