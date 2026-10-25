import './automation-center.css';
import './globals.css';
import './checkout.css';
import './business.css';
import './finance.css';
import './compact.css';
import './workspace.css';
import './workspace-refinements.css';
import './workspace-upgrade.css';
import './theme-system.css';
import './theme-dark-surfaces.css';
import './theme-finishing.css';
import './saas-workspace.css';
import './mobile-workspace.css';
import './mobile-navigation.css';
import './mobile-dialogs.css';
import './record-refinements.css';
import './customer-reports.css';
import './email-documents.css';
import './whatsapp-crm.css';
import './whatsapp-inbox.css';
import './whatsapp-connections.css';
import './customer-finance-upgrade.css';
import './workspace-startup.css';
import './loader-studio.css';
import './mobile-home.css';
import './mobile-attestations.css';
import './interface-polish.css';
import {AppearanceProvider} from '../components/ThemeStudio';
import ActionFeedback from '../components/ActionFeedback';
import PdfPreviewModal from '../components/PdfPreviewModal';

export const metadata = {
  title: 'Workspace',
  description: 'Business operations workspace',
  manifest:'/manifest.webmanifest',
  appleWebApp:{capable:true,statusBarStyle:'default',title:'Workspace'},
  icons:{apple:'/api/pwa/icon?size=192'},
};

export const viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#1d7347'};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body><AppearanceProvider/>{children}<PdfPreviewModal/><ActionFeedback/></body>
    </html>
  );
}
