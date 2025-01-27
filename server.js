const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3000;

app.use(express.static(__dirname));
app.use(express.static("public"));

wss.on("connection", (ws) => {
    console.log("A new client connected!");

    ws.send(JSON.stringify({ type: "system", content: "Welcome to the chat!" }));

    ws.on("message", (message) => {
        console.log("Received message:", message);

        try {
            const parsedMessage = JSON.parse(message);

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

server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});

