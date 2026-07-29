import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Music',
  description: 'Your personal YouTube Music library, downloaded and owned.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
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
              (function(){
                try {
                  var nl = window.Neutralino || window.__Neutralino || null;
                  if (nl && nl.os && typeof nl.os.getPath === 'function') {
                    nl.os.getPath('data').then(function(p){
                      try { fetch('/api/native/data-dir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }) }); } catch(e){}
                    }).catch(function(){/*ignore*/});
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </body>
    </html>
  );
}
