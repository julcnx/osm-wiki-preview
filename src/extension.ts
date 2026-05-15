import * as vscode from 'vscode';
import * as https from 'https';
import * as querystring from 'querystring';

let panel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  const command = vscode.commands.registerCommand('osm-wiki-preview.preview', async (uri?: vscode.Uri) => {
    let doc: vscode.TextDocument;
    if (uri) {
      doc = await vscode.workspace.openTextDocument(uri);
    } else {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor.');
        return;
      }
      doc = editor.document;
    }
    openPreview(doc, context);
  });

  const onSave = vscode.workspace.onDidSaveTextDocument((doc) => {
    if (panel && doc.fileName.endsWith('.wiki')) {
      renderDoc(doc);
    }
  });

  context.subscriptions.push(command, onSave);
}

function openPreview(doc: vscode.TextDocument, context: vscode.ExtensionContext) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
  } else {
    panel = vscode.window.createWebviewPanel(
      'osmWikiPreview',
      'Wiki Preview',
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );
    panel.onDidDispose(() => { panel = undefined; }, null, context.subscriptions);
  }
  renderDoc(doc);
}

function renderDoc(doc: vscode.TextDocument) {
  if (!panel) return;
  panel.webview.html = loadingHtml();

  const body = querystring.stringify({
    action: 'parse',
    format: 'json',
    text: doc.getText(),
    contentmodel: 'wikitext',
    origin: '*',
  });

  const options: https.RequestOptions = {
    hostname: 'wiki.openstreetmap.org',
    path: '/w/api.php',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        const html: string = json?.parse?.text?.['*'];
        if (!html) {
          throw new Error('Unexpected API response: ' + data.slice(0, 200));
        }
        if (panel) {
          panel.webview.html = wrapHtml(html);
        }
      } catch (e) {
        if (panel) {
          panel.webview.html = errorHtml(String(e));
        }
      }
    });
  });

  req.on('error', (e) => {
    if (panel) {
      panel.webview.html = errorHtml(e.message);
    }
  });

  req.write(body);
  req.end();
}

function loadingHtml(): string {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2em">
    <p>Loading...</p>
  </body></html>`;
}

function errorHtml(message: string): string {
  const escaped = message.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2em;color:#c00">
    <strong>Error:</strong><pre>${escaped}</pre>
  </body></html>`;
}

function wrapHtml(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src https://wiki.openstreetmap.org 'unsafe-inline'; img-src https:; font-src https:;">
  <link rel="stylesheet" href="https://wiki.openstreetmap.org/w/load.php?lang=en&modules=codex-search-styles%7Cext.OsmWikibase-all%7Cext.discussionTools.init.styles%7Cext.uls.pt%7Cext.visualEditor.desktopArticleTarget.noscript%7Cmediawiki.widgets.styles%7Coojs-ui-core.icons%2Cstyles%7Coojs-ui.styles.icons-interactions%2Cindicators%7Cskins.vector.styles.legacy&only=styles&skin=vector">
  <link rel="stylesheet" href="https://wiki.openstreetmap.org/w/load.php?lang=en&modules=site.styles&only=styles&skin=vector">
  <style>
    body {
      padding: 1em 2em;
      background: #fff;
      color: #202122;
      font-family: Linux Libertine, Georgia, Times, serif;
    }
    a { color: #3366cc; }
  </style>
</head>
<body class="mediawiki ltr sitedir-ltr">
${content}
</body>
</html>`;
}

export function deactivate() {}
