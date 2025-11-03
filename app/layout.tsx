/* app/layout.tsx */
import './globals.css';

export const metadata = {
  title: '予約デモ',
  description: 'Chiropractic Clinic Reservations',
};

export default function RootLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <main className="max-w-3xl mx-auto p-4">{children}</main>
      </body>
    </html>
  );
}
