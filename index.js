import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import express from "express";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile() {
    const envPath = path.resolve(__dirname, ".env");
    if (!fs.existsSync(envPath)) return;

    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const [rawKey, ...rawValueParts] = trimmed.split("=");
        if (!rawKey) continue;

        const key = rawKey.trim();
        const value = rawValueParts.join("=").trim().replace(/^['"]|['"]$/g, "");

        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
}

loadEnvFile();

async function main() {
    const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const genai = apiKey ? new GoogleGenAI({ apiKey }) : null;
    const app = express();
    const PORT = Number(process.env.PORT) || 3000;

    if (!apiKey) {
        console.warn("Google GenAI API key is missing. Set GOOGLE_GENAI_API_KEY in the .env file or environment.");
    }

    app.use(express.static(path.resolve(__dirname, "public")));

    function startServer(port) {
        const server = http.createServer(app);
        const io = new Server(server, {
            cors: {
                origin: "*",
            },
        });

        io.on("connection", (socket) => {
            console.log("User connected:", socket.id);

            socket.on("aiMassage", async (prompt) => {
                try {
                    if (!genai) {
                        throw new Error("Google GenAI API key is missing.");
                    }

                    const response = await genai.models.generateContent({
                        model: "gemini-2.5-flash",
                        contents: prompt,
                    });

                    const text = response?.text || response?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("") || "No response received from Gemini.";

                    socket.emit("aiResponse", {
                        text,
                        sentAt: new Date().toLocaleTimeString(),
                    });
                } catch (error) {
                    console.error("Gemini request failed:", error);
                    socket.emit("aiResponse", {
                        text: `AI error: ${error.message || "Unknown error"}`,
                        sentAt: new Date().toLocaleTimeString(),
                    });
                }
            });

            socket.on("disconnect", () => {
                console.log("User disconnected:", socket.id);
            });
        });

        server.on("error", (error) => {
            if (error.code === "EADDRINUSE") {
                console.warn(`Port ${port} is busy. Trying ${port + 1}...`);
                startServer(port + 1);
                return;
            }

            console.error("Server error:", error);
            process.exit(1);
        });

        server.listen(port, () => {
            console.log(`Server running at http://localhost:${port}`);
        });
    }

    startServer(PORT);
}

main();
