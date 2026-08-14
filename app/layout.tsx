import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Music',
  description: 'Your personal YouTube Music library, downloaded and owned.',
  icons: {
    icon: '/music-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/music-icon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('contextmenu', function(e) {
                if (e.target && e.target.closest && e.target.closest('[data-song-context]')) return;
                e.preventDefault();
                e.stopPropagation();
                return false;
              }, { capture: true });
            `,
          }}
        />
        </body>
    </html>
  );
}
