const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000; // Use environment variable or default to 3000

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, "public")));

// Handle root request to serve the chat interface
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// WebSocket connection handling
wss.on("connection", (ws) => {
    console.log("A new client connected!");

    ws.send(JSON.stringify({ type: "system", content: "Welcome to the chat!" }));

    ws.on("message", (message) => {
        console.log("Received message:", message);

        try {
            const parsedMessage = JSON.parse(message);

            // Allow only image uploads and text messages
            if (parsedMessage.type === "file") {
                const isValidImage = parsedMessage.filename.match(/\.(jpg|jpeg|png|gif)$/i);
                if (!isValidImage) {
                    ws.send(JSON.stringify({ type: "system", content: "Error: Only image uploads are allowed." }));
                    return;
                }
            }

            // Check for replies
            if (parsedMessage.replyTo) {
                parsedMessage.content = `Replying to User ${parsedMessage.replyTo.user}: "${parsedMessage.replyTo.content}"\n${parsedMessage.content}`;
            }

            // Broadcast the message to all connected clients
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

