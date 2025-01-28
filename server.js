const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, "public")));

// Serve the landing page at "/"
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Serve the chat page at "/chat"
app.get("/chat", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "chat.html"));
});

// WebSocket server logic
wss.on("connection", (ws) => {
    console.log("A new client connected!");

    ws.on("message", (message) => {
        try {
            const parsedMessage = JSON.parse(message);

            // Handle image uploads
            if (parsedMessage.type === "file") {
                const base64Regex = /^data:image\/(jpeg|png|gif);base64,/; // Validate JPEG, PNG, GIF
                if (!base64Regex.test(parsedMessage.content)) {
                    ws.send(JSON.stringify({ type: "system", content: "Error: Invalid file format. Only JPEG, PNG, and GIF are allowed." }));
                    return;
                }
            }

            // Broadcast messages to all connected clients
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(parsedMessage));
                }
            });
        } catch (error) {
            console.error("Failed to process message:", error);
            ws.send(JSON.stringify({ type: "system", content: "Error: Invalid message format." }));
        }
    });

    ws.on("close", () => {
        console.log("A client disconnected.");
    });

    ws.on("error", (error) => {
        console.error("WebSocket error:", error);
    });
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});

