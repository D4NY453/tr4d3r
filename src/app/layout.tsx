import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TradingView Signals | Live Crypto Charts & Signal Engine',
  description: 'Clon de TradingView de alto rendimiento con gráficos en vivo de Binance, indicadores y motor de señales y estrategias.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className="h-screen w-screen flex flex-col bg-[#131722] text-[#d1d4dc] overflow-hidden antialiased">
        {children}
      </body>
    </html>
  );
}
