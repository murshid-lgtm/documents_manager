import './globals.css';

export const metadata = {
  title: 'Document Tracker',
  description: 'Document operations management system',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
