import localFont from 'next/font/local';
import './globals.css';

const spaceGrotesk = localFont({
  src: [
    { path: './fonts/SpaceGrotesk-Regular.ttf', weight: '400', style: 'normal' },
    { path: './fonts/SpaceGrotesk-Medium.ttf', weight: '500', style: 'normal' },
    { path: './fonts/SpaceGrotesk-Bold.ttf', weight: '700', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
});

export const metadata = {
  title: 'QUARTZ XD — WhatsApp Pairing',
  description:
    'Pair your WhatsApp number with the QUARTZ XD bot. Generate your pairing code, manage paired devices and check live device status — no login required.',
  openGraph: {
    title: 'QUARTZ XD — WhatsApp Pairing',
    description: 'Generate a WhatsApp pairing code and manage your paired devices.',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={spaceGrotesk.variable}>{children}</body>
    </html>
  );
}
