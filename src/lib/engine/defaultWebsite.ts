import finnNetworkJpg from '$lib/assets/finn-network.jpg?inline';
import { base64ToBytes, type FileContent } from './FileSystem.svelte';
import { DEFAULT_DOCUMENT_ROOT, DIRECTORY_INDEX, escapeHtml } from './http';

// Inhalte, die ein neuer Web-Server in seinem Standard-Verzeichnis mitbringt

const STYLE_CSS = `body {
  font-family: system-ui, sans-serif;
  background: #eef2f6;
  color: #1f2933;
  margin: 0;
  padding: 1rem 1rem;
}

main {
  max-width: 36rem;
  margin: 0;
  padding: 1rem 1.5rem;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
}

h1 {
  margin-top: 0;
  color: #2b6cb0;
  margin-bottom: 0.5rem;
}

img {
  display: block;
  max-width: 100%;
  margin: 1rem auto;
}

code {
  background: #eef2f6;
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
}
`;

const INDEX_HTML = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <title>Es funktioniert!</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main>
    <h1>Es funktioniert!</h1>
    Dies ist die Standardseite des Webservers.
    <img width=200px src="finn-network.jpg" alt="Finn-Netzwerk">
    <p>
      Die Seite liegt auf dem Webserver unter <code>${DEFAULT_DOCUMENT_ROOT}/${DIRECTORY_INDEX}</code>.<br>
    </p>
  </main>
</body>
</html>
`;

function dataUriToBytes(dataUri: string): Uint8Array {
	return base64ToBytes(dataUri.slice(dataUri.indexOf(',') + 1));
}

const FINN_NETWORK_JPG = dataUriToBytes(finnNetworkJpg);

/** Standarddateien eines Hosts (absoluter Pfad -> Inhalt). Werden nicht mitgespeichert, solange unverändert. */
export function defaultFiles(): Record<string, FileContent> {
	return {
		[`${DEFAULT_DOCUMENT_ROOT}/${DIRECTORY_INDEX}`]: INDEX_HTML,
		[`${DEFAULT_DOCUMENT_ROOT}/style.css`]: STYLE_CSS,
		[`${DEFAULT_DOCUMENT_ROOT}/finn-network.jpg`]: FINN_NETWORK_JPG
	};
}

export function vhostIndexHtml(hostname: string, documentRoot: string): string {
	const name = escapeHtml(hostname);
	return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <title>${name}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #eef2f6; color: #1f2933; padding: 2rem 1rem; }
    main { max-width: 36rem; margin: 0 auto; padding: 1.5rem 2rem; background: #fff; border-radius: 12px; }
    h1 { margin-top: 0; color: #2b6cb0; }
  </style>
</head>
<body>
  <main>
    <h1>Willkommen auf ${name}</h1>
    <p>Diese Seite wird über einen virtuellen Host ausgeliefert.</p>
    <p>Die Datei liegt unter <code>${escapeHtml(documentRoot)}/${DIRECTORY_INDEX}</code>.</p>
  </main>
</body>
</html>
`;
}
