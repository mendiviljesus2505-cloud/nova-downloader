const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const youtubedl = require('youtube-dl-exec');
const ffmpegPath = require('ffmpeg-static');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

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

app.post('/api/login', (req, res) => {
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

app.post('/api/info', requireAuth, async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL requerida' });

        console.log(`[INFO] Obteniendo información de: ${url}`);
        
        let title, thumbnail, duration;

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
            // Wrap URL in quotes to prevent CMD from splitting on '&'
            const safeUrl = `"${url}"`;
            const info = await youtubedl(safeUrl, {
                dumpSingleJson: true,
                noWarnings: true,
                noCheckCertificate: true,
                preferFreeFormats: true,
                noPlaylist: true
            });
            title = info.title;
            thumbnail = info.thumbnail;
            duration = info.duration_string || info.duration || 'Desconocida';
        }

        console.log(`[INFO] Éxito al obtener información: ${title}`);

        res.json({
            title,
            thumbnail,
            duration
        });
    } catch (error) {
        console.error('[ERROR] Error en info:', error.message || error);
        res.status(500).json({ error: 'No se pudo obtener información del video.' });
    }
});

app.post('/api/download', requireAuth, async (req, res) => {
    try {
        const { url, type, platform } = req.body;
        if (!url) return res.status(400).json({ error: 'URL requerida' });
        
        const isAudio = type === 'audio';
        const ext = isAudio ? 'mp3' : 'mp4';
        
        // Generate a unique file ID for this download
        const fileId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const outputFilename = `${fileId}.%(ext)s`;
        const outputTemplate = path.join(tempDir, outputFilename);

        const options = {
            noWarnings: true,
            noCheckCertificate: true,
            ffmpegLocation: `"${ffmpegPath}"`,
            output: `"${outputTemplate}"`,
        };

        if (isAudio) {
            options.format = 'bestaudio';
            options.extractAudio = true;
            options.audioFormat = 'mp3';
        } else {
            options.mergeOutputFormat = 'mp4';
            // Preferimos el codec H.264 (avc) para máxima compatibilidad y evitar errores de "HEVC no soportado" en Windows
            options.formatSort = 'vcodec:h264,res,acodec:m4a';
            
            if (platform === 'tiktok' || platform === 'instagram' || platform === 'facebook') {
                // Para redes sociales cortas, descargar la mejor calidad sin límite
                // yt-dlp ya descarga sin marca de agua por defecto para TikTok
                options.format = 'bestvideo+bestaudio/best';
            } else {
                // Evaluamos todos los casos posibles para asegurar que el sistema fluya sin errores:
                options.format = 'best[height<=720][ext=mp4]/bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best';
            }
            options.concurrentFragments = 4;
        }

        console.log(`[DOWNLOAD] Iniciando procesamiento temporal para: ${url}`);
        
        const safeUrl = `"${url}"`;
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
            await youtubedl(safeUrl, options);
        }
        
        // yt-dlp might replace %(ext)s with mkv or webm or mp4, we need to find the actual file it created
        const filesInDir = fs.readdirSync(tempDir);
        const createdFile = filesInDir.find(f => f.startsWith(fileId));
        
        if (!createdFile) {
            throw new Error('El archivo no se generó correctamente en el servidor.');
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
