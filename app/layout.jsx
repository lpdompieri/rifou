import '../src/styles.css';

export const metadata = {
  title: 'RIFOU — App de Rifas',
  description: 'Encontre rifas ativas, acompanhe os prêmios e escolha seus números da sorte no RIFOU.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
