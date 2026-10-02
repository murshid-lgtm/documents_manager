import './globals.css';
import './checkout.css';
import './business.css';

export const metadata = {
  title: 'Document Tracker',
  description: 'Business operations workspace',
  manifest:'/manifest.webmanifest',
  appleWebApp:{capable:true,statusBarStyle:'default',title:'Workspace'},
  icons:{apple:'/api/pwa/icon?size=192'},
};

export const viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#3265DF'};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
