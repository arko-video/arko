// Point d'entrée : polices, styles, navigation, sauvegarde automatique, service worker, puis l'interface.

import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-700.css';
// Styles dans l'ordre de la cascade (un fichier par écran ou par composant).
import './ui/styles/theme.css';
import './ui/styles/messages.css';
import './ui/styles/apercu.css';
import './ui/styles/importer.css';
import './ui/styles/couper.css';
import './ui/styles/vertical.css';
import './ui/styles/exporter.css';
import './ui/styles/nav-source.css';
import './ui/styles/dialogue.css';
import './ui/styles/habiller.css';
import './ui/styles/outils.css';
import './ui/styles/webcam.css';

import { render } from 'preact';
import { App } from './ui/App';
import { activerSauvegardeAuto } from './ui/etat';
import { initialiserNavigation } from './ui/navigation';
import { enregistrerPwa } from './ui/pwa';

initialiserNavigation();
activerSauvegardeAuto();
enregistrerPwa();

const racine = document.getElementById('app');
if (racine) render(<App />, racine);
