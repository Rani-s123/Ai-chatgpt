// Load environment variables first
const express = require('express');
const { Configuration, OpenAIApi } = require("openai");
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();
const app = express();

// Check for API key presence
if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY is not defined in the .env file");
    process.exit(1);
}

// Configure OpenAI
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Middleware
app.use(cors());
app.use(express.json());
app.use('/', express.static(path.join(__dirname, 'client'))); // Serve static files

// Ensure 'uploads' directory exists
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// File upload configuration
const upload = multer({
    storage: multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, 'uploads/');
        },
        filename: function (req, file, cb) {
            const extension = path.extname(file.originalname);
            cb(null, uuidv4() + extension);
        }
    }),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: function (req, file, cb) {
        const allowedExtensions = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm'];
        const extension = path.extname(file.originalname).toLowerCase();
        if (allowedExtensions.includes(extension)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type.'));
        }
    }
});

// Transcription endpoint
app.post('/transcribe', upload.single('audio'), async (req, res) => {
    try {
        const filePath = req.file.path;

        const response = await openai.createTranscription(
            fs.createReadStream(filePath),
            "whisper-1",
            undefined,
            'text'
        );

        res.send(response.data.text);
    } catch (error) {
        console.error("Transcription error:", error.response?.data || error.message);
        res.status(500).send({ error: error.response?.data?.error || error.message });
    } finally {
        if (req.file && req.file.path) {
            fs.unlinkSync(req.file.path); // Clean up uploaded file
        }
    }
});

// Prompt handler endpoint
app.post('/get-prompt-result', async (req, res) => {
    const { prompt, model = 'gpt' } = req.body;

    if (!prompt) {
        return res.status(400).send({ error: 'Prompt is missing in the request' });
    }

    try {
        if (model === 'image') {
            const result = await openai.createImage({
                prompt,
                response_format: 'url',
                size: '512x512'
            });
            return res.send(result.data.data[0].url);
        }

        if (model === 'chatgpt') {
            const result = await openai.createChatCompletion({
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }]
            });
            return res.send(result.data.choices[0]?.message?.content);
        }

        // Default to text completion
        const completion = await openai.createCompletion({
            model: 'text-davinci-003',
            prompt: `Please reply to the following in markdown format:\n${prompt}`,
            max_tokens: 1000
        });

        res.send(completion.data.choices[0].text);
    } catch (error) {
        console.error("Prompt error:", error.response?.data || error.message);
        res.status(500).send({ error: error.response?.data?.error || error.message });
    }
});

// Start server
const port = process.env.PORT || 3001;
app.listen(port, () => {
    console.log(`🚀 Server is running at http://localhost:${port}`);
});
