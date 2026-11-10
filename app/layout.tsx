import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Firma Social — Seu conteúdo em movimento',description:'Planeje, prepare e publique seu conteúdo com as integrações oficiais de Instagram, TikTok e YouTube.',robots:{index:false,follow:false},icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
