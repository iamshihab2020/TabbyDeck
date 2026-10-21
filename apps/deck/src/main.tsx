import { render } from 'preact';
import '@tabbydeck/ui/tokens.css';
import './client.css';
import { App } from './app.tsx';

if (!(window as Window & { __TB_OLD?: boolean }).__TB_OLD) render(<App />, document.getElementById('app')!);
