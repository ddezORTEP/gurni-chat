const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const { v4: uuidv4 } = require('uuid'); // For generating unique IDs

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.SERVER_PORT || 3000;

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

// Store connected users and chats
let onlineUsers = {};
let persistentChats = {};

// WebSocket server logic
wss.on("connection", (ws) => {
    console.log("A new client connected!");

    // Function to broadcast updated user list
    const broadcastUserList = (chatId) => {
        wss.clients.forEach((client) => {
           if (client.chatId === chatId && client.readyState === WebSocket.OPEN) {
                 client.send(JSON.stringify({ type: "userList", users: Object.fromEntries(Object.entries(onlineUsers).filter(([key,value]) => value === chatId)) }));
            }
       });
    };

    // Function to find a user's websocket
    const findUserWebsocket = (user, chatId) => {
        for (const client of wss.clients) {
           if (client.user === user && client.chatId === chatId) {
               return client;
           }
        }
       return null;
    };
 // Function to broadcast message history
    const broadcastMessageHistory = (ws, chatId) => {
    if (persistentChats[chatId] && persistentChats[chatId].messages) {
            ws.send(JSON.stringify({
            type: "history",
               messages: persistentChats[chatId].messages,
             }));
          }
        };

  const cleanupChat = (chatId) => {
     if(persistentChats[chatId]){
         console.log(`Deleting chat room ${chatId}`);
         delete persistentChats[chatId];
         wss.clients.forEach(client => {
              if(client.chatId === chatId){
                  client.send(JSON.stringify({
                      type: "system",
                      content: "This persistent chat has been deleted due to inactivity or age."
                 }));
                   client.chatId = null;
              }
           })
     }
 };

  ws.on("message", (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            console.log("Server Received:", parsedMessage);

             if (parsedMessage.type === "createChat") {
                const accessCode = uuidv4(); // Generate access code
                persistentChats[accessCode] = {
                    messages: [],
                    createdAt: Date.now(),
                       timer: setTimeout(() => cleanupChat(accessCode), 48 * 60 * 60 * 1000) // wipe chat after 48 hours
                };
                    ws.send(JSON.stringify({ type: "accessCode", accessCode: accessCode })); // send code to client to display
               console.log(`Chat Room Created ${accessCode}`);
               return;
             }
            if (parsedMessage.type === "join") {
               const { user, accessCode } = parsedMessage;
              ws.user = user; // Store user in websocket object
                 if (accessCode && persistentChats[accessCode]) {
                     ws.chatId = accessCode;
                      onlineUsers[parsedMessage.user] = accessCode
                   broadcastMessageHistory(ws, accessCode);
                   broadcastUserList(accessCode);
                       console.log(`${parsedMessage.user} joined persistent chat ${accessCode}`)
                 }
                else{
                     ws.chatId = "general";
                      onlineUsers[parsedMessage.user] = "general"
                       broadcastUserList("general");
                      console.log(`${parsedMessage.user} joined general chat`);
                 }
                // Broadcast join message to all clients in the chat
                wss.clients.forEach((client) => {
                  if(client.chatId === ws.chatId && client.readyState === WebSocket.OPEN){
                    client.send(JSON.stringify({
                        type: "system",
                         content: `${parsedMessage.user} has joined the chat`,
                   }));
                   }
                });

                return;
            }
              if (parsedMessage.type === "leave") {
                  delete onlineUsers[parsedMessage.user];
                  // Broadcast leave message to all clients
                  wss.clients.forEach((client) => {
                      if (client.chatId === ws.chatId && client.readyState === WebSocket.OPEN) {
                          client.send(JSON.stringify({
                              type: "system",
                             content: `${parsedMessage.user} has left the chat`,
                          }));
                      }
                   });
                     broadcastUserList(ws.chatId);
                      console.log(`${parsedMessage.user} left`);
                      return;
              }
           // Handle image uploads
           if (parsedMessage.type === "file") {
               const base64Regex = /^data:image\/(jpeg|png|gif);base64,/; // Validate JPEG, PNG, GIF
               if (!base64Regex.test(parsedMessage.content)) {
                 ws.send(JSON.stringify({ type: "system", content: "Error: Invalid file format. Only JPEG, PNG, and GIF are allowed." }));
                  return;
                }
           }
             if (parsedMessage.type === "ping") {
                  const recipientUser = parsedMessage.recipient.startsWith("@") ? parsedMessage.recipient.slice(1) : parsedMessage.recipient;
                    const recipient = findUserWebsocket(recipientUser,ws.chatId);
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
             // Handle user messages for persistent chats
           if (parsedMessage.type === "user" && ws.chatId && persistentChats[ws.chatId]) {
                persistentChats[ws.chatId].messages.push(parsedMessage);
             }
           // Broadcast messages to all connected clients
          wss.clients.forEach((client) => {
               if (client.readyState === WebSocket.OPEN && client.chatId === ws.chatId && parsedMessage.type !== "join" && parsedMessage.type !== "leave" && parsedMessage.type !== "ping") {
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
          if(onlineUsers[user] === ws.chatId){
              wss.clients.forEach(client =>{
               if(client === ws){
                   disconnectedUser = user;
                 console.log(`Detected: ${user} disconnected from ${ws.chatId}`);
                   return;
                 }
           })
          }
       }
     }
       if(disconnectedUser){
                delete onlineUsers[disconnectedUser];
                 // Broadcast leave message to all clients
                wss.clients.forEach((client) => {
                    if (client.chatId === ws.chatId && client.readyState === WebSocket.OPEN) {
                         client.send(JSON.stringify({
                             type: "system",
                           content: `${disconnectedUser} has left the chat`,
                       }));
                    }
               });
              broadcastUserList(ws.chatId);
        }
        
       console.log("A client disconnected.");
   });

   ws.on("error", (error) => {
        console.error("WebSocket error:", error);
  });
   
    if(ws.chatId){
        broadcastUserList(ws.chatId)
   }
    else{
         broadcastUserList("general");
   }
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
