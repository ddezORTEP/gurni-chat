const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || SERVER_PORT;

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

// Store connected users
let onlineUsers = {};

// WebSocket server logic
wss.on("connection", (ws) => {
    console.log("A new client connected!");

    // Function to broadcast updated user list
    const broadcastUserList = () => {
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: "userList", users: onlineUsers }));
            }
        });
    };

    // Function to find a user's websocket
    const findUserWebsocket = (user) => {
        for (const client of wss.clients) {
             if (client.user === user) {
                 return client;
            }
        }
        return null;
    };

    ws.on("message", (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            console.log("Server Received:", parsedMessage);

            if (parsedMessage.type === "join") {
                onlineUsers[parsedMessage.user] = true;
                ws.user = parsedMessage.user;
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: "system",
                            content: `${parsedMessage.user} has joined the chat`,
                        }));
                    }
                });
                broadcastUserList();
                console.log(`${parsedMessage.user} joined`);
                return;
            }
            if (parsedMessage.type === "leave") {
                delete onlineUsers[parsedMessage.user];
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: "system",
                            content: `${parsedMessage.user} has left the chat`,
                        }));
                    }
                });
                broadcastUserList();
                console.log(`${parsedMessage.user} left`);
                return;
            }
            if (parsedMessage.type === "file") {
                const base64Regex = /^data:image\/(jpeg|png|gif);base64,/;
                if (!base64Regex.test(parsedMessage.content)) {
                    ws.send(JSON.stringify({ type: "system", content: "Error: Invalid file format. Only JPEG, PNG, and GIF are allowed." }));
                    return;
                }
            }
            if (parsedMessage.type === "ping") {
                  const recipientUser = parsedMessage.recipient.startsWith("@") ? parsedMessage.recipient.slice(1) : parsedMessage.recipient;
                 const recipient = findUserWebsocket(recipientUser);
                    if(recipient && recipient.readyState === WebSocket.OPEN){
                      console.log("Server Sending Ping to:", recipientUser, parsedMessage);
                      recipient.send(JSON.stringify({ //send the ping to the mentioned user only.
                           type: "ping",
                           user: parsedMessage.user,
                           content: parsedMessage.content,
                         }));
                        return;
                   }
                  console.log("Ping recipient not found or not open:", recipientUser);
                    return;
             }
             // Broadcast messages to all connected clients
              wss.clients.forEach((client) => {
               if (client.readyState === WebSocket.OPEN && parsedMessage.type !== "join" && parsedMessage.type !== "leave" && parsedMessage.type !== "ping") {
                   client.send(JSON.stringify(parsedMessage));
                }
          });
        } catch (error) {
            console.error("Failed to process message:", error);
            ws.send(JSON.stringify({ type: "system", content: "Error: Invalid message format." }));
        }
    });

   ws.on("close", () => {
          // Find the user that disconnected and remove it.
       let disconnectedUser;
        for (const user in onlineUsers) {
        if (onlineUsers.hasOwnProperty(user)) {
          if(onlineUsers[user] === true){
              wss.clients.forEach(client =>{
              if(client === ws){
                    disconnectedUser = user;
                    console.log(`Detected: ${user} disconnected`);
                    return;
                }
           })
          }
       }
     }
        if(disconnectedUser){
              delete onlineUsers[disconnectedUser];
                  wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: "system",
                            content: `${disconnectedUser} has left the chat`,
                        }));
                    }
                });
               broadcastUserList();
        }
          console.log("A client disconnected.");
    });

    ws.on("error", (error) => {
        console.error("WebSocket error:", error);
    });
    broadcastUserList();
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
