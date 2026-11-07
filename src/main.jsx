import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import routers from "./routes/Routes";
import { AuthProvider } from "./auth/AuthContext";
import "./index.css";
import { SocketProvider } from "./hooks/socketProvider/SocketContext";
import ChatLauncher from "./components/globalChatBox/ChatLauncher";
import UpdateChecker from "./components/update.checker/UpdateChecker";
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <SocketProvider>
        <RouterProvider router={routers} />
        <ChatLauncher />
        <UpdateChecker />
      </SocketProvider>
    </AuthProvider>
  </React.StrictMode>,
);
