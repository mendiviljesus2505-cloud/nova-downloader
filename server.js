const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const youtubedl = require('youtube-dl-exec');
const ffmpegPath = require('ffmpeg-static');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(cookieParser());
// Serve static files from 'public' directory
app.use(express.static('public'));

// --- Authentication Setup ---
const VALID_PASSWORD = 'admin2026';
const activeSessions = new Set();

const requireAuth = (req, res, next) => {
    const token = req.cookies.auth_token;
    if (token && activeSessions.has(token)) {
        return next();
    }
    return res.status(401).json({ error: 'No autorizado. Por favor inicia sesión.' });
};

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Demasiados intentos de inicio de sesión.' }
});

app.post('/api/login', loginLimiter, (req, res) => {
    const { password } = req.body;
    if (password === VALID_PASSWORD) {
        const token = crypto.randomBytes(32).toString('hex');
        activeSessions.add(token);
        // Cookie expires in 7 days
        res.cookie('auth_token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
        return res.json({ success: true });
    }
    return res.status(401).json({ error: 'Contraseña incorrecta' });
});

app.get('/api/check-auth', (req, res) => {
    const token = req.cookies.auth_token;
    if (token && activeSessions.has(token)) {
        return res.json({ authenticated: true });
    }
    return res.json({ authenticated: false });
});

app.post('/api/logout', (req, res) => {
    const token = req.cookies.auth_token;
    if (token) activeSessions.delete(token);
    res.clearCookie('auth_token');
    return res.json({ success: true });
});
// -----------------------------

// SSE Clients Map
const sseClients = new Map();

app.get('/api/progress', (req, res) => {
    const fileId = req.query.fileId;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    res.write(`data: {"status":"connected"}\n\n`);
    sseClients.set(fileId, res);
    
    req.on('close', () => {
        sseClients.delete(fileId);
    });
});

// Ensure temp directory exists
const tempDir = path.join(__dirname, 'temp_downloads');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

// Cleanup old files periodically (e.g. every hour, files older than 1 hour)
setInterval(() => {
    fs.readdir(tempDir, (err, files) => {
        if (err) return;
        const now = Date.now();
        files.forEach(file => {
            const filePath = path.join(tempDir, file);
            fs.stat(filePath, (err, stats) => {
                if (!err && now - stats.mtimeMs > 3600000) { // 1 hour
                    fs.unlink(filePath, () => {});
                }
            });
        });
    });
}, 3600000);

const infoLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { error: 'Has realizado demasiadas búsquedas. Intenta más tarde.' }
});

app.post('/api/info', infoLimiter, requireAuth, async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL requerida' });

        console.log(`[INFO] Obteniendo información de: ${url}`);
        
        let title, thumbnail, duration;
        let formats = [];

        if (url.includes('tiktok.com')) {
            // Using native fetch which is available in Node 18+
            const response = await globalThis.fetch('https://www.tikwm.com/api/?url=' + encodeURIComponent(url));
            const data = await response.json();
            
            if (data.code === 0) {
                title = data.data.title || 'Video de TikTok';
                thumbnail = data.data.cover;
                duration = data.data.duration + 's';
            } else {
                throw new Error('Error obteniendo info de TikTok API.');
            }
        } else {
            const options = {
                dumpSingleJson: true,
                noWarnings: true,
                noCheckCertificate: true,
                preferFreeFormats: true
            };
            
            // Auto-use cookies.txt if it exists to bypass bot detection
            const cookiesPath = path.join(__dirname, 'cookies.txt');
            if (fs.existsSync(cookiesPath)) {
                options.cookies = `"${cookiesPath}"`;
            }

            // Wrap in quotes to avoid cmd.exe failing on '&'
            const safeUrl = `"${url}"`;
            const info = await youtubedl(safeUrl, options);
            
            if (info._type === 'playlist') {
                title = info.title || 'Playlist sin título';
                thumbnail = info.thumbnails && info.thumbnails.length > 0 ? info.thumbnails[0].url : null;
                
                const entries = (info.entries || []).map(e => ({
                    title: e.title,
                    url: e.webpage_url || e.url,
                    duration: e.duration_string || e.duration || 'N/A'
                })).filter(e => e.title); // Filter out private/deleted videos that lack titles
                
                console.log(`[INFO] Playlist detectada: ${title} con ${entries.length} videos.`);
                
                return res.json({
                    isPlaylist: true,
                    title,
                    thumbnail,
                    entries
                });
            }

            title = info.title;
            thumbnail = info.thumbnail;
            duration = info.duration_string || info.duration || 'Desconocida';
            
            // Extract formats
            if (info.formats) {
                const videoFormats = info.formats.filter(f => f.vcodec !== 'none' && f.height);
                const seenHeights = new Set();
                videoFormats.sort((a, b) => b.height - a.height).forEach(f => {
                    if (!seenHeights.has(f.height)) {
                        seenHeights.add(f.height);
                        formats.push({
                            id: f.format_id,
                            label: `${f.height}p (${f.ext})`
                        });
                    }
                });
            }
        }

        console.log(`[INFO] Éxito al obtener información: ${title}`);

        res.json({
            title,
            thumbnail,
            duration,
            formats
        });
    } catch (error) {
        console.error('[ERROR] Error en info:', error.message || error);
        res.status(500).json({ error: 'No se pudo obtener información del video.' });
    }
});

const downloadLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 15,
    message: { error: 'Has alcanzado el límite de descargas concurrentes. Por favor, intenta de nuevo más tarde.' }
});

app.post('/api/download', downloadLimiter, requireAuth, async (req, res) => {
    try {
        const { url, type, platform, trimStart, trimEnd, fileId: reqFileId } = req.body;
        if (!url) return res.status(400).json({ error: 'URL requerida' });
        
        const isAudio = type === 'audio';
        const ext = isAudio ? 'mp3' : 'mp4';
        
        // Use provided fileId for SSE or generate one
        const fileId = reqFileId || `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const outputFilename = `${fileId}.%(ext)s`;
        const outputTemplate = path.join(tempDir, outputFilename);

        const options = {
            noWarnings: true,
            noCheckCertificate: true,
            ffmpegLocation: path.relative(process.cwd(), ffmpegPath),
            output: path.relative(process.cwd(), outputTemplate),
        };

        // Auto-use cookies.txt if it exists to bypass bot detection
        const cookiesPath = path.join(__dirname, 'cookies.txt');
        if (fs.existsSync(cookiesPath)) {
            options.cookies = `"${cookiesPath}"`;
        }

        if (isAudio) {
            options.format = 'bestaudio';
            options.extractAudio = true;
            options.audioFormat = 'mp3';
        } else {
            options.mergeOutputFormat = 'mp4';
            // Preferimos el codec H.264 (avc) para máxima compatibilidad y evitar errores de "HEVC no soportado" en Windows
            options.formatSort = 'vcodec:h264,res,acodec:m4a';
            
            if (type === 'best' || !type) {
                if (platform === 'tiktok' || platform === 'instagram' || platform === 'facebook') {
                    options.format = 'bestvideo+bestaudio/best';
                } else {
                    options.format = '"best[height<=720][ext=mp4]/bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best"';
                }
            } else {
                // For specific quality, fetch the chosen video id + best audio
                options.format = `"${type}+bestaudio/best"`;
            }
        }
        
        if (trimStart && trimEnd) {
            options.downloadSections = `*${trimStart}-${trimEnd}`;
            options.forceKeyframesAtCuts = true;
        }

        console.log(`[DOWNLOAD] Iniciando procesamiento temporal para: ${url}`);
        
        let actualFileId = fileId;
        
        if (url.includes('tiktok.com')) {
            // Bypass yt-dlp for TikTok due to recent API breakages, use tikwm instead
            const response = await globalThis.fetch('https://www.tikwm.com/api/?url=' + encodeURIComponent(url));
            const data = await response.json();
            
            if (data.code === 0) {
                const downloadUrl = isAudio ? data.data.music : data.data.play;
                if (!downloadUrl) throw new Error('Formato no encontrado en TikTok.');
                
                const vidRes = await globalThis.fetch(downloadUrl);
                if (!vidRes.ok) throw new Error('Error al descargar desde TikTok.');
                
                const buffer = await vidRes.arrayBuffer();
                const actualExt = isAudio ? 'mp3' : 'mp4';
                const directFilePath = path.join(tempDir, `${fileId}.${actualExt}`);
                fs.writeFileSync(directFilePath, Buffer.from(buffer));
            } else {
                throw new Error('Error en API de TikTok.');
            }
        } else {
            try {
                const safeUrl = `"${url}"`;
                const subprocess = youtubedl.exec(safeUrl, options);
                
                subprocess.stdout.on('data', (data) => {
                    const text = data.toString();
                    const match = text.match(/\[download\]\s+([\d\.]+)%\s+of\s+.*?\s+at\s+(.*?)\s+ETA\s+(.*)/);
                    if (match) {
                        const percent = match[1] + '%';
                        const speed = match[2];
                        const eta = match[3];
                        const client = sseClients.get(fileId);
                        if (client) {
                            client.write(`data: ${JSON.stringify({ status: 'downloading', percent, speed, eta })}\n\n`);
                        }
                    }
                });

                await subprocess;
            } catch (ydlErr) {
                console.warn(`[WARNING] yt-dlp arrojó un error (posible WinError 32), comprobando si el archivo temp existe...`);
                // Uncomment to debug if needed:
                console.error(ydlErr.message);
            }
        }
        
        // Finish SSE connection
        const client = sseClients.get(fileId);
        if (client) {
            client.write(`data: ${JSON.stringify({ status: 'completed' })}\n\n`);
            client.end();
            sseClients.delete(fileId);
        }
        
        // yt-dlp might replace %(ext)s with mkv or webm or mp4, we need to find the actual file it created
        let filesInDir = fs.readdirSync(tempDir);
        let createdFile = filesInDir.find(f => f.startsWith(fileId) && !f.includes('.temp.') && !f.endsWith('.part') && !f.endsWith('.ytdl'));
        
        if (!createdFile) {
            // Check if there is a .temp. file we can rename due to WinError 32
            const tempFile = filesInDir.find(f => f.startsWith(fileId) && f.includes('.temp.'));
            if (tempFile) {
                const finalName = tempFile.replace('.temp.', '.');
                try {
                    // Wait 1.5 seconds for the AV lock to release
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    fs.renameSync(path.join(tempDir, tempFile), path.join(tempDir, finalName));
                    createdFile = finalName;
                    console.log(`[DOWNLOAD] Archivo .temp renombrado manualmente con éxito a ${finalName}`);
                } catch (renameErr) {
                    console.error('[ERROR] No se pudo renombrar el archivo temporal:', renameErr);
                    throw new Error('El archivo quedó bloqueado por el sistema y no se pudo procesar.');
                }
            } else {
                throw new Error('El archivo no se generó correctamente en el servidor.');
            }
        }

        console.log(`[DOWNLOAD] Procesamiento completado. Archivo temporal: ${createdFile}`);
        
        // Return a URL where the browser can fetch the actual file
        res.json({ 
            message: `Procesamiento exitoso. Iniciando descarga...`,
            downloadUrl: `/api/download-file?file=${encodeURIComponent(createdFile)}`
        });
        
    } catch (error) {
        console.error('[ERROR] Error download:', error);
        res.status(500).json({ error: 'Error procesando el archivo en el servidor.' });
    }
});

// Endpoint to serve the file and delete it immediately after transfer
app.get('/api/download-file', (req, res) => {
    const fileName = req.query.file;
    if (!fileName) return res.status(400).send('Archivo no especificado');
    
    // Security check to prevent directory traversal
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
        return res.status(403).send('Petición inválida');
    }

    const filePath = path.join(tempDir, fileName);
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('Archivo expirado o no encontrado');
    }

    // Set headers for download
    res.download(filePath, fileName, (err) => {
        if (err) {
            console.error('[ERROR] Error enviando archivo al cliente:', err);
        } else {
            console.log(`[INFO] Archivo enviado con éxito y eliminado: ${fileName}`);
        }
        
        // Cleanup: delete the file from the server immediately after download finishes or fails
        fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr && unlinkErr.code !== 'ENOENT') {
                console.error(`[ERROR] No se pudo eliminar el archivo temporal: ${unlinkErr}`);
            }
        });
    });
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
