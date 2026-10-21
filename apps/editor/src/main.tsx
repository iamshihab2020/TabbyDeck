import { render } from 'preact';
import '@tabbydeck/ui/tokens.css';
import './editor.css';
import { App } from './app.tsx';

render(<App />, document.getElementById('app')!);
