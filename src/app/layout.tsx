import './globals.css';
import { NavBar } from './NavBar';

export const metadata = { title: 'CNL — Importação e Duplicidade' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <NavBar />
        <div className="wrap">{children}</div>
      </body>
    </html>
  );
}
