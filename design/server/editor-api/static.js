import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = 8080;

// resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// THIS IS THE KEY LINE
const UI_ROOT = path.resolve(__dirname, '../../../retroverse-design');

// serve static files
app.use(express.static(UI_ROOT));

// explicit route (Safari likes this)
app.get('/editor.html', (req, res) => {
  res.sendFile(path.join(UI_ROOT, 'editor.html'));
});

app.listen(PORT, () => {
  console.log(`Editor UI running at http://localhost:${PORT}/editor.html`);
});
