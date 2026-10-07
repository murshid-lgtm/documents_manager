import './globals.css';
import './checkout.css';
import './business.css';
import './finance.css';
import './compact.css';
import './workspace.css';
import './workspace-refinements.css';
import ActionFeedback from '../components/ActionFeedback';
import PdfPreviewModal from '../components/PdfPreviewModal';

export const metadata = {
  title: 'Document Tracker',
  description: 'Business operations workspace',
  manifest:'/manifest.webmanifest',
  appleWebApp:{capable:true,statusBarStyle:'default',title:'Workspace'},
  icons:{apple:'/api/pwa/icon?size=192'},
};

export const viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#1d7347'};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}<PdfPreviewModal/><ActionFeedback/></body>
    </html>
  );
}
